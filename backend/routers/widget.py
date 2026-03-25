"""
Widget router — public API for the embedded chat widget.
Tenant resolved via widget API key (x-api-key → Tenant.widget_api_key).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from database import get_db
from models import Conversation, Message, Agent
from models.tenant import Tenant
from middleware.auth import verify_api_key
from services.conversation_service import ConversationService
from services.websocket_manager import ws_manager

router = APIRouter(prefix="/api/v1/widget", tags=["widget"])


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
    conv.last_message_at = datetime.now(timezone.utc)
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
    conv.last_message_at = datetime.now(timezone.utc)
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
