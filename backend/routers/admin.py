"""
Admin router — stats, settings, canned responses, WhatsApp registration, usage, integration.
All queries scoped to the current tenant.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta

from database import get_db
from models import Agent, Conversation, Setting, CannedResponse
from models.message import Message
from models.tenant import Tenant
from middleware.auth import require_admin, get_current_agent
from middleware.tenant import get_current_tenant
from services.whatsapp_service import wa_service
from config import settings as app_settings

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/stats")
async def get_stats(
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    tid = tenant.id

    total = (await db.execute(
        select(func.count(Conversation.id)).where(Conversation.tenant_id == tid)
    )).scalar() or 0

    pending = (await db.execute(
        select(func.count(Conversation.id)).where(
            Conversation.tenant_id == tid, Conversation.status == "pending"
        )
    )).scalar() or 0

    active = (await db.execute(
        select(func.count(Conversation.id)).where(
            Conversation.tenant_id == tid, Conversation.status == "active"
        )
    )).scalar() or 0

    resolved = (await db.execute(
        select(func.count(Conversation.id)).where(
            Conversation.tenant_id == tid, Conversation.status == "resolved"
        )
    )).scalar() or 0

    agents_online = (await db.execute(
        select(func.count(Agent.id)).where(
            Agent.tenant_id == tid, Agent.status == "online"
        )
    )).scalar() or 0

    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
    today_resolved = (await db.execute(
        select(func.count(Conversation.id)).where(
            Conversation.tenant_id == tid,
            Conversation.status == "resolved",
            Conversation.resolved_at >= today,
        )
    )).scalar() or 0

    return {
        "total": total,
        "pending": pending,
        "active": active,
        "resolved": resolved,
        "agents_online": agents_online,
        "today_resolved": today_resolved,
    }


@router.get("/settings")
async def get_settings(
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Setting).where(Setting.tenant_id == tenant.id)
    )
    settings_list = result.scalars().all()
    # Return as array of {key, value} (fixes the audit bug)
    return [{"key": s.key, "value": s.value} for s in settings_list]


@router.post("/settings")
async def update_settings(
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    for key, value in data.items():
        if len(key) > 100 or len(str(value)) > 2048:
            continue
        result = await db.execute(
            select(Setting).where(Setting.key == key, Setting.tenant_id == tenant.id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = str(value)
        else:
            db.add(Setting(key=key, value=str(value), tenant_id=tenant.id))

    await db.flush()
    await db.commit()
    return {"detail": "Settings updated"}


@router.get("/canned")
async def list_canned(
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CannedResponse).where(CannedResponse.tenant_id == tenant.id)
        .order_by(CannedResponse.created_at)
    )
    canned = result.scalars().all()
    return [_canned_dict(c) for c in canned]


@router.post("/canned")
async def create_canned(
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    shortcut = data.get("shortcut", "").strip()
    title = data.get("title", "").strip()
    content = data.get("content", "").strip()

    if not shortcut or not title or not content:
        raise HTTPException(status_code=422, detail="shortcut, title, and content required")
    if len(content) > 2048:
        raise HTTPException(status_code=422, detail="Content too long (max 2048)")

    canned = CannedResponse(
        shortcut=shortcut,
        title=title,
        content=content,
        tenant_id=tenant.id,
        created_by=admin.id,
    )
    db.add(canned)
    await db.flush()
    await db.commit()
    return _canned_dict(canned)


@router.patch("/canned/{canned_id}")
async def update_canned(
    canned_id: str,
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CannedResponse).where(
            CannedResponse.id == canned_id, CannedResponse.tenant_id == tenant.id
        )
    )
    canned = result.scalar_one_or_none()
    if not canned:
        raise HTTPException(status_code=404, detail="Canned response not found")
    for key in ("shortcut", "title", "content"):
        if key in data:
            setattr(canned, key, data[key])
    await db.flush()
    await db.commit()
    return _canned_dict(canned)


@router.delete("/canned/{canned_id}")
async def delete_canned(
    canned_id: str,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CannedResponse).where(
            CannedResponse.id == canned_id,
            CannedResponse.tenant_id == tenant.id,
        )
    )
    canned = result.scalar_one_or_none()
    if not canned:
        raise HTTPException(status_code=404, detail="Canned response not found")

    await db.delete(canned)
    await db.flush()
    await db.commit()
    return {"detail": "Canned response deleted"}


def _canned_dict(c: CannedResponse) -> dict:
    return {
        "id": c.id,
        "shortcut": c.shortcut,
        "title": c.title,
        "content": c.content,
        "created_at": str(c.created_at) if c.created_at else None,
    }


# ── WhatsApp Registration (Company Phone) ────────────────────

@router.post("/wa/request-code")
async def wa_request_code(
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
):
    """Request an OTP to register the company WhatsApp phone number with Meta."""
    phone_number_id = (data.get("phone_number_id") or "").strip() or wa_service._get_company_phone_id(tenant)
    method = data.get("method", "SMS").upper()
    if not phone_number_id:
        raise HTTPException(status_code=422, detail="phone_number_id required (or set WHATSAPP_COMPANY_PHONE_NUMBER_ID)")
    success, err = await wa_service.request_verification_code(phone_number_id, method, tenant=tenant)
    if not success:
        raise HTTPException(status_code=400, detail=err or "Failed to request code. Check WHATSAPP_TOKEN and phone_number_id.")
    return {"detail": f"Verification code sent via {method}"}


@router.post("/wa/verify-code")
async def wa_verify_code(
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Verify the OTP to complete company WhatsApp phone number registration."""
    phone_number_id = (data.get("phone_number_id") or "").strip() or wa_service._get_company_phone_id(tenant)
    code = (data.get("code") or "").strip()
    if not phone_number_id or not code:
        raise HTTPException(status_code=422, detail="phone_number_id and code required")
    result, err = await wa_service.verify_code(phone_number_id, code, tenant=tenant)
    if not result:
        raise HTTPException(status_code=400, detail=err or "Failed to verify code. Check the OTP and try again.")
    # Mark tenant phone as registered
    if tenant.whatsapp_company_phone_number_id != phone_number_id:
        tenant.whatsapp_company_phone_number_id = phone_number_id
        await db.flush()
        await db.commit()
    return {"detail": "Phone number registered successfully", "phone_number_id": phone_number_id}


