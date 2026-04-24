"""
Groups router — manage contact segments.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Group, Agent, Tenant, Contact, contact_groups
from middleware.auth import require_admin
from middleware.tenant import get_current_tenant

router = APIRouter(prefix="/api/v1/admin/groups", tags=["admin-groups"])

@router.get("")
async def list_groups(
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List all groups for the tenant."""
    result = await db.execute(
        select(Group)
        .where(Group.tenant_id == tenant.id)
        .order_by(Group.name)
    )
    groups = result.scalars().all()
    
    # Get member counts
    res = []
    for g in groups:
        count_stmt = select(func.count()).select_from(contact_groups).where(contact_groups.c.group_id == g.id)
        count = (await db.execute(count_stmt)).scalar() or 0
        res.append({
            "id": g.id,
            "name": g.name,
            "description": g.description,
            "member_count": count
        })
    
    return res

@router.post("")
async def create_group(
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Create a new group."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name is required")

    group = Group(
        name=name,
        description=data.get("description"),
        tenant_id=tenant.id
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group

@router.delete("/{group_id}")
async def delete_group(
    group_id: str,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Delete a group."""
    result = await db.execute(
        select(Group).where(Group.id == group_id, Group.tenant_id == tenant.id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    await db.delete(group)
    await db.commit()
    return {"detail": "Group deleted"}

@router.post("/{group_id}/members")
async def add_members(
    group_id: str,
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Add contacts to a group."""
    contact_ids = data.get("contact_ids", [])
    if not contact_ids:
        return {"detail": "No contacts provided"}

    # Verify group exists
    group_res = await db.execute(select(Group).where(Group.id == group_id, Group.tenant_id == tenant.id))
    if not group_res.scalar():
        raise HTTPException(status_code=404, detail="Group not found")

    # Add members (ignore duplicates)
    for cid in contact_ids:
        # Check if already in group
        check = await db.execute(select(contact_groups).where(contact_groups.c.group_id == group_id, contact_groups.c.contact_id == cid))
        if not check.first():
            await db.execute(contact_groups.insert().values(group_id=group_id, contact_id=cid))
    
    await db.commit()
    return {"detail": f"Added {len(contact_ids)} members"}

@router.delete("/{group_id}/members/{contact_id}")
async def remove_member(
    group_id: str,
    contact_id: str,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Remove a contact from a group."""
    await db.execute(
        delete(contact_groups).where(contact_groups.c.group_id == group_id, contact_groups.c.contact_id == contact_id)
    )
    await db.commit()
    return {"detail": "Member removed"}
