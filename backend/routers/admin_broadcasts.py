"""
Broadcasts router — create and track message broadcasts for a tenant.
Used to blast template messages to a list of contacts.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
import asyncio

from database import get_db, async_session
from models import Broadcast, Agent, Tenant, Contact, Template
from middleware.auth import require_admin
from middleware.tenant import get_current_tenant
from services.whatsapp_service import wa_service

router = APIRouter(prefix="/api/v1/admin/broadcasts", tags=["admin-broadcasts"])


@router.get("")
async def list_broadcasts(
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List all broadcasts of the current tenant."""
    result = await db.execute(
        select(Broadcast).where(Broadcast.tenant_id == tenant.id).order_by(Broadcast.created_at.desc())
    )
    broadcasts = result.scalars().all()
    
    return [{
        "id": b.id,
        "name": b.name,
        "template_id": b.template_id,
        "status": b.status,
        "total_contacts": b.total_contacts,
        "sent_count": b.sent_count,
        "failed_count": b.failed_count,
        "components": b.components,
        "created_at": str(b.created_at),
    } for b in broadcasts]


@router.get("/{broadcast_id}")
async def get_broadcast(
    broadcast_id: str,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Get details of a specific broadcast."""
    result = await db.execute(
        select(Broadcast).where(Broadcast.id == broadcast_id, Broadcast.tenant_id == tenant.id)
    )
    broadcast = result.scalar_one_or_none()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    
    return {
        "id": broadcast.id,
        "name": broadcast.name,
        "template_id": broadcast.template_id,
        "status": broadcast.status,
        "total_contacts": broadcast.total_contacts,
        "sent_count": broadcast.sent_count,
        "failed_count": broadcast.failed_count,
        "components": broadcast.components,
        "created_at": str(broadcast.created_at),
    }


@router.delete("/{broadcast_id}")
async def delete_broadcast(
    broadcast_id: str,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Delete a broadcast record."""
    result = await db.execute(
        select(Broadcast).where(Broadcast.id == broadcast_id, Broadcast.tenant_id == tenant.id)
    )
    broadcast = result.scalar_one_or_none()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    await db.delete(broadcast)
    await db.flush()
    await db.commit()
    return {"detail": "Broadcast record deleted"}


# Constants for broadcast limits
MAX_BROADCAST_NAME_LENGTH = 200
MAX_BROADCAST_CONTACTS = 10000  # Reasonable limit to prevent abuse


@router.post("")
async def create_broadcast(
    data: dict,
    background_tasks: BackgroundTasks,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Create a new broadcast and start it in the background."""
    name = data.get("name", "").strip()
    template_id = data.get("template_id")
    group_id = data.get("group_id")

    # ── Input Validation ─────────────────────────────────────────
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    if len(name) > MAX_BROADCAST_NAME_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"name must be {MAX_BROADCAST_NAME_LENGTH} characters or less"
        )
    if not template_id:
        raise HTTPException(status_code=422, detail="template_id is required")
    if not isinstance(template_id, str):
        raise HTTPException(status_code=422, detail="template_id must be a string")

    # Resolve template
    result = await db.execute(
        select(Template).where(Template.id == template_id, Template.tenant_id == tenant.id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.status != "APPROVED":
        raise HTTPException(
            status_code=422,
            detail=f"Template must be approved (current status: {template.status})"
        )

    # Validate group_id if provided
    if group_id is not None:
        if not isinstance(group_id, str):
            raise HTTPException(status_code=422, detail="group_id must be a string")
        from models.group import Group
        group_result = await db.execute(
            select(Group).where(Group.id == group_id, Group.tenant_id == tenant.id)
        )
        if not group_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Group not found")

    # Resolve contacts
    if group_id:
        from models.group import contact_groups
        query = (
            select(Contact)
            .join(contact_groups, Contact.id == contact_groups.c.contact_id)
            .where(contact_groups.c.group_id == group_id, Contact.tenant_id == tenant.id)
        )
    else:
        query = select(Contact).where(Contact.tenant_id == tenant.id)

    result = await db.execute(query)
    contacts = result.scalars().all()
    if not contacts:
        raise HTTPException(status_code=400, detail="No contacts found for filter")

    # Limit check
    if len(contacts) > MAX_BROADCAST_CONTACTS:
        raise HTTPException(
            status_code=422,
            detail=f"Broadcast exceeds maximum of {MAX_BROADCAST_CONTACTS} contacts (found {len(contacts)})"
        )

    new_broadcast = Broadcast(
        name=name,
        template_id=template_id,
        group_id=group_id,
        tenant_id=tenant.id,
        total_contacts=len(contacts),
        status="pending",
        components=data.get("components")
    )
    db.add(new_broadcast)
    await db.flush()
    
    broadcast_id = new_broadcast.id
    
    # Start background task
    background_tasks.add_task(_run_broadcast, broadcast_id, tenant.id)
    
    await db.commit()
    return {"id": broadcast_id, "total_contacts": len(contacts)}


async def _run_broadcast(broadcast_id: str, tenant_id: str):
    """Background runner for broadcasts."""
    async with async_session() as db:
        broadcast = await db.get(Broadcast, broadcast_id)
        tenant = await db.get(Tenant, tenant_id)
        if not broadcast or not tenant:
            return

        broadcast.status = "sending"
        await db.commit()

        # Resolve template
        template = await db.get(Template, broadcast.template_id)
        if not template:
            broadcast.status = "failed"
            await db.commit()
            return

        # Resolve contacts (re-fetch in this session)
        if broadcast.group_id:
            from models.group import contact_groups
            query = (
                select(Contact)
                .join(contact_groups, Contact.id == contact_groups.c.contact_id)
                .where(contact_groups.c.group_id == broadcast.group_id, Contact.tenant_id == tenant_id)
            )
        else:
            query = select(Contact).where(Contact.tenant_id == tenant_id)

        result = await db.execute(query)
        contacts = result.scalars().all()

        phone_id = wa_service._get_company_phone_id(tenant)
        if not phone_id:
            broadcast.status = "failed"
            await db.commit()
            return

        # Process contacts in batches with proper count tracking
        BATCH_SIZE = 50
        sent_count = 0
        failed_count = 0

        for i, contact in enumerate(contacts):
            success = await wa_service.send_template_message(
                phone_id, 
                contact.phone, 
                template.name, 
                template.language, 
                components=broadcast.components,
                tenant=tenant
            )

            if success:
                sent_count += 1
            else:
                failed_count += 1

            # Commit batch updates periodically
            if (i + 1) % BATCH_SIZE == 0:
                broadcast.sent_count = sent_count
                broadcast.failed_count = failed_count
                await db.commit()

            # Rate limit avoidance
            await asyncio.sleep(0.1)

        # Final update - refresh from DB to avoid stale data conflicts
        await db.refresh(broadcast)
        broadcast.sent_count = sent_count
        broadcast.failed_count = failed_count
        broadcast.status = "completed" if failed_count < len(contacts) else "failed"
        await db.commit()
