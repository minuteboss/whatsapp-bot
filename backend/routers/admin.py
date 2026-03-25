"""
Admin router — stats, settings, canned responses, WhatsApp registration.
All queries scoped to the current tenant.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta

from database import get_db
from models import Agent, Conversation, Setting, CannedResponse
from models.tenant import Tenant
from middleware.auth import require_admin
from middleware.tenant import get_current_tenant
from services.whatsapp_service import wa_service

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
