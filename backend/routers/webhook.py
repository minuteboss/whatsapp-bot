"""
Webhook router — /webhook
Handles Meta WhatsApp webhook verification and inbound events.
Tenant resolution: phone_number_id → Tenant (via whatsapp_company_phone_number_id)
"""

import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import async_session
from models.agent import Agent
from models.conversation import Conversation
from models.message import Message
from models.setting import Setting
from models.tenant import Tenant
from models.usage import WhatsAppUsage
from services.whatsapp_service import wa_service
from services.conversation_service import ConversationService
from services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhook"])

MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "media")
os.makedirs(MEDIA_DIR, exist_ok=True)


@router.get("/webhook")
async def verify_webhook(request: Request):
    """Meta webhook verification — GET hub.mode, hub.verify_token, hub.challenge."""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    # Check against global verify token (3-tier: global DB → env)
    expected_token = wa_service._get_verify_token()
    if mode == "subscribe" and token == expected_token:
        logger.info("Webhook verified")
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(content=challenge)

    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks):
    """Receive Meta webhook events. Return 200 immediately — process in background.

    Signature verification is tenant-aware:
    1. Parse body to extract phone_number_id
    2. Resolve tenant from phone_number_id
    3. Verify signature using the resolved tenant's app secret (falls back to global)
    """
    import json as _json

    raw_body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    try:
        body = _json.loads(raw_body)
    except (ValueError, _json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Extract phone_number_id to resolve tenant before signature verification
    phone_number_id = _extract_phone_number_id(body)
    tenant = None
    if phone_number_id:
        async with async_session() as db:
            tenant = await _resolve_tenant_from_phone_id(phone_number_id, db)

    # Verify signature using global app secret
    if not wa_service.verify_webhook_signature(signature, raw_body):
        raise HTTPException(status_code=403, detail="Invalid signature")

    background_tasks.add_task(_process_webhook, body)
    return {"status": "ok"}


def _extract_phone_number_id(body: dict) -> str | None:
    """Extract the phone_number_id from webhook payload metadata."""
    try:
        return body["entry"][0]["changes"][0]["value"]["metadata"]["phone_number_id"]
    except (KeyError, IndexError, TypeError):
        return None


@router.get("/api/v1/media/{filename}")
async def serve_media(filename: str):
    """Serve downloaded media files."""
    filepath = os.path.join(MEDIA_DIR, filename)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath)


