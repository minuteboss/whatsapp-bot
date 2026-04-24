"""
Package model — represents a billing plan/package with defined capabilities.
Superadmin creates packages and assigns them to tenants.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Boolean, Integer, Float, Text, DateTime
from database import Base


class Package(Base):
    __tablename__ = "packages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    slug = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)

    # ── Capability limits ─────────────────────────────────────────
    max_agents = Column(Integer, default=5)
    max_chats_per_agent = Column(Integer, default=10)
    max_contacts = Column(Integer, default=500)
    max_broadcasts_per_month = Column(Integer, default=10)
    max_templates = Column(Integer, default=10)

    # ── Feature flags ─────────────────────────────────────────────
    has_widget = Column(Boolean, default=True)
    has_whatsapp = Column(Boolean, default=True)
    has_api_access = Column(Boolean, default=False)
    has_sub_tenants = Column(Boolean, default=False)

    # ── Pricing (display only, no payment processing) ─────────────
    price_monthly = Column(Float, default=0.0)
    price_yearly = Column(Float, default=0.0)
    currency = Column(String(3), default="USD")

    # ── Meta ──────────────────────────────────────────────────────
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
                        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
