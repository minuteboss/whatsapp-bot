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

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login")
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
async def me(agent: Agent = Depends(get_current_agent)):
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
