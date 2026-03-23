"""
Webhook router — /webhook
Handles Meta WhatsApp webhook verification and inbound events.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session
from models.agent import Agent
from models.conversation import Conversation
from models.message import Message
from models.setting import Setting
from services.whatsapp_service import wa_service
from services.conversation_service import ConversationService
from services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhook"])


@router.get("/webhook")
async def verify_webhook(request: Request):
    """Meta webhook verification — GET hub.mode, hub.verify_token, hub.challenge."""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == wa_service.verify_token:
        logger.info("Webhook verified")
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(content=challenge)

    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Receive Meta webhook events.
    Return 200 immediately — process in background.
    """
    raw_body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    # Verify signature
    if not wa_service.verify_webhook_signature(signature, raw_body):
        raise HTTPException(status_code=403, detail="Invalid signature")

    body = await request.json()
    background_tasks.add_task(_process_webhook, body)

    return {"status": "ok"}


async def _process_webhook(body: dict):
    """Background task to process inbound webhook events."""
    events = wa_service.parse_incoming_webhook(body)

    async with async_session() as db:
        try:
            for event in events:
                if event["type"] == "status":
                    await _handle_status_update(event, db)
                elif event["type"] == "message":
                    await _handle_incoming_message(event, db)
            await db.commit()
        except Exception as e:
            logger.error(f"Webhook processing error: {e}")
            await db.rollback()


async def _handle_status_update(event: dict, db: AsyncSession):
    """Handle delivery status updates (sent, delivered, read, failed)."""
    wa_message_id = event.get("wa_message_id")
    status = event.get("status")
    if not wa_message_id or not status:
        return

    result = await db.execute(
        select(Message).where(Message.wa_message_id == wa_message_id)
    )
    msg = result.scalar_one_or_none()
    if msg:
        msg.delivery_status = status
        await db.flush()

        await ws_manager.broadcast_all({
            "type": "message:status",
            "wa_message_id": wa_message_id,
            "status": status,
        })


async def _handle_incoming_message(event: dict, db: AsyncSession):
    """Handle an incoming message — either from a customer or an agent's personal WA."""
    phone_number_id = event.get("phone_number_id", "")
    wa_message_id = event.get("wa_message_id", "")
    sender_phone = event.get("from", "")
    content = event.get("content", "")
    contact_name = event.get("contact_name", "")

    # ── Deduplication ─────────────────────────────────────────
    if wa_message_id:
        existing = await db.execute(
            select(Message).where(Message.wa_message_id == wa_message_id)
        )
        if existing.scalar_one_or_none():
            logger.info(f"Duplicate message skipped: {wa_message_id}")
            return

    # ── Check if sender is an agent ───────────────────────────
    agent = await wa_service.identify_sender(phone_number_id, db)
    if agent:
        # Agent is replying from their personal WhatsApp
        await _handle_agent_wa_reply(agent, sender_phone, content, wa_message_id, db)
        return

    # ── Customer message ──────────────────────────────────────
    # Find existing open conversation for this customer phone
    result = await db.execute(
        select(Conversation).where(
            and_(
                Conversation.customer_phone == sender_phone,
                Conversation.status.in_(["pending", "active"]),
            )
        ).order_by(Conversation.created_at.desc()).limit(1)
    )
    conv = result.scalar_one_or_none()

    if not conv:
        # Create new conversation
        conv = Conversation(
            channel="whatsapp",
            status="pending",
            customer_name=contact_name or sender_phone,
            customer_phone=sender_phone,
        )
        db.add(conv)
        await db.flush()

        # Try auto-assign
        assigned_agent = await ConversationService.auto_assign(conv.id, db)

        # Send welcome or away message
        if not assigned_agent:
            # Check if any agents online
            from sqlalchemy import func
            online_count = await db.execute(
                select(func.count(Agent.id)).where(Agent.status.in_(["online", "away"]))
            )
            if (online_count.scalar() or 0) == 0:
                # Send away message
                away = await db.execute(select(Setting).where(Setting.key == "away_message"))
                away_setting = away.scalar_one_or_none()
                if away_setting and wa_service.company_phone_id:
                    await wa_service.send_text_message(
                        wa_service.company_phone_id, sender_phone, away_setting.value
                    )
            else:
                # Send welcome message
                welcome = await db.execute(select(Setting).where(Setting.key == "welcome_message"))
                welcome_setting = welcome.scalar_one_or_none()
                if welcome_setting and wa_service.company_phone_id:
                    await wa_service.send_text_message(
                        wa_service.company_phone_id, sender_phone, welcome_setting.value
                    )

        # Broadcast new conversation
        await ws_manager.broadcast_all({
            "type": "conversation:new",
            "conversation": ConversationService._conv_dict(conv),
        })

        from sqlalchemy import func as sqlfunc
        pending = await db.execute(
            select(sqlfunc.count(Conversation.id)).where(Conversation.status == "pending")
        )
        await ws_manager.broadcast_all({"type": "queue:update", "count": pending.scalar() or 0})

    # Save message
    msg = Message(
        conversation_id=conv.id,
        sender_type="customer",
        sender_name=contact_name or sender_phone,
        content=content,
        wa_message_id=wa_message_id,
    )
    db.add(msg)

    conv.last_message_at = datetime.now(timezone.utc)
    conv.updated_at = datetime.now(timezone.utc)
    await db.flush()

    # Mark as read on WA
    if wa_service.company_phone_id:
        await wa_service.mark_as_read(wa_service.company_phone_id, wa_message_id)

    # Broadcast to dashboards
    await ws_manager.broadcast_all({
        "type": "message:new",
        "message": ConversationService._msg_dict(msg),
        "conversation": ConversationService._conv_dict(conv),
    })


async def _handle_agent_wa_reply(
    agent: Agent,
    recipient_phone: str,
    content: str,
    wa_message_id: str,
    db: AsyncSession,
):
    """
    Handle a message from an agent's personal WhatsApp.
    Find the matching conversation and record it as an agent reply.
    """
    # Find conversation with the customer phone that this agent is assigned to
    result = await db.execute(
        select(Conversation).where(
            and_(
                Conversation.customer_phone == recipient_phone,
                Conversation.status.in_(["pending", "active"]),
            )
        ).order_by(Conversation.created_at.desc()).limit(1)
    )
    conv = result.scalar_one_or_none()

    if not conv:
        logger.warning(f"Agent {agent.id} replied to {recipient_phone} but no conversation found")
        return

    # Save message as agent reply
    msg = Message(
        conversation_id=conv.id,
        sender_type="agent",
        sender_agent_id=agent.id,
        sender_name=agent.name,
        content=content,
        wa_message_id=wa_message_id,
        wa_sent_from="agent_personal",
    )
    db.add(msg)

    conv.last_message_at = datetime.now(timezone.utc)
    conv.updated_at = datetime.now(timezone.utc)
    await db.flush()

    # Broadcast to dashboards
    await ws_manager.broadcast_all({
        "type": "wa:reply_received",
        "message": ConversationService._msg_dict(msg),
        "conversation": ConversationService._conv_dict(conv),
    })
