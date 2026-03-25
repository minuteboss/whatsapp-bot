"""
Authentication middleware: JWT dependency, API key dependency, admin/superadmin check.
Supports httpOnly cookie auth, Bearer header auth, and widget API key auth.
"""

import uuid
from datetime import datetime, timezone, timedelta
from fastapi import Depends, HTTPException, Header, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models.agent import Agent
from models.tenant import Tenant

# ── Password hashing ─────────────────────────────────────────
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# ── Bearer scheme ─────────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)

# ── In-memory WS ticket store (short-lived, 60s TTL) ─────────
_ws_tickets: dict[str, dict] = {}


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRY_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def create_ws_ticket(agent_id: str) -> str:
    """Create a short-lived ticket for WebSocket authentication."""
    ticket = str(uuid.uuid4())
    _ws_tickets[ticket] = {
        "agent_id": agent_id,
        "expires": datetime.now(timezone.utc) + timedelta(seconds=60),
    }
    # Clean up expired tickets
    now = datetime.now(timezone.utc)
    expired = [k for k, v in _ws_tickets.items() if v["expires"] < now]
    for k in expired:
        del _ws_tickets[k]
    return ticket


def validate_ws_ticket(ticket: str) -> str | None:
    """Validate a WS ticket and return agent_id, or None if invalid/expired."""
    data = _ws_tickets.pop(ticket, None)
    if data is None:
        return None
    if data["expires"] < datetime.now(timezone.utc):
        return None
    return data["agent_id"]


# ── Extract token from cookie or header ──────────────────────
def extract_token(request: Request, credentials: HTTPAuthorizationCredentials | None = None) -> str:
    """Try httpOnly cookie first, then Authorization header."""
    # 1. Cookie
    token = request.cookies.get("auth_token")
    if token:
        return token
    # 2. Bearer header
    if credentials and credentials.credentials:
        return credentials.credentials
    raise HTTPException(status_code=401, detail="Not authenticated")


# ── JWT Dependency ────────────────────────────────────────────
async def get_current_agent(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> Agent:
    token = extract_token(request, credentials)
    payload = decode_token(token)
    agent_id = payload.get("sub")
    if not agent_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=401, detail="Agent not found")
    return agent


# ── Admin Dependency ──────────────────────────────────────────
async def require_admin(agent: Agent = Depends(get_current_agent)) -> Agent:
    if agent.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return agent


# ── Superadmin Dependency ─────────────────────────────────────
async def require_superadmin(agent: Agent = Depends(get_current_agent)) -> Agent:
    if agent.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return agent


# ── API Key Dependency (for widget — now resolves Tenant) ────
async def verify_api_key(
    request: Request,
    x_api_key: str = Header(..., alias="x-api-key"),
    db: AsyncSession = Depends(get_db),
) -> Tenant:
    """Verify widget API key and return the associated Tenant."""
    result = await db.execute(select(Tenant).where(Tenant.widget_api_key == x_api_key))
    tenant = result.scalar_one_or_none()
    if not tenant or not tenant.is_active:
        raise HTTPException(status_code=401, detail="Invalid API key")
    request.state.tenant = tenant
    return tenant
