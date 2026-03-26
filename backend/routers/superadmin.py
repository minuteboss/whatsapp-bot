"""
Superadmin router — system-level tenant and agent management.
Only accessible by agents with role='superadmin'.
"""

import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Tenant, Agent, Conversation
from models.message import Message
from middleware.auth import require_superadmin, hash_password

router = APIRouter(prefix="/api/superadmin", tags=["superadmin"])


# ── List tenants ───────────────────────────────────────────────
@router.get("/tenants")
async def list_tenants(
    agent: Agent = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).order_by(Tenant.created_at.desc()))
    tenants = result.scalars().all()
    # Attach per-tenant agent + conversation counts in one pass
    tenant_ids = [t.id for t in tenants]
    agent_counts = {}
    conv_counts = {}
    if tenant_ids:
        for row in (await db.execute(
            select(Agent.tenant_id, func.count(Agent.id))
            .where(Agent.tenant_id.in_(tenant_ids))
            .group_by(Agent.tenant_id)
        )).all():
            agent_counts[row[0]] = row[1]
        for row in (await db.execute(
            select(Conversation.tenant_id, func.count(Conversation.id))
            .where(Conversation.tenant_id.in_(tenant_ids))
            .group_by(Conversation.tenant_id)
        )).all():
            conv_counts[row[0]] = row[1]
    return [_tenant_dict(t, agent_count=agent_counts.get(t.id, 0), conv_count=conv_counts.get(t.id, 0)) for t in tenants]


# ── Create tenant ──────────────────────────────────────────────
@router.post("/tenants")
async def create_tenant(
    data: dict,
    agent: Agent = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    name = data.get("name", "").strip()
    slug = data.get("slug", "").strip()
    if not name or not slug:
        raise HTTPException(status_code=422, detail="name and slug are required")

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
        api_key=f"sk_live_{secrets.token_hex(32)}",
    )
    db.add(tenant)
    await db.flush()
    await db.commit()
    return _tenant_dict(tenant, include_keys=True)


# ── Update tenant ──────────────────────────────────────────────
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

    # Slug uniqueness check if changing
    if "slug" in data and data["slug"] != tenant.slug:
        conflict = await db.execute(select(Tenant).where(Tenant.slug == data["slug"]))
        if conflict.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Slug already in use")

    allowed = [
        "name", "slug", "plan", "is_active", "max_agents", "max_chats_per_agent",
        "whatsapp_token", "whatsapp_company_phone_number_id",
        "whatsapp_business_account_id", "whatsapp_app_secret", "whatsapp_verify_token",
    ]
    for key in allowed:
        if key in data:
            setattr(tenant, key, data[key])

    await db.flush()
    await db.commit()
    return _tenant_dict(tenant)


# ── Delete (soft) tenant ───────────────────────────────────────
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


