"""
FastAPI Application — main entry point.
Mounts all routers, CORS, rate limiting, WebSocket, seed data.
"""

import logging
import secrets
from datetime import datetime, timezone
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select

from config import settings
from database import engine, Base, async_session
from models import Tenant, Agent, Setting, CannedResponse, Conversation, Message
from middleware.auth import hash_password, decode_token, validate_ws_ticket
from rate_limiter import limiter
from services.websocket_manager import ws_manager

# ── Routers ───────────────────────────────────────────────────
from routers import auth, agents, conversations, widget, webhook, admin
from routers import superadmin, admin_subtenants, admin_contacts, admin_templates, admin_broadcasts, admin_groups

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ── Seed Data ─────────────────────────────────────────────────
async def seed_data():
    """Insert seed data on first boot — creates default tenant, admin, canned, settings."""
    async with async_session() as db:
        try:
            # Check if already seeded
            result = await db.execute(select(Tenant).limit(1))
            if result.scalar_one_or_none() is not None:
                return

            # 1. Create default tenant
            widget_key = f"wk_{secrets.token_hex(24)}"
            default_tenant = Tenant(
                name="Default",
                slug="default",
                max_agents=50,
                max_chats_per_agent=10,
                widget_api_key=widget_key,
            )
            db.add(default_tenant)
            await db.flush()

            tenant_id = default_tenant.id
            api_key = f"sk_{secrets.token_hex(32)}"

            # Generate secure random passwords (displayed once in logs)
            admin_password = secrets.token_urlsafe(16)
            superadmin_password = secrets.token_urlsafe(16)

            # 2. Create admin agent
            admin_agent = Agent(
                name="Admin",
                email="admin@example.com",
                password_hash=hash_password(admin_password),
                role="admin",
                status="offline",
                max_chats=10,
                api_key=api_key,
                tenant_id=tenant_id,
            )
            db.add(admin_agent)

            # 3. Create superadmin agent
            sa_key = f"sk_{secrets.token_hex(32)}"
            superadmin_agent = Agent(
                name="Super Admin",
                email="superadmin@system.local",
                password_hash=hash_password(superadmin_password),
                role="superadmin",
                status="offline",
                max_chats=0,
                api_key=sa_key,
                tenant_id=tenant_id,
            )
            db.add(superadmin_agent)

            # 4. Default canned responses
            canned = [
                CannedResponse(shortcut="/hi", title="Greeting",
                               content="Hi there! How can I help you today?", tenant_id=tenant_id),
                CannedResponse(shortcut="/wait", title="Please Wait",
                               content="Please hold on while I look into this for you.", tenant_id=tenant_id),
                CannedResponse(shortcut="/transfer", title="Transferring",
                               content="I'm transferring you to a specialist who can better assist you.", tenant_id=tenant_id),
                CannedResponse(shortcut="/bye", title="Goodbye",
                               content="Thank you for contacting us! Have a great day!", tenant_id=tenant_id),
                CannedResponse(shortcut="/resolve", title="Resolving",
                               content="Is there anything else I can help you with before I close this chat?", tenant_id=tenant_id),
            ]
            for c in canned:
                db.add(c)

            # 5. Default settings
            default_settings = [
                Setting(key="auto_assign", value="true", tenant_id=tenant_id),
                Setting(key="welcome_message", value="Thank you for reaching out! An agent will be with you shortly.", tenant_id=tenant_id),
                Setting(key="away_message", value="We're currently offline. We'll get back to you as soon as possible.", tenant_id=tenant_id),
                Setting(key="resolved_message", value="This conversation has been resolved. Feel free to reach out again if you need help!", tenant_id=tenant_id),
                Setting(key="business_name", value="Support", tenant_id=tenant_id),
            ]
            for s in default_settings:
                db.add(s)

            # 6. Sample conversation + message
            sample_conv = Conversation(
                id="conv-seed-001",
                tenant_id=tenant_id,
                channel="whatsapp",
                customer_name="Sample User",
                customer_phone="1234567890",
                status="pending",
                last_message_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )
            db.add(sample_conv)
            await db.flush()

            sample_msg = Message(
                conversation_id=sample_conv.id,
                tenant_id=tenant_id,
                sender_type="customer",
                content="Hello! Is anyone available to help me with my order?",
                content_type="text",
            )
            db.add(sample_msg)

            await db.commit()

            logger.info("=" * 60)
            logger.info(" SEED DATA CREATED")
            logger.info(f" Tenant: default (id={tenant_id})")
            logger.info(f" Admin: admin@example.com / {admin_password}")
            logger.info(f" Superadmin: superadmin@system.local / {superadmin_password}")
            logger.info(f" API Key: {api_key}")
            logger.info(f" Widget Key: {widget_key}")
            logger.info("=" * 60)

        except Exception as e:
            logger.error(f"Failed to seed data: {e}")
            await db.rollback()
            raise e


