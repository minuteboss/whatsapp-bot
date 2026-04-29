"""
WhatsApp Usage ORM model — tracks billable conversations.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class WhatsAppUsage(Base):
    __tablename__ = "whatsapp_usage"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id"), nullable=False, index=True
    )
    
    # Meta Conversation Details
    wa_conversation_id: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)  # marketing, utility, service, authentication
    pricing_model: Mapped[str | None] = mapped_column(String(50), nullable=True) # CBP, etc.
    
    # Window Details
    expiration_timestamp: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
