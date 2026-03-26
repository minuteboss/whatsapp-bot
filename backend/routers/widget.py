"""
Widget router — public API for the embedded chat widget.
Tenant resolved via widget API key (x-api-key → Tenant.widget_api_key).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
import json
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from database import get_db
from models import Conversation, Message, Agent, Setting
from models.tenant import Tenant
from middleware.auth import verify_api_key
from services.conversation_service import ConversationService
from services.websocket_manager import ws_manager

router = APIRouter(prefix="/api/v1/widget", tags=["widget"])


async def _get_tenant_by_slug_and_key(slug: str, key: str, db: AsyncSession) -> Tenant:
    """Look up a tenant by its slug + widget_api_key combination."""
    result = await db.execute(
        select(Tenant).where(Tenant.slug == slug, Tenant.widget_api_key == key, Tenant.is_active == True)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=401, detail="Invalid slug or widget key")
    return tenant


async def _get_settings(tenant_id: str, db: AsyncSession) -> dict:
    result = await db.execute(select(Setting).where(Setting.tenant_id == tenant_id))
    rows = result.scalars().all()
    return {s.key: s.value for s in rows}


@router.get("/config/{slug}")
async def widget_config(
    slug: str,
    key: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — returns tenant branding and starter config for the embed widget."""
    tenant = await _get_tenant_by_slug_and_key(slug, key, db)
    s = await _get_settings(tenant.id, db)
    starter_fields = []
    try:
        starter_fields = json.loads(s.get("starter_fields", "[]"))
    except Exception:
        starter_fields = []
    return {
        "name": s.get("business_name", tenant.name),
        "greeting": s.get("welcome_message", ""),
        "away_message": s.get("away_message", ""),
        "starter_enabled": s.get("starter_enabled", "false") == "true",
        "starter_greeting": s.get("starter_greeting", ""),
        "starter_fields": starter_fields,
        "offline_collect_email": s.get("offline_collect_email", "false") == "true",
    }


@router.post("/start")
async def widget_start(
    data: dict,
    db: AsyncSession = Depends(get_db),
):
    """Start a new widget conversation, with optional pre-chat form data."""
    slug = data.get("slug", "")
    key = data.get("key", "")
    fields: dict = data.get("fields", {})

    tenant = await _get_tenant_by_slug_and_key(slug, key, db)

    # Map well-known field keys to Conversation columns
    customer_name = str(fields.get("name", "Guest")).strip()[:200] or "Guest"
    customer_email = str(fields.get("email", "")).strip()[:320] or None
    customer_phone = str(fields.get("phone", "")).strip()[:50] or None

    # Collect extra fields (beyond name/email/phone) as metadata JSON
    well_known = {"name", "email", "phone"}
    extra_fields = {k: v for k, v in fields.items() if k not in well_known and v}
    source_page = json.dumps(extra_fields) if extra_fields else None

    conv = Conversation(
        channel="web_widget",
        status="pending",
        customer_name=customer_name,
        customer_email=customer_email,
        customer_phone=customer_phone,
        source_page=source_page,
        tenant_id=tenant.id,
    )
    db.add(conv)
    await db.flush()

    s = await _get_settings(tenant.id, db)
    welcome_text = s.get("welcome_message", "Chat started. An agent will be with you shortly.")
    welcome = Message(
        conversation_id=conv.id,
        tenant_id=tenant.id,
        sender_type="system",
        content=welcome_text,
        content_type="system_event",
    )
    db.add(welcome)
    conv.last_message_at = datetime.now(timezone.utc).replace(tzinfo=None).replace(tzinfo=None)
    await db.flush()
    await ConversationService.auto_assign(conv, db, tenant_id=tenant.id)
    await db.commit()

    await ws_manager.broadcast_all({
        "type": "conversation:new",
        "conversation": ConversationService._conv_dict(conv),
    })

    return {
        "conversation_id": conv.id,
        "messages": [{"id": welcome.id, "sender_type": "system", "sender_name": None, "content": welcome.content, "created_at": str(welcome.created_at)}],
    }


@router.post("/conversations")
async def create_conversation(
    data: dict,
    tenant: Tenant = Depends(verify_api_key),
    db: AsyncSession = Depends(get_db),
):
    customer_name = data.get("customer_name", "Guest").strip()[:200]
    customer_email = data.get("customer_email", "").strip()[:320]
    source_page = data.get("source_page", "").strip()[:2000]

    conv = Conversation(
        channel="web_widget",
        status="pending",
        customer_name=customer_name,
        customer_email=customer_email or None,
        source_page=source_page or None,
        tenant_id=tenant.id,
    )
    db.add(conv)
    await db.flush()

    # Welcome message
    welcome = Message(
        conversation_id=conv.id,
        tenant_id=tenant.id,
        sender_type="system",
        content="Chat started. An agent will be with you shortly.",
        content_type="system_event",
    )
    db.add(welcome)
    conv.last_message_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()

    # Auto-assign within tenant
    await ConversationService.auto_assign(conv, db, tenant_id=tenant.id)
    await db.commit()

    # Broadcast
    await ws_manager.broadcast_all({
        "type": "conversation:new",
        "conversation": ConversationService._conv_dict(conv),
    })

    return {"id": conv.id, "status": conv.status}


@router.post("/conversations/{conversation_id}/messages")
async def send_widget_message(
    conversation_id: str,
    data: dict,
    tenant: Tenant = Depends(verify_api_key),
    db: AsyncSession = Depends(get_db),
):
    content = data.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="Content required")
    if len(content) > 4096:
        raise HTTPException(status_code=422, detail="Message too long")

    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == tenant.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg = Message(
        conversation_id=conversation_id,
        tenant_id=tenant.id,
        sender_type="customer",
        content=content,
        content_type="text",
    )
    db.add(msg)
    conv.last_message_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()
    await db.commit()

    await ws_manager.broadcast_all({
        "type": "message:new",
        "message": ConversationService._msg_dict(msg),
        "conversation": ConversationService._conv_dict(conv),
    })

    return {"id": msg.id}


@router.get("/conversations/{conversation_id}/messages")
async def get_widget_messages(
    conversation_id: str,
    since: Optional[str] = Query(default=None),
    tenant: Tenant = Depends(verify_api_key),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == tenant.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    query = select(Message).where(
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at)

    result = await db.execute(query)
    messages = result.scalars().all()

    return [
        {
            "id": m.id,
            "sender_type": m.sender_type,
            "content": m.content,
            "created_at": str(m.created_at),
        }
        for m in messages
    ]