async def auto_suspend_trials():
    """Background task to suspend tenants whose trials have expired."""
    while True:
        try:
            async with async_session() as db:
                now = datetime.now(timezone.utc).replace(tzinfo=None)
                result = await db.execute(
                    select(Tenant).where(
                        Tenant.billing_status == "trial",
                        Tenant.trial_ends_at != None,
                        Tenant.trial_ends_at < now,
                        Tenant.is_active == True
                    )
                )
                expired_tenants = result.scalars().all()
                for t in expired_tenants:
                    t.billing_status = "suspended"
                    logger.info(f"Auto-suspended tenant '{t.name}' (trial expired on {t.trial_ends_at})")
                
                if expired_tenants:
                    await db.commit()
        except Exception as e:
            logger.error(f"Error in auto_suspend_trials: {e}")
        
        # Check every 6 hours
        await asyncio.sleep(60 * 60 * 6)

# ── Lifespan ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Safety check: reject default JWT secret in production
    if settings.ENVIRONMENT == "production":
        if settings.JWT_SECRET in ("change-me-in-production-use-a-long-random-string", "", None):
            raise RuntimeError("CRITICAL: JWT_SECRET must be set in production!")
        # In production, use Alembic migrations only - don't auto-create tables
        logger.info("Production mode: skipping auto table creation (use Alembic migrations)")
    else:
        # Development: auto-create tables for convenience
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            logger.info("Development mode: Database tables auto-created")

    await seed_data()
    
    from services.setting_service import global_settings
    await global_settings.reload_cache()
    
    task = asyncio.create_task(auto_suspend_trials())
    
    yield
    task.cancel()
    await engine.dispose()


# ── App Factory ───────────────────────────────────────────────
app = FastAPI(
    title="WhatsApp Multi-Agent Support",
    version="3.0.0",
    lifespan=lifespan,
)

# ── Widget CORS — allows any origin for embeddable widget endpoints ──
class WidgetCORSMiddleware(BaseHTTPMiddleware):
    """Widget and webhook endpoints must be callable from any origin."""
    OPEN_PREFIXES = ("/api/v1/widget", "/ws/widget", "/webhook")

    async def dispatch(self, request: Request, call_next):
        if any(request.url.path.startswith(p) for p in self.OPEN_PREFIXES):
            origin = request.headers.get("origin", "*")
            if request.method == "OPTIONS":
                return Response(status_code=200, headers={
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
                    "Access-Control-Max-Age": "86400",
                })
            response = await call_next(request)
            response.headers["Access-Control-Allow-Origin"] = origin
            return response
        return await call_next(request)

# Middleware (Starlette LIFO: last-added wraps outermost, so WidgetCORS must be added AFTER)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(WidgetCORSMiddleware)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

from routers.admin_groups import router as admin_groups_router
from routers.admin_subtenants import router as admin_subtenants_router
from routers.superadmin import router as superadmin_router
from routers.payments import router as payments_router

app.include_router(auth.router)
app.include_router(webhook.router)
app.include_router(conversations.router)
app.include_router(agents.router)
app.include_router(widget.router)
app.include_router(admin.router)
app.include_router(admin_contacts.router)
app.include_router(admin_broadcasts.router)
app.include_router(admin_templates.router)
app.include_router(admin_groups_router)
app.include_router(admin_subtenants_router)
app.include_router(superadmin_router)
app.include_router(payments_router)


# ── Health Check ──────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}