async def _resolve_tenant_from_phone_id(phone_number_id: str, db: AsyncSession) -> Tenant | None:
    """Resolve tenant by matching the phone_number_id to tenant WA config or env vars."""
    # Check per-tenant configs
    result = await db.execute(
        select(Tenant).where(
            Tenant.whatsapp_company_phone_number_id == phone_number_id,
            Tenant.is_active == True,
        )
    )
    tenant = result.scalar_one_or_none()
    if tenant:
        return tenant

    # Fallback: if the phone_number_id matches env var, use default tenant
    if phone_number_id == settings.WHATSAPP_COMPANY_PHONE_NUMBER_ID:
        result = await db.execute(
            select(Tenant).where(Tenant.slug == "default", Tenant.is_active == True)
        )
        return result.scalar_one_or_none()

    # Last resort: return default tenant
    result = await db.execute(
        select(Tenant).where(Tenant.slug == "default", Tenant.is_active == True)
    )
    return result.scalar_one_or_none()


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
    """Handle delivery status updates."""
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

    # Track billable conversations
    conversation_data = event.get("conversation")
    if conversation_data and conversation_data.get("id"):
        wa_conv_id = conversation_data["id"]
        phone_number_id = event.get("phone_number_id")
        
        tenant = await _resolve_tenant_from_phone_id(phone_number_id, db)
        if tenant:
            # Check if already logged (idempotency)
            existing_usage = await db.execute(
                select(WhatsAppUsage).where(
                    WhatsAppUsage.wa_conversation_id == wa_conv_id,
                    WhatsAppUsage.tenant_id == tenant.id,
                )
            )
            if not existing_usage.scalar_one_or_none():
                category = conversation_data.get("origin", {}).get("type", "unknown")
                pricing = event.get("pricing", {})
                
                exp_ts = conversation_data.get("expiration_timestamp")
                expiration = None
                if exp_ts:
                    expiration = datetime.fromtimestamp(int(exp_ts))

                usage = WhatsAppUsage(
                    tenant_id=tenant.id,
                    wa_conversation_id=wa_conv_id,
                    category=category,
                    pricing_model=pricing.get("pricing_model"),
                    expiration_timestamp=expiration
                )
                db.add(usage)
                
                # Fetch global pricing for this category (convert to cents)
                from services.setting_service import global_settings
                from models.wallet_transaction import WalletTransaction
                
                cat_key = f"pricing_{category.lower()}"
                price_str = global_settings.get(cat_key, "0.0")
                try:
                    price_cents = int(float(price_str) * 100)
                except ValueError:
                    price_cents = 0
                    
                if price_cents > 0:
                    tenant.wallet_balance -= price_cents
                    tx = WalletTransaction(
                        tenant_id=tenant.id,
                        amount=price_cents,
                        type="deduction",
                        method="whatsapp_usage",
                        reference=wa_conv_id,
                        status="completed",
                        description=f"WhatsApp {category.capitalize()} Conversation"
                    )
                    db.add(tx)
                
                await db.flush()
                logger.info(f"Logged billable conversation {wa_conv_id} ({category}) for tenant {tenant.slug}. Deducted {price_cents} cents.")


