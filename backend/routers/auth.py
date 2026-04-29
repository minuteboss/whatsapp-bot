"""
Authentication router — login, logout, me, ws-ticket.
Sets httpOnly cookie on login, clears on logout.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models.agent import Agent
from middleware.auth import (
    verify_password, hash_password, create_access_token,
    get_current_agent, create_ws_ticket,
)
from middleware.tenant import get_current_tenant
from models.tenant import Tenant
from rate_limiter import limiter

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login")
@limiter.limit("10/minute")
async def login(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    email = body.get("email")
    password = body.get("password")

    if not email or not password:
        raise HTTPException(status_code=422, detail="Email and password required")

    result = await db.execute(select(Agent).where(Agent.email == email))
    agent = result.scalar_one_or_none()

    if not agent or not verify_password(password, agent.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Verify agent's tenant is active
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == agent.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if not tenant or not tenant.is_active:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": agent.id})

    # Set httpOnly cookie
    is_prod = settings.ENVIRONMENT == "production"
    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        path="/",
        max_age=settings.JWT_EXPIRY_HOURS * 3600,
    )

    return {
        "agent": {
            "id": agent.id,
            "name": agent.name,
            "email": agent.email,
            "role": agent.role,
            "status": agent.status,
            "max_chats": agent.max_chats,
            "wa_connected": agent.wa_connected,
            "wa_phone_number": agent.wa_phone_number,
            "tenant_id": agent.tenant_id,
        }
    }


@router.get("/me")
async def me(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db)
):
    # Fetch tenant to get billing status and wallet balance
    tenant_result = await db.execute(select(Tenant.billing_status, Tenant.wallet_balance).where(Tenant.id == agent.tenant_id))
    tenant_row = tenant_result.first()
    billing_status = tenant_row[0] if tenant_row else "trial"
    wallet_balance = tenant_row[1] if tenant_row else 0

    return {
        "id": agent.id,
        "name": agent.name,
        "email": agent.email,
        "role": agent.role,
        "status": agent.status,
        "max_chats": agent.max_chats,
        "wa_connected": agent.wa_connected,
        "wa_phone_number": agent.wa_phone_number,
        "wa_phone_number_id": agent.wa_phone_number_id,
        "tenant_id": agent.tenant_id,
        "tenant_billing_status": billing_status,
        "tenant_wallet_balance": wallet_balance,
    }


@router.post("/logout")
async def logout(
    response: Response,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    agent.status = "offline"
    await db.flush()

    # Clear httpOnly cookie
    response.delete_cookie(key="auth_token", path="/")

    return {"detail": "Logged out"}


@router.post("/ws-ticket")
async def ws_ticket(agent: Agent = Depends(get_current_agent)):
    """Generate a short-lived ticket for WebSocket authentication."""
    ticket = create_ws_ticket(agent.id)
    return {"ticket": ticket}
