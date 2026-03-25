"""
Tests for authentication endpoints:
  POST /api/v1/auth/login
  GET  /api/v1/auth/me
  POST /api/v1/auth/logout
  POST /api/v1/auth/ws-ticket
"""

import pytest
from httpx import AsyncClient
from models import Agent

pytestmark = pytest.mark.asyncio


class TestLogin:
    async def test_login_success(self, client: AsyncClient, admin_agent: Agent):
        res = await client.post("/api/v1/auth/login", json={
            "email": admin_agent.email,
            "password": "password123",
        })
        assert res.status_code == 200
        body = res.json()
        assert body["agent"]["id"] == admin_agent.id
        assert body["agent"]["role"] == "admin"
        assert "auth_token" in res.cookies

    async def test_login_wrong_password(self, client: AsyncClient, admin_agent: Agent):
        res = await client.post("/api/v1/auth/login", json={
            "email": admin_agent.email,
            "password": "wrong_password",
        })
        assert res.status_code == 401

    async def test_login_nonexistent_email(self, client: AsyncClient):
        res = await client.post("/api/v1/auth/login", json={
            "email": "nobody@test.com",
            "password": "password123",
        })
        assert res.status_code == 401


class TestMe:
    async def test_me_authenticated(self, client: AsyncClient, admin_agent: Agent, auth_headers):
        res = await client.get("/api/v1/auth/me", headers=auth_headers(admin_agent))
        assert res.status_code == 200
        body = res.json()
        assert body["id"] == admin_agent.id
        assert body["email"] == admin_agent.email

    async def test_me_unauthenticated(self, client: AsyncClient):
        res = await client.get("/api/v1/auth/me")
        assert res.status_code == 401


class TestLogout:
    async def test_logout(self, client: AsyncClient, admin_agent: Agent, auth_headers):
        res = await client.post("/api/v1/auth/logout", headers=auth_headers(admin_agent))
        assert res.status_code == 200


class TestWSTicket:
    async def test_ws_ticket(self, client: AsyncClient, admin_agent: Agent, auth_headers):
        res = await client.post("/api/v1/auth/ws-ticket", headers=auth_headers(admin_agent))
        assert res.status_code == 200
        body = res.json()
        assert "ticket" in body
        assert isinstance(body["ticket"], str)
        assert len(body["ticket"]) > 10

    async def test_ws_ticket_unauthenticated(self, client: AsyncClient):
        res = await client.post("/api/v1/auth/ws-ticket")
        assert res.status_code == 401
