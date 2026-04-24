"""
Conversations router — list, get (with pagination), send, accept, assign, transfer, resolve, reopen.
All queries scoped to the current tenant.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models import Agent, Conversation, Message
from models.tenant import Tenant
from middleware.auth import get_current_agent
from middleware.tenant import get_current_tenant
from services.conversation_service import ConversationService
from services.whatsapp_service import wa_service
from services.websocket_manager import ws_manager

router = APIRouter(prefix="/api/v1/conversations", tags=["conversations"])


@router.get("")
async def list_conversations(
    status: Optional[str] = None,
    channel: Optional[str] = None,
    mine: Optional[bool] = None,
    agent_id: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    agent: Agent = Depends(get_current_agent),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List conversations with pagination and last message pre-fetching.

    Uses a single query with LATERAL join to avoid N+1 query problem.
    """
    from sqlalchemy.orm import joinedload
    from sqlalchemy import or_, and_

    # Build base query
    query = select(Conversation).where(Conversation.tenant_id == tenant.id)

    if status:
        query = query.where(Conversation.status == status)
    if channel:
        query = query.where(Conversation.channel == channel)
    if mine:
        query = query.where(Conversation.assigned_agent_id == agent.id)
    if agent_id:
        query = query.where(Conversation.assigned_agent_id == agent_id)

    # Get total count before pagination
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply ordering and pagination
    query = query.order_by(desc(Conversation.last_message_at))
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    conversations = result.scalars().all()

    # Fetch last messages in a single query (avoids N+1)
    conv_ids = [c.id for c in conversations]
    last_messages = {}
    if conv_ids:
        # Use a subquery to get the latest message per conversation
        from sqlalchemy import text
        msg_subquery = (
            select(
                Message.conversation_id,
                Message.content,
                func.row_number().over(
                    partition_by=Message.conversation_id,
                    order_by=desc(Message.created_at)
                ).label("rn")
            )
            .where(Message.conversation_id.in_(conv_ids))
            .subquery()
        )
        latest_msgs = select(msg_subquery).where(msg_subquery.c.rn == 1)
        msg_result = await db.execute(latest_msgs)
        for row in msg_result:
            last_messages[row.conversation_id] = row.content

    # Build response
    conv_list = []
    for conv in conversations:
        conv_dict = ConversationService._conv_dict(conv)
        conv_dict["last_message"] = last_messages.get(conv.id)
        conv_dict["unread_count"] = 0  # TODO: implement actual unread counting
        conv_list.append(conv_dict)

    return {
        "items": conv_list,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    before: Optional[str] = Query(default=None),
    agent: Agent = Depends(get_current_agent),
    tenant: Tenant = Depends(get_current_tenant),
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

    # Paginated messages
    msg_query = select(Message).where(
        Message.conversation_id == conversation_id
    )

    if before:
        # Get the created_at of the cursor message
        cursor_result = await db.execute(
            select(Message.created_at).where(Message.id == before)
        )
        cursor_time = cursor_result.scalar_one_or_none()
        if cursor_time:
            msg_query = msg_query.where(Message.created_at < cursor_time)

    msg_query = msg_query.order_by(desc(Message.created_at)).limit(limit + 1)

    msg_result = await db.execute(msg_query)
    messages = list(msg_result.scalars().all())

    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]

    # Reverse to chronological order for display
    messages.reverse()

    return {
        "conversation": ConversationService._conv_dict(conv),
        "messages": [ConversationService._msg_dict(m) for m in messages],
        "has_more": has_more,
        "next_cursor": messages[0].id if has_more and messages else None,
    }


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    data: dict,
    agent: Agent = Depends(get_current_agent),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    content = data.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="Content is required")
    if len(content) > 4096:
        raise HTTPException(status_code=422, detail="Message too long (max 4096 chars)")

    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == tenant.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    from datetime import datetime, timezone
    wa_message_id = None
    wa_sent_from = None

    # Send via WhatsApp if applicable
    wa_delivery_status = "sent"
    if conv.channel == "whatsapp" and conv.customer_phone:
        try:
            if agent.wa_connected and agent.wa_phone_number_id:
                result_wa = await wa_service.send_text_message(
                    agent.wa_phone_number_id, conv.customer_phone, content, tenant=tenant
                )
                if result_wa:
                    wa_sent_from = "agent_personal"
                else:
                    wa_delivery_status = "failed"
            else:
                phone_id = tenant.whatsapp_company_phone_number_id or settings.WHATSAPP_COMPANY_PHONE_NUMBER_ID
                if phone_id:
                    result_wa = await wa_service.send_text_message(
                        phone_id, conv.customer_phone, content, tenant=tenant
                    )
                    if result_wa:
                        wa_sent_from = "company"
                    else:
                        wa_delivery_status = "failed"
                else:
                    result_wa = {}
                    wa_delivery_status = "failed"

            wa_message_id = result_wa.get("messages", [{}])[0].get("id") if result_wa else None
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"WA send failed: {e}")
            wa_delivery_status = "failed"

    msg = Message(
        conversation_id=conversation_id,
        tenant_id=tenant.id,
        sender_type="agent",
        sender_agent_id=agent.id,
        sender_name=agent.name,
        content=content,
        content_type="text",
        wa_message_id=wa_message_id,
        wa_sent_from=wa_sent_from,
        delivery_status=wa_delivery_status,
    )
    db.add(msg)
    conv.last_message_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()
    await db.commit()

    # Broadcast to agent dashboards
    msg_event = {
        "type": "message:new",
        "message": ConversationService._msg_dict(msg),
        "conversation": ConversationService._conv_dict(conv, last_message=content),
    }
    await ws_manager.broadcast_all(msg_event)

    # Broadcast to widget client (so customer sees agent reply in real time)
    await ws_manager.send_to_widget(conversation_id, {
        "type": "message:new",
        "message": msg_event["message"],
    })

    return ConversationService._msg_dict(msg)