# ── WebSocket Endpoint ───────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Agent dashboard WebSocket.
    Supports two auth methods:
    1. { type: 'auth', token: '<jwt>' }
    2. { type: 'auth', ticket: '<ws_ticket>' }
    """
    await websocket.accept()

    agent_id = None
    try:
        auth_data = await websocket.receive_json()
        if auth_data.get("type") != "auth":
            await websocket.send_json({"type": "auth:error", "detail": "Auth frame required"})
            await websocket.close()
            return

        # Try ticket auth first, then JWT
        ticket = auth_data.get("ticket")
        token = auth_data.get("token")

        if ticket:
            agent_id = validate_ws_ticket(ticket)
        elif token:
            try:
                payload = decode_token(token)
                agent_id = payload.get("sub")
            except Exception:
                pass

        if not agent_id:
            await websocket.send_json({"type": "auth:error", "detail": "Invalid credentials"})
            await websocket.close()
            return

        # Register connection
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

        await websocket.send_json({"type": "auth:success", "agent_id": agent_id})

        await ws_manager.broadcast_except(agent_id, {
            "type": "agent:status",
            "agent_id": agent_id,
            "status": "online",
        })

        # Send queue count — scoped to this agent's tenant
        async with async_session() as db:
            from sqlalchemy import func
            from models.conversation import Conversation
            result2 = await db.execute(select(Agent).where(Agent.id == agent_id))
            _agent = result2.scalar_one_or_none()
            tenant_filter = [Conversation.status == "pending"]
            if _agent and _agent.tenant_id:
                tenant_filter.append(Conversation.tenant_id == _agent.tenant_id)
            pending_result = await db.execute(
                select(func.count(Conversation.id)).where(*tenant_filter)
            )
            pending_count = pending_result.scalar() or 0

        await websocket.send_json({"type": "queue:update", "count": pending_count})

        # Listen for messages
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "typing":
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


# ── Widget WebSocket Endpoint ────────────────────────────────
@app.websocket("/ws/widget/{conversation_id}")
async def widget_websocket_endpoint(websocket: WebSocket, conversation_id: str):
    """
    Widget WebSocket — allows real-time messaging for embedded chat widgets.
    Auth via `key` query param (widget_api_key).
    """
    key = websocket.query_params.get("key", "")
    if not key:
        await websocket.close(code=4001, reason="Missing key parameter")
        return

    # Validate key and conversation ownership
    async with async_session() as db:
        result = await db.execute(
            select(Tenant).where(Tenant.widget_api_key == key, Tenant.is_active == True)
        )
        tenant = result.scalar_one_or_none()
        if not tenant:
            await websocket.close(code=4003, reason="Invalid widget key")
            return

        conv_result = await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.tenant_id == tenant.id,
            )
        )
        conv = conv_result.scalar_one_or_none()
        if not conv:
            await websocket.close(code=4004, reason="Conversation not found")
            return

    await websocket.accept()
    await ws_manager.connect_widget(conversation_id, websocket)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "typing":
                # Broadcast customer typing to agents
                await ws_manager.broadcast_all({
                    "type": "typing",
                    "conversation_id": conversation_id,
                    "sender_type": "customer",
                })

            elif msg_type == "message":
                # Customer sends a message via WS
                content = (data.get("content") or "").strip()
                if not content or len(content) > 4096:
                    continue

                from datetime import datetime, timezone
                from models import Message
                from services.conversation_service import ConversationService

                async with async_session() as db:
                    conv_result = await db.execute(
                        select(Conversation).where(Conversation.id == conversation_id)
                    )
                    conv = conv_result.scalar_one_or_none()
                    if not conv:
                        continue

                    msg = Message(
                        conversation_id=conversation_id,
                        tenant_id=conv.tenant_id,
                        sender_type="customer",
                        content=content,
                        content_type="text",
                    )
                    db.add(msg)
                    conv.last_message_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    await db.flush()
                    await db.commit()

                    msg_event = {
                        "type": "message:new",
                        "message": ConversationService._msg_dict(msg),
                        "conversation": ConversationService._conv_dict(conv, last_message=content),
                    }

                # Broadcast to agent dashboards
                await ws_manager.broadcast_all(msg_event)

                # Echo back to widget (confirm delivery)
                await ws_manager.send_to_widget(conversation_id, {
                    "type": "message:new",
                    "message": msg_event["message"],
                })

    except WebSocketDisconnect:
        logger.info(f"Widget disconnected for conversation {conversation_id}")
    except Exception as e:
        logger.error(f"Widget WS error: {e}")
    finally:
        ws_manager.disconnect_widget(conversation_id, websocket)
