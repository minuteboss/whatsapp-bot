"""
Message ORM model.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id"), nullable=False
    )
    sender_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'customer'|'agent'|'system'|'bot'
    sender_agent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("agents.id"), nullable=True
    )
    sender_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(String(20), nullable=False, default="text")

    # WhatsApp tracking
    wa_message_id: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    wa_sent_from: Mapped[str | None] = mapped_column(String(20), nullable=True)
    delivery_status: Mapped[str] = mapped_column(String(20), nullable=False, default="sent")

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
