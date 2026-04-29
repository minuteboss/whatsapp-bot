"""
Invoice ORM model — represents a billing invoice for a tenant for a given period.
Created and managed by superadmin.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Float, DateTime, Text, ForeignKey
from database import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)

    # Billing period
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)

    # Financials
    amount = Column(Float, nullable=False, default=0.0)
    currency = Column(String(3), nullable=False, default="USD")

    # Status: draft | sent | paid | void
    status = Column(String(20), nullable=False, default="draft")

    # Optional breakdown / notes
    notes = Column(Text, nullable=True)

    # Usage snapshot at invoice time
    conversations_marketing = Column(Float, nullable=True)
    conversations_utility = Column(Float, nullable=True)
    conversations_service = Column(Float, nullable=True)
    conversations_authentication = Column(Float, nullable=True)
    conversations_total = Column(Float, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )
