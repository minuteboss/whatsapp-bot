"""
Sub-tenants router — allow tenants to manage their own sub-tenants (reseller mode).
Only accessible by agents with role='admin' or 'superadmin'.
"""

import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models import Tenant, Agent, Conversation
from middleware.auth import require_admin, hash_password, create_access_token
from middleware.tenant import get_current_tenant

router = APIRouter(prefix="/api/v1/admin/sub-tenants", tags=["admin-subtenants"])


@router.get("")
async def list_subtenants(
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List all sub-tenants of the current tenant."""
    result = await db.execute(
        select(Tenant)
        .where(Tenant.parent_id == tenant.id)
        .order_by(Tenant.created_at.desc())
    )
    subtenants = result.scalars().all()
    
    # Simple dict conversion for now
    return [{
        "id": s.id,
        "name": s.name,
        "slug": s.slug,
        "is_active": s.is_active,
        "max_agents": s.max_agents or 5,
        "max_chats_per_agent": s.max_chats_per_agent or 10,
        "created_at": str(s.created_at),
    } for s in subtenants]


@router.post("")
async def create_subtenant(
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Create a new sub-tenant under the current tenant."""
    name = data.get("name", "").strip()
    slug = data.get("slug", "").strip()
    if not name or not slug:
        raise HTTPException(status_code=422, detail="name and slug are required")

    # Ensure slug is unique
    existing = await db.execute(select(Tenant).where(Tenant.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Tenant slug already exists")

    new_subtenant = Tenant(
        name=name,
        slug=slug,
        parent_id=tenant.id,
        max_agents=data.get("max_agents", 2),
        max_chats_per_agent=data.get("max_chats_per_agent", 5),
        widget_api_key=f"wk_{secrets.token_hex(24)}",
        api_key=f"sk_live_{secrets.token_hex(32)}",
    )
    db.add(new_subtenant)
    await db.flush()
    await db.commit()
    
    return {
        "id": new_subtenant.id,
        "name": new_subtenant.name,
        "slug": new_subtenant.slug,
        "widget_api_key": new_subtenant.widget_api_key,
        "api_key": new_subtenant.api_key,
    }

@router.get("/{subtenant_id}")
async def get_subtenant(
    subtenant_id: str,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Get details of a specific sub-tenant."""
    result = await db.execute(
        select(Tenant).where(Tenant.id == subtenant_id, Tenant.parent_id == tenant.id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Sub-tenant not found or not owned by you")
    
    return {
        "id": sub.id,
        "name": sub.name,
        "slug": sub.slug,
        "is_active": sub.is_active,
        "max_agents": sub.max_agents,
        "max_chats_per_agent": sub.max_chats_per_agent,
        "whatsapp_configured": bool(sub.whatsapp_token and sub.whatsapp_company_phone_number_id),
    }

@router.patch("/{subtenant_id}")
async def update_subtenant(
    subtenant_id: str,
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Update a sub-tenant."""
    result = await db.execute(
        select(Tenant).where(Tenant.id == subtenant_id, Tenant.parent_id == tenant.id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Sub-tenant not found")

    allowed = ["name", "is_active", "max_agents", "max_chats_per_agent"]
    for key in allowed:
        if key in data:
            setattr(sub, key, data[key])

    await db.flush()
    await db.commit()
    return {"detail": "Sub-tenant updated"}


@router.delete("/{subtenant_id}")
async def delete_subtenant(
    subtenant_id: str,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Delete (deactivate) a sub-tenant and rename its slug."""
    result = await db.execute(
        select(Tenant).where(Tenant.id == subtenant_id, Tenant.parent_id == tenant.id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Sub-tenant not found")

    ts = int(datetime.now().timestamp())
    sub.slug = f"{sub.slug}-deleted-{ts}"
    sub.is_active = False

    await db.flush()
    await db.commit()
    return {"detail": "Sub-tenant deactivated and slug freed"}

# ── Sub-tenant Agent Management ──────────────────────────────

@router.get("/{subtenant_id}/agents")
async def list_subtenant_agents(
    subtenant_id: str,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List agents of a specific sub-tenant."""
    res = await db.execute(select(Tenant).where(Tenant.id == subtenant_id, Tenant.parent_id == tenant.id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Sub-tenant not found")

    result = await db.execute(select(Agent).where(Agent.tenant_id == subtenant_id))
    agents = result.scalars().all()
    return [{
        "id": a.id, "name": a.name, "email": a.email, "role": a.role, "status": a.status,
    } for a in agents]

@router.post("/{subtenant_id}/agents")
async def create_subtenant_agent(
    subtenant_id: str,
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Create an agent for a sub-tenant."""
    res = await db.execute(select(Tenant).where(Tenant.id == subtenant_id, Tenant.parent_id == tenant.id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Sub-tenant not found")

    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    if not name or not email or not password:
        raise HTTPException(status_code=422, detail="Name, email, and password required")

    existing = await db.execute(select(Agent).where(Agent.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    new_agent = Agent(
        name=name,
        email=email,
        password_hash=hash_password(password),
        role=data.get("role", "agent"),
        tenant_id=subtenant_id,
        max_chats=data.get("max_chats", 5),
    )
    db.add(new_agent)
    await db.flush()
    await db.commit()
    return {"id": new_agent.id, "name": new_agent.name, "email": new_agent.email}

@router.patch("/{subtenant_id}/agents/{agent_id}")
async def update_subtenant_agent(
    subtenant_id: str,
    agent_id: str,
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Update a sub-tenant's agent (e.g. password reset)."""
    res = await db.execute(select(Tenant).where(Tenant.id == subtenant_id, Tenant.parent_id == tenant.id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Sub-tenant not found")

    result = await db.execute(select(Agent).where(Agent.id == agent_id, Agent.tenant_id == subtenant_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Agent not found")

    if "password" in data:
        target.password_hash = hash_password(data["password"])
    if "name" in data:
        target.name = data["name"]
    if "role" in data:
        target.role = data["role"]
    if "max_chats" in data:
        target.max_chats = data["max_chats"]

    await db.flush()
    await db.commit()
    return {"detail": "Agent updated"}

@router.post("/{subtenant_id}/agents/{agent_id}/impersonate")
async def impersonate_subtenant_agent(
    subtenant_id: str,
    agent_id: str,
    response: Response,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Allow reseller admin to impersonate a sub-tenant agent."""
    res = await db.execute(select(Tenant).where(Tenant.id == subtenant_id, Tenant.parent_id == tenant.id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Sub-tenant not found")

    result = await db.execute(select(Agent).where(Agent.id == agent_id, Agent.tenant_id == subtenant_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Agent not found")

    token = create_access_token({"sub": target.id})
    is_prod = settings.ENVIRONMENT == "production"
    response.set_cookie(
        key="auth_token", value=token, httponly=True, secure=is_prod, samesite="lax", path="/",
        max_age=settings.JWT_EXPIRY_HOURS * 3600,
    )
    return {"detail": f"Impersonating {target.name}", "agent": {"id": target.id, "name": target.name, "role": target.role, "tenant_id": target.tenant_id}}

@router.delete("/{subtenant_id}/agents/{agent_id}")
async def delete_subtenant_agent(
    subtenant_id: str,
    agent_id: str,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Delete a sub-tenant's agent."""
    # Verify ownership
    res = await db.execute(select(Tenant).where(Tenant.id == subtenant_id, Tenant.parent_id == tenant.id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Sub-tenant not found")

    result = await db.execute(select(Agent).where(Agent.id == agent_id, Agent.tenant_id == subtenant_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Agent not found")

    await db.delete(target)
    await db.commit()
    return {"detail": "Agent deleted"}
