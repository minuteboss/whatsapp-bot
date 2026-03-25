"""
Superadmin router — tenant management API.
Only accessible by agents with role='superadmin'.
"""

import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Tenant, Agent, Conversation
from middleware.auth import require_superadmin

router = APIRouter(prefix="/api/superadmin", tags=["superadmin"])


# ── List tenants ──────────────────────────────────────────────
@router.get("/tenants")
async def list_tenants(
    agent: Agent = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).order_by(Tenant.created_at.desc()))
    tenants = result.scalars().all()
    return [_tenant_dict(t) for t in tenants]


# ── Create tenant ─────────────────────────────────────────────
@router.post("/tenants")
async def create_tenant(
    data: dict,
    agent: Agent = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    # Validate required fields
    name = data.get("name")
    slug = data.get("slug")
    if not name or not slug:
        raise HTTPException(status_code=422, detail="name and slug are required")

    # Check duplicate slug
    existing = await db.execute(select(Tenant).where(Tenant.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Tenant slug already exists")

    tenant = Tenant(
        name=name,
        slug=slug,
        plan=data.get("plan", "free"),
        max_agents=data.get("max_agents", 5),
        max_chats_per_agent=data.get("max_chats_per_agent", 10),
        whatsapp_token=data.get("whatsapp_token"),
        whatsapp_company_phone_number_id=data.get("whatsapp_company_phone_number_id"),
        whatsapp_business_account_id=data.get("whatsapp_business_account_id"),
        whatsapp_app_secret=data.get("whatsapp_app_secret"),
        whatsapp_verify_token=data.get("whatsapp_verify_token"),
        widget_api_key=f"wk_{secrets.token_hex(24)}",
    )
    db.add(tenant)
    await db.flush()
    await db.commit()
    return _tenant_dict(tenant)


# ── Update tenant ─────────────────────────────────────────────
@router.patch("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: str,
    data: dict,
    agent: Agent = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    allowed = [
        "name", "plan", "is_active", "max_agents", "max_chats_per_agent",
        "whatsapp_token", "whatsapp_company_phone_number_id",
        "whatsapp_business_account_id", "whatsapp_app_secret", "whatsapp_verify_token",
    ]
    for key in allowed:
        if key in data:
            setattr(tenant, key, data[key])

    await db.flush()
    await db.commit()
    return _tenant_dict(tenant)


# ── Delete (soft) tenant ──────────────────────────────────────
@router.delete("/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    agent: Agent = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.is_active = False
    await db.flush()
    await db.commit()
    return {"detail": "Tenant deactivated"}


# ── Tenant stats ──────────────────────────────────────────────
@router.get("/tenants/{tenant_id}/stats")
async def tenant_stats(
    tenant_id: str,
    agent: Agent = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    agents_count = (await db.execute(
        select(func.count(Agent.id)).where(Agent.tenant_id == tenant_id)
    )).scalar() or 0

    conversations_count = (await db.execute(
        select(func.count(Conversation.id)).where(Conversation.tenant_id == tenant_id)
    )).scalar() or 0

    active_count = (await db.execute(
        select(func.count(Conversation.id)).where(
            Conversation.tenant_id == tenant_id,
            Conversation.status == "active",
        )
    )).scalar() or 0

    return {
        "tenant": _tenant_dict(tenant),
        "agents": agents_count,
        "conversations": conversations_count,
        "active_conversations": active_count,
    }


def _tenant_dict(t: Tenant) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "slug": t.slug,
        "plan": t.plan,
        "is_active": t.is_active,
        "max_agents": t.max_agents,
        "max_chats_per_agent": t.max_chats_per_agent,
        "widget_api_key": t.widget_api_key,
        "whatsapp_configured": bool(t.whatsapp_token),
        "created_at": str(t.created_at) if t.created_at else None,
        "updated_at": str(t.updated_at) if t.updated_at else None,
    }
