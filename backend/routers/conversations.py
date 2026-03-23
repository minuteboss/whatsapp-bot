"""
Conversations router — /api/v1/conversations
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.agent import Agent
from models.conversation import Conversation
from models.message import Message
from schemas.conversation import SendMessageRequest, TransferRequest, AssignRequest
from schemas.message import MessageResponse
from middleware.auth import get_current_agent
from services.conversation_service import ConversationService
from services.whatsapp_service import wa_service
from services.websocket_manager import ws_manager

router = APIRouter(prefix="/api/v1/conversations", tags=["conversations"])


@router.get("/")
async def list_conversations(
    status: str | None = None,
    channel: str | None = None,
    mine: bool = False,
    agent_id: str | None = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current: Agent = Depends(get_current_agent),
):
    query = select(Conversation)

    if status:
        query = query.where(Conversation.status == status)
    if channel:
        query = query.where(Conversation.channel == channel)
    if mine:
        query = query.where(Conversation.assigned_agent_id == current.id)
    if agent_id:
        query = query.where(Conversation.assigned_agent_id == agent_id)

    query = query.order_by(desc(Conversation.updated_at)).offset(offset).limit(limit)

    result = await db.execute(query)
    conversations = result.scalars().all()

    # Attach last message preview for each conversation
    conv_list = []
    for conv in conversations:
        msg_result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(desc(Message.created_at))
            .limit(1)
        )
        last_msg = msg_result.scalar_one_or_none()
        conv_data = ConversationService._conv_dict(conv)
        conv_data["last_message"] = last_msg.content if last_msg else None
        conv_list.append(conv_data)

    return conv_list


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(get_current_agent),
):
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    messages = msg_result.scalars().all()

    return {
        **ConversationService._conv_dict(conv),
        "messages": [ConversationService._msg_dict(m) for m in messages],
    }


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    body: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    agent: Agent = Depends(get_current_agent),
):
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    wa_sent_from = None
    wa_msg_id = None

    # Route to WhatsApp if channel is whatsapp
    if conv.channel == "whatsapp" and conv.customer_phone:
        if agent.wa_connected and agent.wa_phone_number_id:
            phone_id = agent.wa_phone_number_id
            wa_sent_from = "agent_personal"
        else:
            phone_id = wa_service.company_phone_id or ""
            wa_sent_from = "company"

        result_wa = await wa_service.send_text_message(
            phone_id, conv.customer_phone, body.content
        )
        if result_wa and "messages" in result_wa:
            wa_msg_id = result_wa["messages"][0].get("id")

    # Save message
    msg = Message(
        conversation_id=conversation_id,
        sender_type="agent",
        sender_agent_id=agent.id,
        sender_name=agent.name,
        content=body.content,
        wa_message_id=wa_msg_id,
        wa_sent_from=wa_sent_from,
    )
    db.add(msg)

    conv.last_message_at = datetime.now(timezone.utc)
    conv.updated_at = datetime.now(timezone.utc)
    await db.flush()

    msg_data = ConversationService._msg_dict(msg)

    # Broadcast via WebSocket
    await ws_manager.broadcast_all({
        "type": "message:new",
        "message": msg_data,
        "conversation": ConversationService._conv_dict(conv),
    })

    return msg_data


@router.post("/{conversation_id}/accept")
async def accept_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    agent: Agent = Depends(get_current_agent),
):
    try:
        conv = await ConversationService.accept(conversation_id, agent, db)
        return ConversationService._conv_dict(conv)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{conversation_id}/assign")
async def assign_conversation(
    conversation_id: str,
    body: AssignRequest,
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(get_current_agent),
):
    try:
        conv = await ConversationService.assign(conversation_id, body.agent_id, db)
        return ConversationService._conv_dict(conv)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{conversation_id}/transfer")
async def transfer_conversation(
    conversation_id: str,
    body: TransferRequest,
    db: AsyncSession = Depends(get_db),
    agent: Agent = Depends(get_current_agent),
):
    try:
        conv = await ConversationService.transfer(
            conversation_id, agent.id, body.to_agent_id, body.note, db
        )
        return ConversationService._conv_dict(conv)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{conversation_id}/resolve")
async def resolve_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(get_current_agent),
):
    try:
        conv = await ConversationService.resolve(conversation_id, db)
        return ConversationService._conv_dict(conv)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{conversation_id}/reopen")
async def reopen_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(get_current_agent),
):
    try:
        conv = await ConversationService.reopen(conversation_id, db)
        return ConversationService._conv_dict(conv)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
