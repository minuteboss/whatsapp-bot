"""
Billing enforcement middleware.
Provides a FastAPI dependency that blocks access for tenants
whose billing_status is suspended or cancelled, or whose trial has expired.
"""

from datetime import datetime, timezone
from fastapi import Depends, HTTPException

from models.tenant import Tenant
from middleware.tenant import get_current_tenant


async def require_active_billing(
    tenant: Tenant = Depends(get_current_tenant),
) -> Tenant:
    """
    Raise HTTP 402 if the tenant's billing is not in a usable state.

    Allowed statuses: 'trial' (while not expired), 'active'.
    Blocked statuses: 'suspended', 'cancelled'.
    """
    status = tenant.billing_status or "trial"

    if status in ("suspended", "cancelled"):
        raise HTTPException(
            status_code=402,
            detail=(
                f"Your account is {status}. "
                "Please contact support to restore access."
            ),
        )

    # Check wallet balance
    if tenant.wallet_balance is None or tenant.wallet_balance <= 0:
        raise HTTPException(
            status_code=402,
            detail=(
                "Your wallet balance is depleted. "
                "Please add funds to your account to continue sending messages."
            ),
        )

    return tenant
