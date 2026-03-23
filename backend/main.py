"""
FastAPI Application — main entry point.
Mounts all routers, CORS, rate limiting, WebSocket, seed data.
"""

import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select

from config import settings
from database import engine, Base, async_session
from models import Agent, Setting, CannedResponse
from middleware.auth import hash_password, decode_token
from services.websocket_manager import ws_manager

# ── Routers ───────────────────────────────────────────────────
from routers import auth, agents, conversations, widget, webhook, admin

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Rate Limiter ──────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)


# ── Seed Data ─────────────────────────────────────────────────
async def seed_data():
    """Insert seed data on first boot."""
    async with async_session() as db:
        try:
            result = await db.execute(select(Agent).limit(1))
            if result.scalar_one_or_none() is not None:
                return  # Data already seeded

            api_key = f"sk_{secrets.token_hex(32)}"

            admin_agent = Agent(
                name="Admin",
                email="admin@example.com",
                password_hash=hash_password("admin123"),
                role="admin",
                status="offline",
                max_chats=10,
                api_key=api_key,
            )
            db.add(admin_agent)

            # Default canned responses
            canned = [
                CannedResponse(
                    shortcut="/hi",
                    title="Greeting",
                    content="Hi there! How can I help you today?",
                ),
                CannedResponse(
                    shortcut="/wait",
                    title="Please Wait",
                    content="Please hold on while I look into this for you.",
                ),
                CannedResponse(
                    shortcut="/transfer",
                    title="Transferring",
                    content="I'm transferring you to a specialist who can better assist you.",
                ),
                CannedResponse(
                    shortcut="/bye",
                    title="Goodbye",
                    content="Thank you for contacting us! Have a great day!",
                ),
                CannedResponse(
                    shortcut="/resolve",
                    title="Resolving",
                    content="Is there anything else I can help you with before I close this chat?",
                ),
            ]
            for c in canned:
                db.add(c)

            # Default settings
            default_settings = [
                Setting(key="auto_assign", value="true"),
                Setting(key="welcome_message", value="Thank you for reaching out! An agent will be with you shortly."),
                Setting(key="away_message", value="We're currently offline. We'll get back to you as soon as possible."),
                Setting(key="resolved_message", value="This conversation has been resolved. Feel free to reach out again if you need help!"),
                Setting(key="business_name", value="Support"),
            ]
            for s in default_settings:
                db.add(s)

            await db.commit()

            logger.info("=" * 60)
            logger.info("  SEED DATA CREATED")
            logger.info(f"  Admin: admin@example.com / admin123")
            logger.info(f"  API Key: {api_key}")
            logger.info("=" * 60)

        except Exception as e:
            logger.error(f"Failed to seed data: {e}")
            await db.rollback()


# ── Lifespan ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables + seed
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_data()
    yield
    # Shutdown
    await engine.dispose()


# ── App Factory ───────────────────────────────────────────────
app = FastAPI(
    title="WhatsApp Multi-Agent Support",
    version="2.0.0",
    lifespan=lifespan,
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Mount routers
app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(conversations.router)
app.include_router(widget.router)
app.include_router(webhook.router)
app.include_router(admin.router)


# ── Health Check ──────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}


# ── WebSocket Endpoint ───────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Agent dashboard WebSocket.
    1. Client connects
    2. Client sends { type: 'auth', token: '<jwt>' }
    3. Server validates, registers, responds
    """
    # Accept first, then wait for auth
    await websocket.accept()

    agent_id = None
    try:
        # Wait for auth frame (10 second timeout)
        auth_data = await websocket.receive_json()
        if auth_data.get("type") != "auth" or not auth_data.get("token"):
            await websocket.send_json({"type": "auth:error", "detail": "Auth frame required"})
            await websocket.close()
            return

        try:
            payload = decode_token(auth_data["token"])
            agent_id = payload.get("sub")
        except Exception:
            await websocket.send_json({"type": "auth:error", "detail": "Invalid token"})
            await websocket.close()
            return

        if not agent_id:
            await websocket.send_json({"type": "auth:error", "detail": "Invalid token"})
            await websocket.close()
            return

        # Register connection (ws already accepted, so we register directly)
        if agent_id not in ws_manager._connections:
            ws_manager._connections[agent_id] = []
        ws_manager._connections[agent_id].append(websocket)

        logger.info(f"Agent {agent_id} WebSocket authenticated")

        # Set agent online
        async with async_session() as db:
            result = await db.execute(select(Agent).where(Agent.id == agent_id))
            agent = result.scalar_one_or_none()
            if agent:
                agent.status = "online"
                await db.commit()

        # Send auth success
        await websocket.send_json({"type": "auth:success", "agent_id": agent_id})

        # Broadcast agent status
        await ws_manager.broadcast_except(agent_id, {
            "type": "agent:status",
            "agent_id": agent_id,
            "status": "online",
        })

        # Send queue count
        async with async_session() as db:
            from sqlalchemy import func
            result = await db.execute(
                select(func.count()).select_from(
                    select(Agent.id).where(Agent.status == "pending").subquery()
                )
            )
            from models.conversation import Conversation
            pending_result = await db.execute(
                select(func.count(Conversation.id)).where(Conversation.status == "pending")
            )
            pending_count = pending_result.scalar() or 0

        await websocket.send_json({"type": "queue:update", "count": pending_count})

        # Listen for messages from the agent
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "typing":
                # Optional: broadcast typing indicator
                conv_id = data.get("conversation_id")
                if conv_id:
                    await ws_manager.broadcast_except(agent_id, {
                        "type": "typing",
                        "agent_id": agent_id,
                        "conversation_id": conv_id,
                    })

    except WebSocketDisconnect:
        logger.info(f"Agent {agent_id} disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        if agent_id:
            fully_disconnected = ws_manager.disconnect(agent_id, websocket)
            if fully_disconnected:
                # Set agent offline
                async with async_session() as db:
                    result = await db.execute(select(Agent).where(Agent.id == agent_id))
                    agent = result.scalar_one_or_none()
                    if agent:
                        agent.status = "offline"
                        await db.commit()

                await ws_manager.broadcast_all({
                    "type": "agent:status",
                    "agent_id": agent_id,
                    "status": "offline",
                })
