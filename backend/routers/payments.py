"""
Payments router — Tenant endpoints for adding funds.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any

from database import get_db
from models.tenant import Tenant
from models.wallet_transaction import WalletTransaction
from middleware.tenant import get_current_tenant
from services.payment_service import payment_service

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])

@router.get("/transactions")
async def get_transactions(
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Get wallet transaction history."""
    result = await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.tenant_id == tenant.id)
        .order_by(WalletTransaction.created_at.desc())
    )
    return result.scalars().all()

@router.get("/rates")
async def get_rates(
    tenant: Tenant = Depends(get_current_tenant),
):
    """Get current platform message rates."""
    from services.setting_service import global_settings
    return {
        "marketing": float(global_settings.get("pricing_marketing", "0.0")),
        "utility": float(global_settings.get("pricing_utility", "0.0")),
        "service": float(global_settings.get("pricing_service", "0.0")),
        "auth": float(global_settings.get("pricing_auth", "0.0")),
    }

@router.post("/topup/mpesa")
async def topup_mpesa(
    data: dict,
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Initiate M-Pesa STK push."""
    amount_cents = data.get("amount")
    phone = data.get("phone")
    if not amount_cents or not phone:
        raise HTTPException(status_code=422, detail="Amount and phone number required")
        
    tx = await payment_service.initiate_mpesa_stk(tenant, amount_cents, phone, db)
    await db.commit()
    
    # MOCK: auto-complete for sandbox testing
    import asyncio
    async def mock_callback():
        async with db.session_factory() as session:
            await asyncio.sleep(5) # Simulate delay
            # Refetch
            r = await session.execute(select(WalletTransaction).where(WalletTransaction.id == tx.id))
            t = r.scalar_one()
            await payment_service.complete_transaction(t, session)
            await session.commit()
    
    asyncio.create_task(mock_callback())
    
    return {"message": "STK Push initiated", "transaction_id": tx.id, "reference": tx.reference}

@router.post("/topup/paypal")
async def topup_paypal(
    data: dict,
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Create PayPal order."""
    amount_cents = data.get("amount")
    if not amount_cents:
        raise HTTPException(status_code=422, detail="Amount required")
        
    tx = await payment_service.create_paypal_order(tenant, amount_cents, db)
    await db.commit()
    
    return {"message": "PayPal Order created", "transaction_id": tx.id, "reference": tx.reference}

@router.post("/topup/bank")
async def topup_bank(
    data: dict,
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Log manual bank transfer."""
    amount_cents = data.get("amount")
    bank_ref = data.get("reference")
    if not amount_cents or not bank_ref:
        raise HTTPException(status_code=422, detail="Amount and bank reference required")
        
    tx = await payment_service.log_bank_transfer(tenant, amount_cents, bank_ref, db)
    await db.commit()
    
    return {"message": "Bank transfer logged. Pending superadmin approval.", "transaction_id": tx.id}
