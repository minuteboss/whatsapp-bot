"""
Tenant model — represents a company/organisation using the platform.
Each tenant has isolated agents, conversations, messages, settings, and WhatsApp credentials.
"""

import uuid
from datetime import datetime, timezone
import secrets

from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey
from database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True)
    max_agents = Column(Integer, default=5)
    max_chats_per_agent = Column(Integer, default=10)
    parent_id = Column(String(36), ForeignKey("tenants.id"), nullable=True, index=True)

    # ── Billing / Package / Wallet ────────────────────────────────
    package_id = Column(String(36), ForeignKey("packages.id"), nullable=True, index=True)
    billing_status = Column(String(20), default="trial")     # trial | active | suspended | cancelled
    billing_cycle = Column(String(10), default="monthly")    # monthly | yearly
    trial_ends_at = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    wallet_balance = Column(Integer, default=0) # Stored in cents/minimum currency unit to avoid float precision issues

    # ── Per-tenant WhatsApp credentials (each tenant provides their own) ──
    whatsapp_token = Column(String(512), nullable=True)
    whatsapp_company_phone_number_id = Column(String(100), nullable=True)
    whatsapp_business_account_id = Column(String(100), nullable=True)
    whatsapp_app_secret = Column(String(255), nullable=True)
    whatsapp_verify_token = Column(String(255), nullable=True)

    # ── Integration keys ──────────────────────────────────────────
    widget_api_key = Column(String(100), unique=True, nullable=False,
                            default=lambda: f"wk_{secrets.token_hex(24)}")
    api_key = Column(String(120), unique=True, nullable=True,
                     default=lambda: f"sk_live_{secrets.token_hex(32)}")

    # ── Timestamps ────────────────────────────────────────────────
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
                        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
