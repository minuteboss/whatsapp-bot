"""
Tests for admin endpoints:
  GET  /api/v1/admin/settings
  POST /api/v1/admin/settings
  GET  /api/v1/admin/canned
  POST /api/v1/admin/canned
  DELETE /api/v1/admin/canned/{id}
  GET  /api/v1/admin/stats
"""

import pytest
from httpx import AsyncClient
from models import Agent

pytestmark = pytest.mark.asyncio


class TestSettings:
    async def test_get_settings(self, client: AsyncClient, admin_agent: Agent, auth_headers):
        res = await client.get("/api/v1/admin/settings", headers=auth_headers(admin_agent))
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)

    async def test_update_settings(self, client: AsyncClient, admin_agent: Agent, auth_headers):
        res = await client.post("/api/v1/admin/settings", json={
            "business_name": "Test Business",
            "auto_assign": "true",
        }, headers=auth_headers(admin_agent))
        assert res.status_code == 200

    async def test_settings_denied_for_regular_agent(self, client: AsyncClient, regular_agent: Agent, auth_headers):
        res = await client.get("/api/v1/admin/settings", headers=auth_headers(regular_agent))
        assert res.status_code == 403


class TestCannedResponses:
    async def test_list_canned(self, client: AsyncClient, admin_agent: Agent, auth_headers):
        res = await client.get("/api/v1/admin/canned", headers=auth_headers(admin_agent))
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)

    async def test_create_canned(self, client: AsyncClient, admin_agent: Agent, auth_headers):
        res = await client.post("/api/v1/admin/canned", json={
            "shortcut": "/test",
            "title": "Test Reply",
            "content": "This is a test canned response.",
        }, headers=auth_headers(admin_agent))
        assert res.status_code in (200, 201)
        body = res.json()
        assert body["shortcut"] == "/test"
        assert body["title"] == "Test Reply"

    async def test_delete_canned(self, client: AsyncClient, admin_agent: Agent, auth_headers):
        create_res = await client.post("/api/v1/admin/canned", json={
            "shortcut": "/delete_me",
            "title": "Delete Me",
            "content": "Temporary",
        }, headers=auth_headers(admin_agent))
        assert create_res.status_code in (200, 201)
        canned_id = create_res.json()["id"]

        del_res = await client.delete(
            f"/api/v1/admin/canned/{canned_id}",
            headers=auth_headers(admin_agent),
        )
        assert del_res.status_code == 200


class TestStats:
    async def test_get_stats(self, client: AsyncClient, admin_agent: Agent, auth_headers):
        res = await client.get("/api/v1/admin/stats", headers=auth_headers(admin_agent))
        assert res.status_code == 200
        body = res.json()
        assert isinstance(body, dict)

    async def test_stats_denied_for_regular_agent(self, client: AsyncClient, regular_agent: Agent, auth_headers):
        res = await client.get("/api/v1/admin/stats", headers=auth_headers(regular_agent))
        assert res.status_code == 403
