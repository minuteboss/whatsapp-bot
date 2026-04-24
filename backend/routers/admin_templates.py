"""
Templates router — manage WhatsApp message templates for a tenant.
Used to sync approved templates from Meta to local storage.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Template, Agent, Tenant
from middleware.auth import require_admin
from middleware.tenant import get_current_tenant
from services.whatsapp_service import wa_service

router = APIRouter(prefix="/api/v1/admin/templates", tags=["admin-templates"])


@router.get("")
async def list_templates(
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List all templates of the current tenant (locally synced)."""
    result = await db.execute(
        select(Template).where(Template.tenant_id == tenant.id).order_by(Template.name)
    )
    templates = result.scalars().all()
    
    return [{
        "id": t.id,
        "name": t.name,
        "category": t.category,
        "language": t.language,
        "status": t.status,
        "components": t.components,
        "created_at": str(t.created_at),
    } for t in templates]


@router.post("/sync")
async def sync_templates(
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Sync templates from Meta and save to local storage."""
    remote_templates = await wa_service.get_templates(tenant=tenant)
    if not remote_templates:
        return {"detail": "No templates found on Meta", "synced": 0}

    synced_count = 0
    for rt in remote_templates:
        name = rt.get("name")
        if not name:
            continue
        
        # Check if template already exists
        result = await db.execute(
            select(Template).where(Template.name == name, Template.tenant_id == tenant.id)
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            # Update
            existing.category = rt.get("category")
            existing.language = rt.get("language")
            existing.status = rt.get("status")
            existing.components = rt.get("components")
        else:
            # Create
            new_template = Template(
                name=name,
                category=rt.get("category"),
                language=rt.get("language"),
                status=rt.get("status"),
                components=rt.get("components"),
                tenant_id=tenant.id,
            )
            db.add(new_template)
            synced_count += 1
            
    await db.flush()
    await db.commit()
    return {"detail": f"Synced {len(remote_templates)} templates", "added": synced_count}


@router.delete("/{template_id}")
async def delete_template_local(
    template_id: str,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Remove a template from local storage (not from Meta)."""
    result = await db.execute(
        select(Template).where(Template.id == template_id, Template.tenant_id == tenant.id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    await db.delete(template)
    await db.flush()
    await db.commit()
    return {"detail": "Template removed from local cache"}


@router.post("")
async def create_template_local(
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Manually create a template locally."""
    new_template = Template(
        name=data.get("name"),
        category=data.get("category"),
        language=data.get("language"),
        status=data.get("status", "APPROVED"),
        components=data.get("components"),
        tenant_id=tenant.id,
    )
    db.add(new_template)
    await db.flush()
    await db.commit()
    return {"id": new_template.id, "detail": "Template created locally"}


@router.patch("/{template_id}")
async def update_template_local(
    template_id: str,
    data: dict,
    admin: Agent = Depends(require_admin),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Update a template locally."""
    result = await db.execute(
        select(Template).where(Template.id == template_id, Template.tenant_id == tenant.id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if "name" in data:
        template.name = data["name"]
    if "category" in data:
        template.category = data["category"]
    if "language" in data:
        template.language = data["language"]
    if "status" in data:
        template.status = data["status"]
    if "components" in data:
        template.components = data["components"]

    await db.flush()
    await db.commit()
    return {"detail": "Template updated locally"}
