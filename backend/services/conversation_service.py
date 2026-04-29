"""
Conversation Service — routing, assignment, transfer, resolution logic.
All operations are tenant-scoped.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from models.agent import Agent
from models.conversation import Conversation
from models.message import Message
from models.setting import Setting, TransferLog
from services.websocket_manager import ws_manager
from services.whatsapp_service import wa_service

logger = logging.getLogger(__name__)


class ConversationService:

    # ── Auto-assign ───────────────────────────────────────────
    @staticmethod
    async def auto_assign(
        conversation: Conversation, db: AsyncSession, tenant_id: str | None = None
    ) -> Agent | None:
        """Auto-assign a pending conversation to the least-loaded online agent."""
        tid = tenant_id or conversation.tenant_id

        # Check if auto_assign is enabled
        setting = await db.execute(
            select(Setting).where(Setting.key == "auto_assign", Setting.tenant_id == tid)
        )
        auto = setting.scalar_one_or_none()
        if auto and auto.value.lower() == "false":
            return None

        # Sub-query: count active conversations per agent
        active_count = (
            select(func.count(Conversation.id))
            .where(
                and_(
                    Conversation.assigned_agent_id == Agent.id,
                    Conversation.status == "active",
                )
            )
            .correlate(Agent)
            .scalar_subquery()
            .label("active_count")
        )

        # Find the best agent within the same tenant
        result = await db.execute(
            select(Agent, active_count)
            .where(
                Agent.status.in_(["online", "away"]),
                Agent.tenant_id == tid,
            )
            .having(active_count < Agent.max_chats)
            .group_by(Agent.id)
            .order_by(active_count.asc())
            .limit(1)
        )
        row = result.first()
        if not row:
            return None

        agent = row[0]

        conversation.assigned_agent_id = agent.id
        conversation.status = "active"
        conversation.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.flush()

        await ws_manager.broadcast_all({
            "type": "conversation:assigned",
            "conversation": ConversationService._conv_dict(conversation),
        })

        return agent

    # ── Accept ────────────────────────────────────────────────
    @staticmethod
    async def accept(
        conv: Conversation, agent: Agent, db: AsyncSession
    ) -> tuple:
        if conv.status not in ("pending",):
            raise ValueError("Conversation is not pending")

        conv.assigned_agent_id = agent.id
        conv.status = "active"
        conv.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.flush()

        sys_msg = Message(
            conversation_id=conv.id,
            tenant_id=conv.tenant_id,
            sender_type="system",
            content=f"Conversation accepted by {agent.name}",
            content_type="system_event",
        )
        db.add(sys_msg)
        await db.flush()

        pending_count = await ConversationService._pending_count(db, conv.tenant_id)
        await ws_manager.broadcast_all({"type": "queue:update", "count": pending_count})

        return conv, sys_msg

    # ── Assign ────────────────────────────────────────────────
    @staticmethod
    async def assign(
        conv: Conversation, target_agent: Agent, db: AsyncSession
    ) -> tuple:
        conv.previous_agent_id = conv.assigned_agent_id
        conv.assigned_agent_id = target_agent.id
        conv.status = "active"
        conv.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.flush()

        sys_msg = Message(
            conversation_id=conv.id,
            tenant_id=conv.tenant_id,
            sender_type="system",
            content=f"Conversation assigned to {target_agent.name}",
            content_type="system_event",
        )
        db.add(sys_msg)
        await db.flush()

        return conv, sys_msg

    # ── Transfer ──────────────────────────────────────────────
    @staticmethod
    async def transfer(
        conv: Conversation,
        from_agent: Agent,
        to_agent: Agent,
        note: str | None,
        db: AsyncSession,
    ) -> tuple:
        conv.previous_agent_id = from_agent.id
        conv.assigned_agent_id = to_agent.id
        conv.transfer_note = note
        conv.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.flush()

        log_entry = TransferLog(
            conversation_id=conv.id,
            tenant_id=conv.tenant_id,
            from_agent_id=from_agent.id,
            to_agent_id=to_agent.id,
            note=note,
        )
        db.add(log_entry)
        await db.flush()

        sys_msg = Message(
            conversation_id=conv.id,
            tenant_id=conv.tenant_id,
            sender_type="system",
            content=f"Conversation transferred from {from_agent.name} to {to_agent.name}{f': {note}' if note else ''}",
            content_type="system_event",
        )
        db.add(sys_msg)
        await db.flush()

        return conv, sys_msg, log_entry

    # ── Resolve ───────────────────────────────────────────────
    @staticmethod
    async def resolve(
        conv: Conversation, db: AsyncSession, tenant=None
    ) -> tuple:
        conv.status = "resolved"
        conv.resolved_at = datetime.now(timezone.utc).replace(tzinfo=None)
        conv.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.flush()

        sys_msg = Message(
            conversation_id=conv.id,
            tenant_id=conv.tenant_id,
            sender_type="system",
            content="Conversation resolved",
            content_type="system_event",
        )
        db.add(sys_msg)
        await db.flush()

        # If WhatsApp, send resolved message
        if conv.channel == "whatsapp" and conv.customer_phone:
            resolved_setting = await db.execute(
                select(Setting).where(
                    Setting.key == "resolved_message",
                    Setting.tenant_id == conv.tenant_id,
                )
            )
            resolved_msg = resolved_setting.scalar_one_or_none()
            if resolved_msg and tenant:
                company_phone_id = wa_service._get_company_phone_id(tenant)
                if company_phone_id:
                    await wa_service.send_text_message(
                        company_phone_id,
                        conv.customer_phone,
                        resolved_msg.value,
                    )

        pending_count = await ConversationService._pending_count(db, conv.tenant_id)
        await ws_manager.broadcast_all({"type": "queue:update", "count": pending_count})

        return conv, sys_msg

    # ── Reopen ────────────────────────────────────────────────
    @staticmethod
    async def reopen(
        conv: Conversation, db: AsyncSession
    ) -> tuple:
        conv.status = "active" if conv.assigned_agent_id else "pending"
        conv.resolved_at = None
        conv.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.flush()

        sys_msg = Message(
            conversation_id=conv.id,
            tenant_id=conv.tenant_id,
            sender_type="system",
            content="Conversation reopened",
            content_type="system_event",
        )
        db.add(sys_msg)
        await db.flush()

        return conv, sys_msg

    # ── Helpers ───────────────────────────────────────────────
    @staticmethod
    async def _pending_count(db: AsyncSession, tenant_id: str | None = None) -> int:
        query = select(func.count(Conversation.id)).where(Conversation.status == "pending")
        if tenant_id:
            query = query.where(Conversation.tenant_id == tenant_id)
        result = await db.execute(query)
        return result.scalar() or 0

    @staticmethod
    def _conv_dict(conv: Conversation, last_message: str | None = None) -> dict:
        return {
            "id": conv.id,
            "channel": conv.channel,
            "status": conv.status,
            "customer_name": conv.customer_name,
            "customer_email": conv.customer_email,
            "customer_phone": conv.customer_phone,
            "assigned_agent_id": conv.assigned_agent_id,
            "previous_agent_id": conv.previous_agent_id,
            "transfer_note": conv.transfer_note,
            "source_page": conv.source_page,
            "tenant_id": conv.tenant_id,
            "last_message": last_message,
            "last_message_at": conv.last_message_at.isoformat() + "Z" if conv.last_message_at else None,
            "resolved_at": conv.resolved_at.isoformat() + "Z" if conv.resolved_at else None,
            "created_at": conv.created_at.isoformat() + "Z" if conv.created_at else None,
            "updated_at": conv.updated_at.isoformat() + "Z" if conv.updated_at else None,
        }

    @staticmethod
    def _msg_dict(msg: Message) -> dict:
        return {
            "id": msg.id,
            "conversation_id": msg.conversation_id,
            "sender_type": msg.sender_type,
            "sender_agent_id": msg.sender_agent_id,
            "sender_name": msg.sender_name,
            "content": msg.content,
            "content_type": msg.content_type,
            "media_url": msg.media_url,
            "wa_message_id": msg.wa_message_id,
            "wa_sent_from": msg.wa_sent_from,
            "delivery_status": msg.delivery_status,
            "created_at": msg.created_at.isoformat() + "Z" if msg.created_at else None,
        }
