"""
Widget router — /api/v1/widget
Public API for customer chat widget. Authenticated via x-api-key header.
"""

from datetime import datetime, timezone
from dateutil.parser import isoparse

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.agent import Agent
from models.conversation import Conversation
from models.message import Message
from models.setting import Setting
from schemas.message import WidgetConversationCreate, WidgetMessageCreate
from middleware.auth import verify_api_key
from services.conversation_service import ConversationService
from services.websocket_manager import ws_manager

router = APIRouter(prefix="/api/v1/widget", tags=["widget"])


@router.post("/conversations")
async def create_widget_conversation(
    body: WidgetConversationCreate,
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(verify_api_key),
):
    """Customer starts a new chat from the widget."""
    # Create conversation
    conv = Conversation(
        channel="web_widget",
        status="pending",
        customer_name=body.name,
        customer_email=body.email,
        source_page=body.source_page,
    )
    db.add(conv)
    await db.flush()

    # Save first message
    msg = Message(
        conversation_id=conv.id,
        sender_type="customer",
        sender_name=body.name,
        content=body.message,
    )
    db.add(msg)

    conv.last_message_at = datetime.now(timezone.utc)
    await db.flush()

    # Try auto-assign
    agent = await ConversationService.auto_assign(conv.id, db)

    # Broadcast new conversation
    await ws_manager.broadcast_all({
        "type": "conversation:new",
        "conversation": ConversationService._conv_dict(conv),
    })

    # Broadcast queue update
    from sqlalchemy import func
    pending = await db.execute(
        select(func.count(Conversation.id)).where(Conversation.status == "pending")
    )
    await ws_manager.broadcast_all({"type": "queue:update", "count": pending.scalar() or 0})

    return {
        "conversation_id": conv.id,
        "status": conv.status,
        "assigned_agent": agent.name if agent else None,
    }


@router.post("/conversations/{conversation_id}/messages")
async def widget_send_message(
    conversation_id: str,
    body: WidgetMessageCreate,
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(verify_api_key),
):
    """Customer sends a follow-up message from the widget."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg = Message(
        conversation_id=conversation_id,
        sender_type="customer",
        sender_name=conv.customer_name,
        content=body.content,
    )
    db.add(msg)

    conv.last_message_at = datetime.now(timezone.utc)
    conv.updated_at = datetime.now(timezone.utc)
    await db.flush()

    msg_data = ConversationService._msg_dict(msg)

    # Notify agents
    await ws_manager.broadcast_all({
        "type": "message:new",
        "message": msg_data,
        "conversation": ConversationService._conv_dict(conv),
    })

    return msg_data


@router.get("/conversations/{conversation_id}/messages")
async def widget_poll_messages(
    conversation_id: str,
    since: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(verify_api_key),
):
    """Customer polls for new messages. ?since=<ISO datetime> for incremental."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    query = select(Message).where(Message.conversation_id == conversation_id)

    if since:
        try:
            since_dt = isoparse(since)
            query = query.where(Message.created_at > since_dt)
        except (ValueError, TypeError):
            pass

    query = query.order_by(Message.created_at)
    msg_result = await db.execute(query)
    messages = msg_result.scalars().all()

    return {
        "messages": [ConversationService._msg_dict(m) for m in messages],
        "status": conv.status,
    }
