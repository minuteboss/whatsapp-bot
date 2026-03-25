"""
Test configuration — async fixtures for FastAPI TestClient + SQLite in-memory DB.
"""

import asyncio
import secrets
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from database import Base, get_db
from models import Tenant, Agent
from middleware.auth import hash_password, create_access_token

# ── Shared engine + session for test DB ────────────────────────
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSession = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


# ── Override get_db ────────────────────────────────────────────
async def override_get_db():
    async with TestSession() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Fixtures ──────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop():
    """Use a single event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_database():
    """Create all tables once for the test session."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture
async def db():
    """Provide a fresh DB session for each test."""
    async with TestSession() as session:
        yield session


@pytest_asyncio.fixture
async def tenant(db: AsyncSession):
    """Create a test tenant with a unique slug for each test."""
    uid = secrets.token_hex(6)
    t = Tenant(
        name=f"Test Org {uid}",
        slug=f"test-org-{uid}",
        plan="pro",
        max_agents=10,
        max_chats_per_agent=5,
        widget_api_key=f"wk_test_{uid}",
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@pytest_asyncio.fixture
async def second_tenant(db: AsyncSession):
    """Create a second tenant for isolation tests."""
    uid = secrets.token_hex(6)
    t = Tenant(
        name=f"Other Org {uid}",
        slug=f"other-org-{uid}",
        plan="starter",
        max_agents=5,
        max_chats_per_agent=5,
        widget_api_key=f"wk_other_{uid}",
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@pytest_asyncio.fixture
async def admin_agent(db: AsyncSession, tenant: Tenant):
    """Create an admin agent for the test tenant."""
    uid = secrets.token_hex(6)
    agent = Agent(
        name="Test Admin",
        email=f"admin_{uid}@test.com",
        password_hash=hash_password("password123"),
        role="admin",
        status="offline",
        max_chats=10,
        api_key=f"sk_admin_{uid}",
        tenant_id=tenant.id,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


@pytest_asyncio.fixture
async def regular_agent(db: AsyncSession, tenant: Tenant):
    """Create a regular agent for the test tenant."""
    uid = secrets.token_hex(6)
    agent = Agent(
        name="Test Agent",
        email=f"agent_{uid}@test.com",
        password_hash=hash_password("password123"),
        role="agent",
        status="offline",
        max_chats=5,
        api_key=f"sk_agent_{uid}",
        tenant_id=tenant.id,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


@pytest_asyncio.fixture
async def superadmin_agent(db: AsyncSession, tenant: Tenant):
    """Create a superadmin agent for the test tenant."""
    uid = secrets.token_hex(6)
    agent = Agent(
        name="Super Admin",
        email=f"sa_{uid}@test.com",
        password_hash=hash_password("password123"),
        role="superadmin",
        status="offline",
        max_chats=0,
        api_key=f"sk_sa_{uid}",
        tenant_id=tenant.id,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


@pytest_asyncio.fixture
async def client():
    """Async HTTP test client for FastAPI app."""
    from main import app
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    """Returns a callable that generates auth cookie + tenant headers for an agent."""
    def _make_headers(agent: Agent) -> dict:
        token = create_access_token({"sub": agent.id, "tenant_id": agent.tenant_id})
        return {
            "Cookie": f"auth_token={token}",
            "X-Tenant-ID": agent.tenant_id,  # For tenant middleware resolution
        }
    return _make_headers
