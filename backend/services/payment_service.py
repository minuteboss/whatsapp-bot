"""
Payment Integration Service for handling Wallet top-ups.
Currently supports mock/stub flows for PayPal, M-Pesa, and Manual Bank transfers.
"""

import logging
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from models.tenant import Tenant
from models.wallet_transaction import WalletTransaction

logger = logging.getLogger(__name__)


class PaymentService:
    @staticmethod
    async def initiate_mpesa_stk(tenant: Tenant, amount_cents: int, phone_number: str, db: AsyncSession) -> WalletTransaction:
        """
        Initiate an M-Pesa STK push.
        For now, this logs a pending transaction and mocks the API call.
        """
        tx = WalletTransaction(
            tenant_id=tenant.id,
            amount=amount_cents,
            type="topup",
            method="mpesa",
            status="pending",
            reference=f"MPESA-{uuid.uuid4().hex[:8].upper()}",
            description=f"M-Pesa topup via {phone_number}"
        )
        db.add(tx)
        await db.flush()
        
        # MOCK: In a real integration, we'd call the Daraja API here
        logger.info(f"Initiated M-Pesa STK Push for {amount_cents} cents to {phone_number}")
        
        return tx

    @staticmethod
    async def create_paypal_order(tenant: Tenant, amount_cents: int, db: AsyncSession) -> WalletTransaction:
        """
        Create a PayPal order for checkout.
        Logs a pending transaction and returns the order reference.
        """
        tx = WalletTransaction(
            tenant_id=tenant.id,
            amount=amount_cents,
            type="topup",
            method="paypal",
            status="pending",
            reference=f"PAYPAL-{uuid.uuid4().hex[:12].upper()}",
            description="PayPal topup"
        )
        db.add(tx)
        await db.flush()
        
        # MOCK: Call PayPal Orders API here
        logger.info(f"Created PayPal Order for {amount_cents} cents")
        
        return tx

    @staticmethod
    async def log_bank_transfer(tenant: Tenant, amount_cents: int, bank_ref: str, db: AsyncSession) -> WalletTransaction:
        """
        Log a pending manual bank transfer for superadmin approval.
        """
        tx = WalletTransaction(
            tenant_id=tenant.id,
            amount=amount_cents,
            type="topup",
            method="bank",
            status="pending", # Requires superadmin to mark 'completed'
            reference=bank_ref,
            description="Manual bank transfer"
        )
        db.add(tx)
        await db.flush()
        
        logger.info(f"Logged pending bank transfer of {amount_cents} cents with ref {bank_ref}")
        
        return tx

    @staticmethod
    async def complete_transaction(tx: WalletTransaction, db: AsyncSession):
        """Mark a pending transaction as completed and fund the wallet."""
        if tx.status == "completed":
            return
            
        tx.status = "completed"
        # Fetch the tenant and increment balance
        from sqlalchemy import select
        result = await db.execute(select(Tenant).where(Tenant.id == tx.tenant_id))
        tenant = result.scalar_one_or_none()
        
        if tenant:
            tenant.wallet_balance += tx.amount
            await db.flush()
            logger.info(f"Funded wallet for tenant {tenant.slug} by {tx.amount} cents. New balance: {tenant.wallet_balance}")

payment_service = PaymentService()
