"""
Admin router — /api/v1/admin
Stats, settings, canned responses. Admin only.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from database import get_db
from models.agent import Agent
from models.conversation import Conversation
from models.setting import Setting, CannedResponse
from middleware.auth import require_admin

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(require_admin),
):
    total = await db.execute(select(func.count(Conversation.id)))
    pending = await db.execute(
        select(func.count(Conversation.id)).where(Conversation.status == "pending")
    )
    active = await db.execute(
        select(func.count(Conversation.id)).where(Conversation.status == "active")
    )
    resolved = await db.execute(
        select(func.count(Conversation.id)).where(Conversation.status == "resolved")
    )
    agents_online = await db.execute(
        select(func.count(Agent.id)).where(Agent.status == "online")
    )

    # Today resolved
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_resolved = await db.execute(
        select(func.count(Conversation.id)).where(
            Conversation.status == "resolved",
            Conversation.resolved_at >= today_start,
        )
    )

    return {
        "total": total.scalar() or 0,
        "pending": pending.scalar() or 0,
        "active": active.scalar() or 0,
        "resolved": resolved.scalar() or 0,
        "agents_online": agents_online.scalar() or 0,
        "today_resolved": today_resolved.scalar() or 0,
    }


@router.get("/settings")
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(require_admin),
):
    result = await db.execute(select(Setting))
    settings_list = result.scalars().all()
    return {s.key: s.value for s in settings_list}


@router.post("/settings")
async def upsert_settings(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(require_admin),
):
    for key, value in body.items():
        result = await db.execute(select(Setting).where(Setting.key == key))
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = str(value)
            setting.updated_at = datetime.now(timezone.utc)
        else:
            db.add(Setting(key=key, value=str(value)))
    await db.flush()
    return {"detail": "Settings updated"}


@router.get("/canned")
async def list_canned(
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(require_admin),
):
    result = await db.execute(select(CannedResponse))
    responses = result.scalars().all()
    return [
        {
            "id": r.id,
            "shortcut": r.shortcut,
            "title": r.title,
            "content": r.content,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in responses
    ]


@router.post("/canned")
async def create_canned(
    body: dict,
    db: AsyncSession = Depends(get_db),
    admin: Agent = Depends(require_admin),
):
    canned = CannedResponse(
        shortcut=body["shortcut"],
        title=body["title"],
        content=body["content"],
        created_by=admin.id,
    )
    db.add(canned)
    await db.flush()
    return {
        "id": canned.id,
        "shortcut": canned.shortcut,
        "title": canned.title,
        "content": canned.content,
    }


@router.delete("/canned/{canned_id}")
async def delete_canned(
    canned_id: str,
    db: AsyncSession = Depends(get_db),
    _: Agent = Depends(require_admin),
):
    result = await db.execute(select(CannedResponse).where(CannedResponse.id == canned_id))
    canned = result.scalar_one_or_none()
    if not canned:
        raise HTTPException(status_code=404, detail="Canned response not found")
    await db.delete(canned)
    await db.flush()
    return {"detail": "Deleted"}