# ── Rotate widget key ──────────────────────────────────────────
@router.post("/tenants/{tenant_id}/rotate-widget-key")
async def rotate_widget_key(
    tenant_id: str,
    agent: Agent = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.widget_api_key = f"wk_{secrets.token_hex(24)}"
    await db.flush()
    await db.commit()
    return {"widget_api_key": tenant.widget_api_key}


# ── Rotate REST API key ────────────────────────────────────────
@router.post("/tenants/{tenant_id}/rotate-api-key")
async def rotate_api_key(
    tenant_id: str,
    agent: Agent = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.api_key = f"sk_live_{secrets.token_hex(32)}"
    await db.flush()
    await db.commit()
    return {"api_key": tenant.api_key}


# ── Tenant stats ───────────────────────────────────────────────
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


# ── Tenant agents CRUD ─────────────────────────────────────────
@router.get("/tenants/{tenant_id}/agents")
async def list_tenant_agents(
    tenant_id: str,
    agent: Agent = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _get_tenant(tenant_id, db)
    result = await db.execute(
        select(Agent).where(Agent.tenant_id == tenant_id).order_by(Agent.created_at)
    )
    return [_agent_dict(a) for a in result.scalars().all()]


@router.post("/tenants/{tenant_id}/agents")
async def create_tenant_agent(
    tenant_id: str,
    data: dict,
    agent: Agent = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _get_tenant(tenant_id, db)

    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    role = data.get("role", "agent")

    if not name or not email or not password:
        raise HTTPException(status_code=422, detail="name, email, and password required")
    if role not in ("agent", "admin"):
        raise HTTPException(status_code=422, detail="role must be agent or admin")

    existing = await db.execute(select(Agent).where(Agent.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already in use")

    count = (await db.execute(
        select(func.count(Agent.id)).where(Agent.tenant_id == tenant_id)
    )).scalar() or 0
    if count >= tenant.max_agents:
        raise HTTPException(status_code=403, detail=f"Agent limit reached ({tenant.max_agents})")

    new_agent = Agent(
        name=name,
        email=email,
        password_hash=hash_password(password),
        role=role,
        tenant_id=tenant_id,
        api_key=f"sk_{secrets.token_hex(32)}",
        max_chats=data.get("max_chats", tenant.max_chats_per_agent),
    )
    db.add(new_agent)
    await db.flush()
    await db.commit()
    return _agent_dict(new_agent)


@router.patch("/tenants/{tenant_id}/agents/{agent_id}")
async def update_tenant_agent(
    tenant_id: str,
    agent_id: str,
    data: dict,
    current_agent: Agent = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    await _get_tenant(tenant_id, db)
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.tenant_id == tenant_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Agent not found")

    for key in ("name", "email", "role", "max_chats", "status"):
        if key in data:
            setattr(target, key, data[key])

    if data.get("password"):
        target.password_hash = hash_password(data["password"])

    await db.flush()
    await db.commit()
    return _agent_dict(target)


@router.delete("/tenants/{tenant_id}/agents/{agent_id}")
async def delete_tenant_agent(
    tenant_id: str,
    agent_id: str,
    current_agent: Agent = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    await _get_tenant(tenant_id, db)
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.tenant_id == tenant_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Agent not found")
    if target.id == current_agent.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    await db.delete(target)
    await db.flush()
    await db.commit()
    return {"detail": "Agent deleted"}


# ── Cross-tenant conversations ─────────────────────────────────
@router.get("/conversations")
async def list_all_conversations(
    tenant_id: str = None,
    status: str = None,
    limit: int = 50,
    offset: int = 0,
    agent: Agent = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import aliased
    query = select(Conversation, Tenant.name.label("tenant_name")).join(
        Tenant, Conversation.tenant_id == Tenant.id, isouter=True
    )
    if tenant_id:
        query = query.where(Conversation.tenant_id == tenant_id)
    if status:
        query = query.where(Conversation.status == status)
    query = query.order_by(Conversation.last_message_at.desc().nullslast()).limit(limit).offset(offset)

    rows = (await db.execute(query)).all()
    result = []
    for conv, tenant_name in rows:
        d = {
            "id": conv.id,
            "tenant_id": conv.tenant_id,
            "tenant_name": tenant_name or "Unknown",
            "channel": conv.channel,
            "status": conv.status,
            "customer_name": conv.customer_name,
            "customer_phone": conv.customer_phone,
            "assigned_agent_id": conv.assigned_agent_id,
            "last_message_at": conv.last_message_at.isoformat() + "Z" if conv.last_message_at else None,
            "created_at": conv.created_at.isoformat() + "Z" if conv.created_at else None,
        }
        result.append(d)
    return result


# ── Helpers ────────────────────────────────────────────────────
async def _get_tenant(tenant_id: str, db: AsyncSession) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


def _tenant_dict(t: Tenant, include_keys: bool = False, agent_count: int = 0, conv_count: int = 0) -> dict:
    d = {
        "id": t.id,
        "name": t.name,
        "slug": t.slug,
        "plan": t.plan,
        "is_active": t.is_active,
        "max_agents": t.max_agents,
        "max_chats_per_agent": t.max_chats_per_agent,
        "whatsapp_configured": bool(t.whatsapp_token),
        "whatsapp_company_phone_number_id": t.whatsapp_company_phone_number_id,
        "whatsapp_business_account_id": t.whatsapp_business_account_id,
        "agent_count": agent_count,
        "conv_count": conv_count,
        "created_at": str(t.created_at) if t.created_at else None,
        "updated_at": str(t.updated_at) if t.updated_at else None,
    }
    if include_keys:
        d["widget_api_key"] = t.widget_api_key
        d["api_key"] = t.api_key
    return d


def _agent_dict(a: Agent) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "email": a.email,
        "role": a.role,
        "status": a.status,
        "max_chats": a.max_chats,
        "wa_connected": a.wa_connected,
        "tenant_id": a.tenant_id,
        "created_at": a.created_at.isoformat() + "Z" if a.created_at else None,
    }
