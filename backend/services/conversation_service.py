"""
Conversation Service — routing, assignment, transfer, resolution logic.
"""

import logging
from datetime import datetime, timezone

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
    async def auto_assign(conversation_id: str, db: AsyncSession) -> Agent | None:
        """
        Auto-assign a pending conversation to the least-loaded online agent.
        Returns the assigned agent or None.
        """
        # Check if auto_assign is enabled
        setting = await db.execute(
            select(Setting).where(Setting.key == "auto_assign")
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

        # Find the best agent
        result = await db.execute(
            select(Agent, active_count)
            .where(Agent.status.in_(["online", "away"]))
            .having(active_count < Agent.max_chats)
            .group_by(Agent.id, Agent.name, Agent.email, Agent.password_hash,
                      Agent.role, Agent.status, Agent.max_chats, Agent.api_key,
                      Agent.wa_phone_number, Agent.wa_phone_number_id,
                      Agent.wa_connected, Agent.wa_connected_at,
                      Agent.created_at, Agent.updated_at)
            .order_by(active_count.asc())
            .limit(1)
        )
        row = result.first()
        if not row:
            return None

        agent = row[0]

        # Assign
        conv_result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = conv_result.scalar_one_or_none()
        if conv:
            conv.assigned_agent_id = agent.id
            conv.status = "active"
            conv.updated_at = datetime.now(timezone.utc)
            await db.flush()

            # Broadcast assignment
            await ws_manager.broadcast_all({
                "type": "conversation:assigned",
                "conversation": ConversationService._conv_dict(conv),
            })

        return agent

    # ── Accept ────────────────────────────────────────────────
    @staticmethod
    async def accept(
        conversation_id: str, agent: Agent, db: AsyncSession
    ) -> Conversation:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise ValueError("Conversation not found")
        if conv.status not in ("pending",):
            raise ValueError("Conversation is not pending")

        conv.assigned_agent_id = agent.id
        conv.status = "active"
        conv.updated_at = datetime.now(timezone.utc)
        await db.flush()

        await ws_manager.broadcast_all({
            "type": "conversation:assigned",
            "conversation": ConversationService._conv_dict(conv),
        })

        # Broadcast queue update
        pending_count = await ConversationService._pending_count(db)
        await ws_manager.broadcast_all({"type": "queue:update", "count": pending_count})

        return conv

    # ── Assign ────────────────────────────────────────────────
    @staticmethod
    async def assign(
        conversation_id: str, target_agent_id: str, db: AsyncSession
    ) -> Conversation:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise ValueError("Conversation not found")

        conv.previous_agent_id = conv.assigned_agent_id
        conv.assigned_agent_id = target_agent_id
        conv.status = "active"
        conv.updated_at = datetime.now(timezone.utc)
        await db.flush()

        await ws_manager.broadcast_all({
            "type": "conversation:assigned",
            "conversation": ConversationService._conv_dict(conv),
        })
        return conv

    # ── Transfer ──────────────────────────────────────────────
    @staticmethod
    async def transfer(
        conversation_id: str,
        from_agent_id: str,
        to_agent_id: str,
        note: str | None,
        db: AsyncSession,
    ) -> Conversation:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise ValueError("Conversation not found")

        conv.previous_agent_id = from_agent_id
        conv.assigned_agent_id = to_agent_id
        conv.transfer_note = note
        conv.updated_at = datetime.now(timezone.utc)
        await db.flush()

        # Log the transfer
        log_entry = TransferLog(
            conversation_id=conversation_id,
            from_agent_id=from_agent_id,
            to_agent_id=to_agent_id,
            note=note,
        )
        db.add(log_entry)
        await db.flush()

        # Add system message
        sys_msg = Message(
            conversation_id=conversation_id,
            sender_type="system",
            content=f"Conversation transferred{f': {note}' if note else ''}",
            content_type="system_event",
        )
        db.add(sys_msg)
        await db.flush()

        await ws_manager.broadcast_all({
            "type": "conversation:transferred",
            "conversation": ConversationService._conv_dict(conv),
        })
        return conv

    # ── Resolve ───────────────────────────────────────────────
    @staticmethod
    async def resolve(
        conversation_id: str, db: AsyncSession
    ) -> Conversation:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise ValueError("Conversation not found")

        conv.status = "resolved"
        conv.resolved_at = datetime.now(timezone.utc)
        conv.updated_at = datetime.now(timezone.utc)
        await db.flush()

        # System message
        sys_msg = Message(
            conversation_id=conversation_id,
            sender_type="system",
            content="Conversation resolved",
            content_type="system_event",
        )
        db.add(sys_msg)
        await db.flush()

        # If WhatsApp conversation, send resolved message
        if conv.channel == "whatsapp" and conv.customer_phone:
            resolved_setting = await db.execute(
                select(Setting).where(Setting.key == "resolved_message")
            )
            resolved_msg = resolved_setting.scalar_one_or_none()
            if resolved_msg:
                await wa_service.send_text_message(
                    wa_service.company_phone_id or "",
                    conv.customer_phone,
                    resolved_msg.value,
                )

        await ws_manager.broadcast_all({
            "type": "conversation:resolved",
            "conversation": ConversationService._conv_dict(conv),
        })

        pending_count = await ConversationService._pending_count(db)
        await ws_manager.broadcast_all({"type": "queue:update", "count": pending_count})

        return conv

    # ── Reopen ────────────────────────────────────────────────
    @staticmethod
    async def reopen(
        conversation_id: str, db: AsyncSession
    ) -> Conversation:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise ValueError("Conversation not found")

        conv.status = "active" if conv.assigned_agent_id else "pending"
        conv.resolved_at = None
        conv.updated_at = datetime.now(timezone.utc)
        await db.flush()

        sys_msg = Message(
            conversation_id=conversation_id,
            sender_type="system",
            content="Conversation reopened",
            content_type="system_event",
        )
        db.add(sys_msg)
        await db.flush()

        await ws_manager.broadcast_all({
            "type": "conversation:new",
            "conversation": ConversationService._conv_dict(conv),
        })
        return conv

    # ── Helpers ───────────────────────────────────────────────
    @staticmethod
    async def _pending_count(db: AsyncSession) -> int:
        result = await db.execute(
            select(func.count(Conversation.id)).where(Conversation.status == "pending")
        )
        return result.scalar() or 0

    @staticmethod
    def _conv_dict(conv: Conversation) -> dict:
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
            "last_message_at": conv.last_message_at.isoformat() if conv.last_message_at else None,
            "resolved_at": conv.resolved_at.isoformat() if conv.resolved_at else None,
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
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
            "wa_message_id": msg.wa_message_id,
            "wa_sent_from": msg.wa_sent_from,
            "delivery_status": msg.delivery_status,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
        }