@router.post("/{conversation_id}/accept")
async def accept_conversation(
    conversation_id: str,
    agent: Agent = Depends(get_current_agent),
    tenant: Tenant = Depends(get_current_tenant),
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

    conv, system_msg = await ConversationService.accept(conv, agent, db)
    await db.commit()

    await ws_manager.broadcast_all({
        "type": "conversation:assigned",
        "conversation": ConversationService._conv_dict(conv),
    })

    return ConversationService._conv_dict(conv)


@router.post("/{conversation_id}/assign")
async def assign_conversation(
    conversation_id: str,
    data: dict,
    agent: Agent = Depends(get_current_agent),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    target_agent_id = data.get("agent_id")
    if not target_agent_id:
        raise HTTPException(status_code=422, detail="agent_id required")

    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == tenant.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    target_result = await db.execute(
        select(Agent).where(Agent.id == target_agent_id, Agent.tenant_id == tenant.id)
    )
    target_agent = target_result.scalar_one_or_none()
    if not target_agent:
        raise HTTPException(status_code=404, detail="Target agent not found")

    conv, system_msg = await ConversationService.assign(conv, target_agent, db)
    await db.commit()

    await ws_manager.broadcast_all({
        "type": "conversation:assigned",
        "conversation": ConversationService._conv_dict(conv),
    })

    return ConversationService._conv_dict(conv)


@router.post("/{conversation_id}/transfer")
async def transfer_conversation(
    conversation_id: str,
    data: dict,
    agent: Agent = Depends(get_current_agent),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    to_agent_id = data.get("to_agent_id")
    note = data.get("note")
    if not to_agent_id:
        raise HTTPException(status_code=422, detail="to_agent_id required")

    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == tenant.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    to_result = await db.execute(
        select(Agent).where(Agent.id == to_agent_id, Agent.tenant_id == tenant.id)
    )
    to_agent = to_result.scalar_one_or_none()
    if not to_agent:
        raise HTTPException(status_code=404, detail="Target agent not found")

    conv, system_msg, transfer_log = await ConversationService.transfer(
        conv, agent, to_agent, note, db
    )
    await db.commit()

    await ws_manager.broadcast_all({
        "type": "conversation:transferred",
        "conversation": ConversationService._conv_dict(conv),
    })

    return ConversationService._conv_dict(conv)


@router.post("/{conversation_id}/resolve")
async def resolve_conversation(
    conversation_id: str,
    agent: Agent = Depends(get_current_agent),
    tenant: Tenant = Depends(get_current_tenant),
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

    conv, system_msg = await ConversationService.resolve(conv, db, tenant=tenant)
    await db.commit()

    await ws_manager.broadcast_all({
        "type": "conversation:resolved",
        "conversation": ConversationService._conv_dict(conv),
    })

    # Notify widget that conversation was resolved
    await ws_manager.send_to_widget(conversation_id, {
        "type": "conversation:resolved",
        "conversation": ConversationService._conv_dict(conv),
    })

    return ConversationService._conv_dict(conv)


@router.post("/{conversation_id}/reopen")
async def reopen_conversation(
    conversation_id: str,
    agent: Agent = Depends(get_current_agent),
    tenant: Tenant = Depends(get_current_tenant),
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

    conv.status = "pending"
    conv.assigned_agent_id = None
    await db.flush()
    await db.commit()

    await ws_manager.broadcast_all({
        "type": "conversation:new",
        "conversation": ConversationService._conv_dict(conv),
    })

    return ConversationService._conv_dict(conv)
