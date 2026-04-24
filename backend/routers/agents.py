"""
Agents router — list, create, update, delete agents + WhatsApp connect flow.
All queries scoped to the current tenant.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.agent import Agent
from models.tenant import Tenant
from middleware.auth import get_current_agent, require_admin, hash_password, verify_password
from middleware.tenant import get_current_tenant
from services.whatsapp_service import wa_service

import secrets

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


@router.get("")
async def list_agents(
    agent: Agent = Depends(get_current_agent),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Agent).where(Agent.tenant_id == tenant.id).order_by(Agent.created_at)
    )
    agents = result.scalars().all()
    return [_agent_dict(a) for a in agents]


@router.post("")
async def create_agent(
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    name = data.get("name", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")
    role = data.get("role", "agent")

    if not name or not email or not password:
        raise HTTPException(status_code=422, detail="name, email, and password required")
    if len(name) > 255:
        raise HTTPException(status_code=422, detail="Name too long (max 255)")
    if len(email) > 255:
        raise HTTPException(status_code=422, detail="Email too long (max 255)")

    # Check email uniqueness
    existing = await db.execute(select(Agent).where(Agent.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already in use")

    # Check tenant agent limit
    from sqlalchemy import func
    count = (await db.execute(
        select(func.count(Agent.id)).where(Agent.tenant_id == tenant.id)
    )).scalar() or 0
    if count >= tenant.max_agents:
        raise HTTPException(status_code=403, detail=f"Tenant agent limit reached ({tenant.max_agents})")

    agent = Agent(
        name=name,
        email=email,
        password_hash=hash_password(password),
        role=role if role in ("agent", "support", "sales", "developer", "admin") else "agent",
        tenant_id=tenant.id,
        api_key=f"sk_{secrets.token_hex(32)}",
        max_chats=data.get("max_chats", tenant.max_chats_per_agent),
    )
    db.add(agent)
    await db.flush()
    await db.commit()
    return _agent_dict(agent)


@router.patch("/{agent_id}")
async def update_agent(
    agent_id: str,
    data: dict,
    current_agent: Agent = Depends(get_current_agent),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.tenant_id == tenant.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Admin can update all fields, agent can update name + status only
    if current_agent.role in ("admin", "superadmin"):
        allowed = ["name", "email", "role", "status", "max_chats"]
    else:
        if agent_id != current_agent.id:
            raise HTTPException(status_code=403, detail="Cannot update other agents")
        allowed = ["name", "status"]

    for key in allowed:
        if key in data:
            setattr(agent, key, data[key])

    if "password" in data and data["password"]:
        if agent_id == current_agent.id and current_agent.role not in ("admin", "superadmin"):
            # Regular agents must verify current password before changing their own
            current_pw = data.get("current_password", "")
            if not current_pw or not verify_password(current_pw, agent.password_hash):
                raise HTTPException(status_code=400, detail="Current password is incorrect")
            agent.password_hash = hash_password(data["password"])
        elif agent_id == current_agent.id:
            # Admin/superadmin changing own password — also require current password
            current_pw = data.get("current_password", "")
            if not current_pw or not verify_password(current_pw, agent.password_hash):
                raise HTTPException(status_code=400, detail="Current password is incorrect")
            agent.password_hash = hash_password(data["password"])
        elif current_agent.role in ("admin", "superadmin"):
            # Admin resetting another agent's password — no current password needed
            agent.password_hash = hash_password(data["password"])

    await db.flush()
    await db.commit()
    return _agent_dict(agent)


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: str,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.tenant_id == tenant.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    await db.delete(agent)
    await db.flush()
    await db.commit()
    return {"detail": "Agent deleted"}


# ── WhatsApp Connect Flow ────────────────────────────────────
@router.post("/{agent_id}/wa/connect/initiate")
async def wa_connect_initiate(
    agent_id: str,
    data: dict,
    current_agent: Agent = Depends(get_current_agent),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    Directly associate a WhatsApp Phone Number ID with this agent.
    The phone_number_id must already be registered in Meta Business Manager.
    No OTP verification is needed — the admin controls access to Meta credentials.
    """
    phone_number_id = (data.get("phone_number_id") or data.get("phone_number", "")).strip()
    if not phone_number_id:
        raise HTTPException(status_code=422, detail="phone_number_id required")

    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.tenant_id == tenant.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    from datetime import datetime, timezone
    agent.wa_phone_number_id = phone_number_id
    agent.wa_phone_number = phone_number_id  # shown in profile UI
    agent.wa_connected = True
    agent.wa_connected_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()
    await db.commit()
    return _agent_dict(agent)


@router.delete("/{agent_id}/wa/connect")
async def wa_disconnect(
    agent_id: str,
    current_agent: Agent = Depends(get_current_agent),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.tenant_id == tenant.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.wa_connected = False
    agent.wa_phone_number = None
    agent.wa_phone_number_id = None
    agent.wa_connected_at = None
    await db.flush()
    await db.commit()
    return {"detail": "WhatsApp disconnected"}


def _agent_dict(a: Agent) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "email": a.email,
        "role": a.role,
        "status": a.status,
        "max_chats": a.max_chats,
        "wa_connected": a.wa_connected,
        "wa_phone_number": a.wa_phone_number,
        "wa_phone_number_id": a.wa_phone_number_id,
        "wa_connected_at": a.wa_connected_at.isoformat() + "Z" if a.wa_connected_at else None,
        "api_key": a.api_key,
        "tenant_id": a.tenant_id,
        "created_at": a.created_at.isoformat() + "Z" if a.created_at else None,
        "updated_at": a.updated_at.isoformat() + "Z" if a.updated_at else None,
    }