# ── WhatsApp direct save (skip OTP) ──────────────────────────
@router.post("/wa/save-phone")
async def wa_save_phone(
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Directly save a phone number ID that is already registered in Meta Business Manager."""
    phone_number_id = (data.get("phone_number_id") or "").strip()
    if not phone_number_id:
        raise HTTPException(status_code=422, detail="phone_number_id required")

    # Optionally verify the number exists in Meta
    info = await wa_service.get_phone_number_info(phone_number_id, tenant=tenant)
    display_number = info.get("display_phone_number") or phone_number_id

    tenant.whatsapp_company_phone_number_id = phone_number_id
    await db.flush()
    await db.commit()
    return {"detail": "Phone saved", "phone_number_id": phone_number_id, "display_phone_number": display_number}


# ── Usage & Limits ────────────────────────────────────────────
@router.get("/usage")
async def get_usage(
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    tid = tenant.id
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    agents_total = (await db.execute(
        select(func.count(Agent.id)).where(Agent.tenant_id == tid)
    )).scalar() or 0

    agents_online = (await db.execute(
        select(func.count(Agent.id)).where(Agent.tenant_id == tid, Agent.status == "online")
    )).scalar() or 0

    active_convs = (await db.execute(
        select(func.count(Conversation.id)).where(Conversation.tenant_id == tid, Conversation.status == "active")
    )).scalar() or 0

    today_convs = (await db.execute(
        select(func.count(Conversation.id)).where(
            Conversation.tenant_id == tid, Conversation.created_at >= today_start
        )
    )).scalar() or 0

    msgs_today = (await db.execute(
        select(func.count(Message.id)).where(
            Message.tenant_id == tid,
            Message.sender_type == "agent",
            Message.created_at >= today_start,
        )
    )).scalar() or 0

    msgs_month = (await db.execute(
        select(func.count(Message.id)).where(
            Message.tenant_id == tid,
            Message.sender_type == "agent",
            Message.created_at >= month_start,
        )
    )).scalar() or 0

    # Meta WA phone info
    wa_info = {}
    phone_id = wa_service._get_company_phone_id(tenant)
    if phone_id and wa_service._get_token(tenant):
        raw = await wa_service.get_phone_number_info(phone_id, tenant=tenant)
        tier = raw.get("messaging_limit_tier", "")
        tier_limits = {
            "TIER_NOT_SET": 250, "TIER_50": 50, "TIER_250": 250,
            "TIER_1K": 1000, "TIER_10K": 10000, "TIER_100K": 100000,
        }
        wa_info = {
            "configured": True,
            "phone_number_id": phone_id,
            "display_phone_number": raw.get("display_phone_number", phone_id),
            "quality_rating": raw.get("quality_rating", "UNKNOWN"),
            "messaging_limit_tier": tier,
            "daily_limit": tier_limits.get(tier, 250),
        }
    else:
        wa_info = {"configured": False}

    return {
        "plan": tenant.plan,
        "limits": {
            "max_agents": tenant.max_agents,
            "max_chats_per_agent": tenant.max_chats_per_agent,
        },
        "usage": {
            "agents_total": agents_total,
            "agents_online": agents_online,
            "conversations_active": active_convs,
            "conversations_today": today_convs,
            "messages_sent_today": msgs_today,
            "messages_sent_month": msgs_month,
        },
        "whatsapp": wa_info,
    }


# ── Integration Keys (admin view own tenant keys) ─────────────
@router.get("/integration")
async def get_integration(
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
):
    import os
    backend_url = os.environ.get("NEXT_PUBLIC_API_URL", "http://localhost:8000")
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")

    return {
        "widget_key": tenant.widget_api_key or "",
        "api_key": tenant.api_key or "",
        "slug": tenant.slug,
        "snippets": {
            "js": f'<script src="{frontend_url}/widget.js"\n  data-key="{tenant.widget_api_key or "wk_..."}"\n  data-position="bottom-right"\n  async></script>',
            "iframe": f'<iframe\n  src="{frontend_url}/embed/{tenant.slug}?key={tenant.widget_api_key or "wk_..."}"\n  width="400" height="600"\n  frameborder="0"\n  allow="microphone">\n</iframe>',
            "curl": f'# Create a conversation via REST API\ncurl -X POST {backend_url}/api/v1/widget/conversations \\\n  -H "x-api-key: {tenant.api_key or "sk_live_..."}" \\\n  -H "Content-Type: application/json" \\\n  -d \'{{"customer_name":"Alice","customer_email":"alice@example.com"}}\'',
        },
    }


@router.post("/rotate-widget-key")
async def rotate_widget_key(
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    import secrets as _secrets
    tenant.widget_api_key = "wk_" + _secrets.token_hex(32)
    await db.flush()
    await db.commit()
    return {"widget_key": tenant.widget_api_key}


@router.post("/rotate-api-key")
async def rotate_api_key(
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    import secrets as _secrets
    tenant.api_key = "sk_live_" + _secrets.token_hex(32)
    await db.flush()
    await db.commit()
    return {"api_key": tenant.api_key}
