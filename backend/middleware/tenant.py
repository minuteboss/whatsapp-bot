"""
Tenant resolution middleware.
Resolves the current tenant from subdomain or X-Tenant-ID header.
"""

from fastapi import Request, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.tenant import Tenant


async def get_current_tenant(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Tenant:
    """
    Resolve tenant from:
    1. Subdomain of Host header (e.g., acme.yourdomain.com → slug='acme')
    2. X-Tenant-ID header (fallback for localhost / IP-based dev)
    3. request.state.tenant (if already set by another middleware layer)
    """
    # Check if already resolved
    if hasattr(request.state, "tenant") and request.state.tenant is not None:
        return request.state.tenant

    tenant = None

    # Try subdomain first
    host = request.headers.get("host", "")
    hostname = host.split(":")[0]  # Strip port

    # Check if it's a subdomain (not localhost, not IP)
    parts = hostname.split(".")
    if len(parts) >= 3 and not hostname.replace(".", "").isdigit():
        slug = parts[0]
        result = await db.execute(
            select(Tenant).where(Tenant.slug == slug, Tenant.is_active == True)
        )
        tenant = result.scalar_one_or_none()

    # Fallback: X-Tenant-ID header
    if tenant is None:
        tenant_header = request.headers.get("x-tenant-id")
        if tenant_header:
            # Try as slug first, then as UUID
            result = await db.execute(
                select(Tenant).where(Tenant.slug == tenant_header, Tenant.is_active == True)
            )
            tenant = result.scalar_one_or_none()
            if tenant is None:
                result = await db.execute(
                    select(Tenant).where(Tenant.id == tenant_header, Tenant.is_active == True)
                )
                tenant = result.scalar_one_or_none()

    # Fallback: default tenant (for single-tenant / local dev)
    if tenant is None:
        result = await db.execute(
            select(Tenant).where(Tenant.slug == "default", Tenant.is_active == True)
        )
        tenant = result.scalar_one_or_none()

    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")

    request.state.tenant = tenant
    return tenant
