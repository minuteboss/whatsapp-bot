"""
Agent ORM model.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    tenant_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tenants.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(500), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="agent")  # agent|admin|superadmin
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="offline")
    max_chats: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    api_key: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)

    # Personal WhatsApp connection
    wa_phone_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    wa_phone_number_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    wa_connected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    wa_connected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )

