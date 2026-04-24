"""
Contacts router — manage customer contacts for a tenant.
"""

from fastapi import APIRouter, Depends, HTTPException
import re
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Contact, Agent, Tenant
from middleware.auth import require_admin
from middleware.tenant import get_current_tenant

router = APIRouter(prefix="/api/v1/admin/contacts", tags=["admin-contacts"])


@router.get("")
async def list_contacts(
    limit: int = 50,
    offset: int = 0,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List all contacts of the current tenant."""
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Contact)
        .where(Contact.tenant_id == tenant.id)
        .options(selectinload(Contact.groups))
        .order_by(Contact.name)
        .limit(limit)
        .offset(offset)
    )
    contacts = result.scalars().all()
    count = (await db.execute(select(func.count(Contact.id)).where(Contact.tenant_id == tenant.id))).scalar() or 0
    
    return {
        "contacts": [{
            "id": c.id,
            "name": c.name,
            "phone": c.phone,
            "email": c.email,
            "tags": c.tags,
            "groups": [{"id": g.id, "name": g.name} for g in c.groups],
            "created_at": str(c.created_at),
        } for c in contacts],
        "total": count,
    }


@router.post("")
async def create_contact(
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Create a new contact."""
    name = data.get("name", "").strip()
    phone = data.get("phone", "").strip()
    if not name or not phone:
        raise HTTPException(status_code=422, detail="name and phone are required")

    # Clean phone: keep only digits
    phone_clean = re.sub(r"\D", "", phone)

    new_contact = Contact(
        name=name,
        phone=phone_clean,
        email=data.get("email"),
        tags=data.get("tags"),
        tenant_id=tenant.id,
    )
    db.add(new_contact)
    await db.flush()
    await db.commit()
    
    return {"id": new_contact.id, "name": new_contact.name, "phone": new_contact.phone}


@router.patch("/{contact_id}")
async def update_contact(
    contact_id: str,
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Update a contact."""
    result = await db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == tenant.id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    for key in ("name", "phone", "email", "tags"):
        if key in data:
            val = data[key]
            if key == "phone":
                val = re.sub(r"\D", "", str(val))
            setattr(contact, key, val)

    await db.flush()
    await db.commit()
    return {"detail": "Contact updated"}


@router.delete("/{contact_id}")
async def delete_contact(
    contact_id: str,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Delete a contact."""
    result = await db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == tenant.id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    await db.delete(contact)
    await db.flush()
    await db.commit()
    return {"detail": "Contact deleted"}


@router.post("/import-csv")
async def import_contacts_csv(
    data: list[dict],
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Bulk import contacts from a list (CSV parsed on frontend)."""
    imported_count = 0
    for row in data:
        name = row.get("name", "").strip() or row.get("Name", "").strip()
        phone = str(row.get("phone", "")).strip() or str(row.get("Phone", "")).strip()
        if not name or not phone:
            continue
        
        phone_clean = re.sub(r"\D", "", phone)
        # Upsert logic (or just add new ones for now)
        contact = Contact(
            name=name,
            phone=phone_clean,
            email=row.get("email") or row.get("Email"),
            tags=row.get("tags") or row.get("Tags"),
            tenant_id=tenant.id,
        )
        db.add(contact)
        imported_count += 1

    await db.flush()
    await db.commit()
    return {"imported": imported_count}
