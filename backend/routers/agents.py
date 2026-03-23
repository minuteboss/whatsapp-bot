"""
Agents router — /api/v1/agents
"""

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.agent import Agent
from schemas.agent import AgentCreate, AgentUpdate, AgentResponse, WAConnectInitiate, WAConnectVerify
from middleware.auth import get_current_agent, require_admin, hash_password
from services.whatsapp_service import wa_service
from services.websocket_manager import ws_manager

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


@router.get("/")
async def list_agents(
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(get_current_agent),
):
    result = await db.execute(select(Agent))
    agents = result.scalars().all()
    return [
        {
            "id": a.id,
            "name": a.name,
            "email": a.email,
            "role": a.role,
            "status": a.status,
            "max_chats": a.max_chats,
            "wa_connected": a.wa_connected,
            "wa_phone_number": a.wa_phone_number,
        }
        for a in agents
    ]


@router.post("/")
async def create_agent(
    body: AgentCreate,
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(require_admin),
):
    # Check unique email
    existing = await db.execute(select(Agent).where(Agent.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    agent = Agent(
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
        max_chats=body.max_chats,
        api_key=f"sk_{secrets.token_hex(32)}",
    )
    db.add(agent)
    await db.flush()
    return AgentResponse.model_validate(agent)


@router.patch("/{agent_id}")
async def update_agent(
    agent_id: str,
    body: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    current: Agent = Depends(get_current_agent),
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Non-admin can only update own profile (name, status)
    if current.role != "admin" and current.id != agent_id:
        raise HTTPException(status_code=403, detail="Cannot modify another agent")

    update_data = body.model_dump(exclude_unset=True)
    # Non-admin restricted fields
    if current.role != "admin":
        allowed = {"name", "status"}
        update_data = {k: v for k, v in update_data.items() if k in allowed}

    for key, value in update_data.items():
        setattr(agent, key, value)
    agent.updated_at = datetime.now(timezone.utc)
    await db.flush()

    # Broadcast status change
    if "status" in update_data:
        await ws_manager.broadcast_all({
            "type": "agent:status",
            "agent_id": agent.id,
            "status": agent.status,
        })

    return AgentResponse.model_validate(agent)


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(require_admin),
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    await db.delete(agent)
    await db.flush()
    return {"detail": "Agent deleted"}


# ── WhatsApp Connect Flow ────────────────────────────────────

@router.post("/{agent_id}/wa/connect/initiate")
async def wa_connect_initiate(
    agent_id: str,
    body: WAConnectInitiate,
    db: AsyncSession = Depends(get_db),
    current: Agent = Depends(get_current_agent),
):
    if current.id != agent_id and current.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")

    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Register phone with Meta
    reg_result = await wa_service.register_phone_number(body.phone_number)
    if not reg_result:
        raise HTTPException(status_code=502, detail="Failed to register phone number with WhatsApp")

    phone_number_id = reg_result.get("id", "")

    # Request OTP
    await wa_service.request_verification_code(phone_number_id)

    # Store phone info temporarily
    agent.wa_phone_number = body.phone_number
    agent.wa_phone_number_id = phone_number_id
    agent.updated_at = datetime.now(timezone.utc)
    await db.flush()

    return {"detail": "OTP sent", "phone_number_id": phone_number_id}


@router.post("/{agent_id}/wa/connect/verify")
async def wa_connect_verify(
    agent_id: str,
    body: WAConnectVerify,
    db: AsyncSession = Depends(get_db),
    current: Agent = Depends(get_current_agent),
):
    if current.id != agent_id and current.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")

    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not agent.wa_phone_number_id:
        raise HTTPException(status_code=400, detail="No pending connection — initiate first")

    success = await wa_service.verify_phone_otp(agent.wa_phone_number_id, body.code)
    if not success:
        raise HTTPException(status_code=400, detail="Invalid OTP or verification failed")

    agent.wa_connected = True
    agent.wa_connected_at = datetime.now(timezone.utc)
    agent.updated_at = datetime.now(timezone.utc)
    await db.flush()

    return {"detail": "WhatsApp connected", "wa_phone_number": agent.wa_phone_number}


@router.delete("/{agent_id}/wa/connect")
async def wa_disconnect(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    current: Agent = Depends(get_current_agent),
):
    if current.id != agent_id and current.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")

    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if agent.wa_phone_number_id:
        await wa_service.deregister_phone_number(agent.wa_phone_number_id)

    agent.wa_phone_number = None
    agent.wa_phone_number_id = None
    agent.wa_connected = False
    agent.wa_connected_at = None
    agent.updated_at = datetime.now(timezone.utc)
    await db.flush()

    return {"detail": "WhatsApp disconnected"}
