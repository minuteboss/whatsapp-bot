"""
Tests for multi-tenant isolation:
- Agents from tenant A cannot see conversations from tenant B
- Superadmin endpoints require superadmin role
"""

import secrets
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from models import Agent, Tenant
from models.conversation import Conversation
from middleware.auth import hash_password

pytestmark = pytest.mark.asyncio


async def _create_tenant_b(db: AsyncSession) -> tuple[Tenant, Agent]:
    tenant_b = Tenant(
        name="Tenant B",
        slug=f"tenant-b-{secrets.token_hex(4)}",
        plan="starter",
        max_agents=5,
        max_chats_per_agent=5,
        widget_api_key=f"wk_b_{secrets.token_hex(8)}",
    )
    db.add(tenant_b)
    await db.commit()
    await db.refresh(tenant_b)

    agent_b = Agent(
        name="Agent B",
        email=f"agent_b_{secrets.token_hex(4)}@test.com",
        password_hash=hash_password("password123"),
        role="admin",
        status="offline",
        max_chats=5,
        api_key=f"sk_b_{secrets.token_hex(16)}",
        tenant_id=tenant_b.id,
    )
    db.add(agent_b)
    await db.commit()
    await db.refresh(agent_b)
    return tenant_b, agent_b


class TestTenantIsolation:
    async def test_conversations_isolated(
        self, client: AsyncClient, db: AsyncSession, admin_agent: Agent, tenant: Tenant, auth_headers
    ):
        conv_a = Conversation(
            channel="web_widget", status="pending",
            customer_name="Customer A", tenant_id=tenant.id,
        )
        db.add(conv_a)

        tenant_b, agent_b = await _create_tenant_b(db)
        conv_b = Conversation(
            channel="web_widget", status="pending",
            customer_name="Customer B", tenant_id=tenant_b.id,
        )
        db.add(conv_b)
        await db.commit()

        # Agent A sees only tenant A conversations
        res_a = await client.get("/api/v1/conversations", headers=auth_headers(admin_agent))
        assert res_a.status_code == 200
        ids_a = {c["id"] for c in res_a.json()}
        assert conv_a.id in ids_a
        assert conv_b.id not in ids_a

        # Agent B sees only tenant B conversations
        res_b = await client.get("/api/v1/conversations", headers=auth_headers(agent_b))
        assert res_b.status_code == 200
        ids_b = {c["id"] for c in res_b.json()}
        assert conv_b.id in ids_b
        assert conv_a.id not in ids_b

    async def test_agents_isolated(
        self, client: AsyncClient, db: AsyncSession, admin_agent: Agent, tenant: Tenant, auth_headers
    ):
        tenant_b, agent_b = await _create_tenant_b(db)

        res_a = await client.get("/api/v1/agents", headers=auth_headers(admin_agent))
        agent_ids_a = {a["id"] for a in res_a.json()}
        assert admin_agent.id in agent_ids_a
        assert agent_b.id not in agent_ids_a


class TestSuperadminEndpoints:
    async def test_list_tenants_as_superadmin(self, client: AsyncClient, superadmin_agent: Agent, auth_headers):
        res = await client.get("/api/superadmin/tenants", headers=auth_headers(superadmin_agent))
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)

    async def test_list_tenants_as_admin(self, client: AsyncClient, admin_agent: Agent, auth_headers):
        res = await client.get("/api/superadmin/tenants", headers=auth_headers(admin_agent))
        assert res.status_code == 403

    async def test_create_tenant(self, client: AsyncClient, superadmin_agent: Agent, auth_headers):
        res = await client.post("/api/superadmin/tenants", json={
            "name": "New Tenant",
            "slug": f"new-tenant-{secrets.token_hex(4)}",
            "plan": "starter",
        }, headers=auth_headers(superadmin_agent))
        assert res.status_code in (200, 201)
        body = res.json()
        assert body["name"] == "New Tenant"
        assert body["is_active"] is True
