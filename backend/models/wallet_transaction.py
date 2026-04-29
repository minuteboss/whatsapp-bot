"""
Wallet Transaction model — tracks top-ups, deductions, and payment integration references.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True, nullable=False)
    
    amount: Mapped[int] = mapped_column(Integer, nullable=False) # In cents
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    
    type: Mapped[str] = mapped_column(String(20), nullable=False) # topup | deduction
    method: Mapped[str] = mapped_column(String(50), nullable=False) # mpesa | paypal | bank | system | whatsapp_usage
    
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True) # Payment gateway reference ID
    status: Mapped[str] = mapped_column(String(20), default="pending") # pending | completed | failed
    
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
