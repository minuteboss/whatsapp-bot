"""
Tests for agent endpoints:
  GET    /api/v1/agents
  POST   /api/v1/agents
  PATCH  /api/v1/agents/{id}
  DELETE /api/v1/agents/{id}
"""

import pytest
from httpx import AsyncClient
from models import Agent

pytestmark = pytest.mark.asyncio


class TestListAgents:
    async def test_list_agents(self, client: AsyncClient, admin_agent: Agent, auth_headers):
        res = await client.get("/api/v1/agents", headers=auth_headers(admin_agent))
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert any(a["id"] == admin_agent.id for a in data)

    async def test_list_agents_unauthenticated(self, client: AsyncClient):
        res = await client.get("/api/v1/agents")
        assert res.status_code == 401


class TestCreateAgent:
    async def test_create_agent_as_admin(self, client: AsyncClient, admin_agent: Agent, auth_headers):
        res = await client.post("/api/v1/agents", json={
            "name": "New Agent",
            "email": "new_agent_create@test.com",
            "password": "securepass",
            "role": "agent",
            "max_chats": 5,
        }, headers=auth_headers(admin_agent))
        assert res.status_code in (200, 201)
        body = res.json()
        assert body["name"] == "New Agent"
        assert body["role"] == "agent"

    async def test_create_agent_as_regular_agent(self, client: AsyncClient, regular_agent: Agent, auth_headers):
        res = await client.post("/api/v1/agents", json={
            "name": "Should Fail",
            "email": "fail@test.com",
            "password": "securepass",
            "role": "agent",
            "max_chats": 5,
        }, headers=auth_headers(regular_agent))
        assert res.status_code == 403


class TestUpdateAgent:
    async def test_update_own_status(self, client: AsyncClient, regular_agent: Agent, auth_headers):
        res = await client.patch(
            f"/api/v1/agents/{regular_agent.id}",
            json={"status": "online"},
            headers=auth_headers(regular_agent),
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "online"


class TestDeleteAgent:
    async def test_delete_as_admin(self, client: AsyncClient, admin_agent: Agent, regular_agent: Agent, auth_headers):
        res = await client.delete(
            f"/api/v1/agents/{regular_agent.id}",
            headers=auth_headers(admin_agent),
        )
        assert res.status_code == 200

    async def test_delete_as_regular_agent(self, client: AsyncClient, regular_agent: Agent, auth_headers):
        res = await client.delete(
            f"/api/v1/agents/{regular_agent.id}",
            headers=auth_headers(regular_agent),
        )
        assert res.status_code == 403
