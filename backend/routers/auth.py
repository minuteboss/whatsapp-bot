"""
Auth router — /api/v1/auth
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.agent import Agent
from schemas.auth import LoginRequest, TokenResponse
from middleware.auth import (
    verify_password,
    create_access_token,
    get_current_agent,
)
from services.websocket_manager import ws_manager

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.email == body.email))
    agent = result.scalar_one_or_none()
    if not agent or not verify_password(body.password, agent.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": agent.id, "role": agent.role})
    return TokenResponse(
        access_token=token,
        agent={
            "id": agent.id,
            "name": agent.name,
            "email": agent.email,
            "role": agent.role,
            "status": agent.status,
            "max_chats": agent.max_chats,
            "wa_connected": agent.wa_connected,
            "wa_phone_number": agent.wa_phone_number,
        },
    )


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
        "api_key": agent.api_key,
    }


@router.post("/logout")
async def logout(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    agent.status = "offline"
    await db.flush()
    await ws_manager.broadcast_all({
        "type": "agent:status",
        "agent_id": agent.id,
        "status": "offline",
    })
    return {"detail": "Logged out"}