async def _handle_incoming_message(event: dict, db: AsyncSession):
    """Handle an incoming message — either from a customer or agent's personal WA."""
    phone_number_id = event.get("phone_number_id", "")
    wa_message_id = event.get("wa_message_id", "")
    sender_phone = event.get("from", "")
    content = event.get("content", "")
    contact_name = event.get("contact_name", "")
    media_id = event.get("media_id")

    # Deduplication
    if wa_message_id:
        existing = await db.execute(
            select(Message).where(Message.wa_message_id == wa_message_id)
        )
        if existing.scalar_one_or_none():
            return

    # Resolve tenant
    tenant = await _resolve_tenant_from_phone_id(phone_number_id, db)
    if not tenant:
        logger.warning(f"No tenant found for phone_number_id={phone_number_id}")
        return

    # Download media if applicable
    media_url = None
    if media_id:
        try:
            file_bytes, mime_type = await wa_service.download_media(media_id)
            if file_bytes:
                ext = mime_type.split("/")[-1].split(";")[0] if mime_type else "bin"
                filename = f"{uuid.uuid4().hex}.{ext}"
                filepath = os.path.join(MEDIA_DIR, filename)
                with open(filepath, "wb") as f:
                    f.write(file_bytes)
                media_url = f"/api/v1/media/{filename}"
        except Exception as e:
            logger.error(f"Media download failed: {e}")

    # Check if sender is an agent's personal WA.
    # Only applies when the receiving phone_number_id is DIFFERENT from the company phone
    # (i.e. an agent has their own separate registered number).
    # If the company phone and agent personal WA are the same number, all inbound
    # messages at that number are customer messages — skip the agent check.
    company_phone_id = wa_service._get_company_phone_id(tenant)
    if phone_number_id != company_phone_id:
        agent = await wa_service.identify_sender(phone_number_id, db)
        if agent:
            await _handle_agent_wa_reply(agent, sender_phone, content, wa_message_id, media_url, tenant, db)
            return

    # Customer message — find existing conversation
    result = await db.execute(
        select(Conversation).where(
            and_(
                Conversation.customer_phone == sender_phone,
                Conversation.tenant_id == tenant.id,
                Conversation.status.in_(["pending", "active"]),
            )
        ).order_by(Conversation.created_at.desc()).limit(1)
    )
    conv = result.scalar_one_or_none()

    if not conv:
        conv = Conversation(
            channel="whatsapp",
            status="pending",
            customer_name=contact_name or sender_phone,
            customer_phone=sender_phone,
            tenant_id=tenant.id,
        )
        db.add(conv)
        await db.flush()

        assigned_agent = await ConversationService.auto_assign(conv, db, tenant_id=tenant.id)

        if not assigned_agent:
            from sqlalchemy import func
            online_count = await db.execute(
                select(func.count(Agent.id)).where(
                    Agent.status.in_(["online", "away"]),
                    Agent.tenant_id == tenant.id,
                )
            )
            company_phone_id = wa_service._get_company_phone_id(tenant)

            if (online_count.scalar() or 0) == 0:
                away = await db.execute(
                    select(Setting).where(Setting.key == "away_message", Setting.tenant_id == tenant.id)
                )
                away_setting = away.scalar_one_or_none()
                if away_setting and company_phone_id:
                    await wa_service.send_text_message(
                        company_phone_id, sender_phone, away_setting.value
                    )
            else:
                welcome = await db.execute(
                    select(Setting).where(Setting.key == "welcome_message", Setting.tenant_id == tenant.id)
                )
                welcome_setting = welcome.scalar_one_or_none()
                if welcome_setting and company_phone_id:
                    await wa_service.send_text_message(
                        company_phone_id, sender_phone, welcome_setting.value
                    )

        await ws_manager.broadcast_all({
            "type": "conversation:new",
            "conversation": ConversationService._conv_dict(conv),
        })

        pending_count = await ConversationService._pending_count(db, tenant.id)
        await ws_manager.broadcast_all({"type": "queue:update", "count": pending_count})

    # Save message
    msg = Message(
        conversation_id=conv.id,
        tenant_id=tenant.id,
        sender_type="customer",
        sender_name=contact_name or sender_phone,
        content=content,
        wa_message_id=wa_message_id,
        media_url=media_url,
    )
    db.add(msg)

    conv.last_message_at = datetime.now(timezone.utc).replace(tzinfo=None)
    conv.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()

    # Mark as read
    company_phone_id = wa_service._get_company_phone_id(tenant)
    if company_phone_id:
        await wa_service.mark_as_read(company_phone_id, wa_message_id)

    await ws_manager.broadcast_all({
        "type": "message:new",
        "message": ConversationService._msg_dict(msg),
        "conversation": ConversationService._conv_dict(conv, last_message=content),
    })


async def _handle_agent_wa_reply(
    agent: Agent,
    recipient_phone: str,
    content: str,
    wa_message_id: str,
    media_url: str | None,
    tenant: Tenant,
    db: AsyncSession,
):
    """Handle a message from an agent's personal WhatsApp."""
    result = await db.execute(
        select(Conversation).where(
            and_(
                Conversation.customer_phone == recipient_phone,
                Conversation.tenant_id == tenant.id,
                Conversation.status.in_(["pending", "active"]),
            )
        ).order_by(Conversation.created_at.desc()).limit(1)
    )
    conv = result.scalar_one_or_none()

    if not conv:
        logger.warning(f"Agent {agent.id} replied to {recipient_phone} but no conversation found")
        return

    msg = Message(
        conversation_id=conv.id,
        tenant_id=tenant.id,
        sender_type="agent",
        sender_agent_id=agent.id,
        sender_name=agent.name,
        content=content,
        wa_message_id=wa_message_id,
        wa_sent_from="agent_personal",
        media_url=media_url,
    )
    db.add(msg)

    conv.last_message_at = datetime.now(timezone.utc).replace(tzinfo=None)
    conv.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()

    await ws_manager.broadcast_all({
        "type": "wa:reply_received",
        "message": ConversationService._msg_dict(msg),
        "conversation": ConversationService._conv_dict(conv, last_message=content),
    })
