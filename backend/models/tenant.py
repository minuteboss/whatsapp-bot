"""
Tenant model — represents a company/organisation using the platform.
Each tenant has isolated agents, conversations, messages, settings, and WhatsApp credentials.
"""

import uuid
from datetime import datetime, timezone
import secrets

from sqlalchemy import Column, String, Boolean, Integer, DateTime
from database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    plan = Column(String(20), default="free")  # free / pro / enterprise
    is_active = Column(Boolean, default=True)
    max_agents = Column(Integer, default=5)
    max_chats_per_agent = Column(Integer, default=10)

    # ── Per-tenant WhatsApp credentials (override global env vars) ──
    whatsapp_token = Column(String(512), nullable=True)
    whatsapp_company_phone_number_id = Column(String(100), nullable=True)
    whatsapp_business_account_id = Column(String(100), nullable=True)
    whatsapp_app_secret = Column(String(255), nullable=True)
    whatsapp_verify_token = Column(String(255), nullable=True)

    # ── Widget ────────────────────────────────────────────────────
    widget_api_key = Column(String(100), unique=True, nullable=False,
                            default=lambda: f"wk_{secrets.token_hex(24)}")

    # ── Timestamps ────────────────────────────────────────────────
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
                        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
