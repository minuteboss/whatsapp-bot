"""
Tests for conversation endpoints:
  GET  /api/v1/conversations
  GET  /api/v1/conversations/{id}
  POST /api/v1/conversations/{id}/messages
  POST /api/v1/conversations/{id}/accept
  POST /api/v1/conversations/{id}/resolve
  POST /api/v1/conversations/{id}/reopen
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from models import Agent, Tenant
from models.conversation import Conversation
from models.message import Message

pytestmark = pytest.mark.asyncio


async def _create_conversation(db: AsyncSession, tenant: Tenant, **kwargs) -> Conversation:
    conv = Conversation(
        channel="web_widget",
        status=kwargs.get("status", "pending"),
        customer_name=kwargs.get("customer_name", "Test Customer"),
        customer_email="customer@test.com",
        tenant_id=tenant.id,
        assigned_agent_id=kwargs.get("assigned_agent_id"),
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return conv


async def _create_message(db: AsyncSession, conv: Conversation, tenant: Tenant, **kwargs) -> Message:
    msg = Message(
        conversation_id=conv.id,
        tenant_id=tenant.id,
        sender_type=kwargs.get("sender_type", "customer"),
        content=kwargs.get("content", "Hello from test"),
        content_type="text",
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


class TestListConversations:
    async def test_list_all(self, client: AsyncClient, db: AsyncSession, admin_agent: Agent, tenant: Tenant, auth_headers):
        await _create_conversation(db, tenant)
        await _create_conversation(db, tenant)
        res = await client.get("/api/v1/conversations", headers=auth_headers(admin_agent))
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) >= 2

    async def test_list_filter_status(self, client: AsyncClient, db: AsyncSession, admin_agent: Agent, tenant: Tenant, auth_headers):
        await _create_conversation(db, tenant, status="pending")
        await _create_conversation(db, tenant, status="active", assigned_agent_id=admin_agent.id)
        res = await client.get("/api/v1/conversations?status=pending", headers=auth_headers(admin_agent))
        assert res.status_code == 200
        data = res.json()
        assert all(c["status"] == "pending" for c in data)


class TestGetConversation:
    async def test_get_with_messages(self, client: AsyncClient, db: AsyncSession, admin_agent: Agent, tenant: Tenant, auth_headers):
        conv = await _create_conversation(db, tenant)
        await _create_message(db, conv, tenant, content="Msg 1")
        await _create_message(db, conv, tenant, content="Msg 2")
        res = await client.get(f"/api/v1/conversations/{conv.id}", headers=auth_headers(admin_agent))
        assert res.status_code == 200
        body = res.json()
        assert body["conversation"]["id"] == conv.id
        assert len(body["messages"]) >= 2

    async def test_get_nonexistent(self, client: AsyncClient, admin_agent: Agent, auth_headers):
        res = await client.get("/api/v1/conversations/nonexistent-id", headers=auth_headers(admin_agent))
        assert res.status_code == 404


class TestSendMessage:
    async def test_send_message(self, client: AsyncClient, db: AsyncSession, admin_agent: Agent, tenant: Tenant, auth_headers):
        conv = await _create_conversation(db, tenant, status="active", assigned_agent_id=admin_agent.id)
        res = await client.post(
            f"/api/v1/conversations/{conv.id}/messages",
            json={"content": "Hello from agent"},
            headers=auth_headers(admin_agent),
        )
        assert res.status_code == 200
        body = res.json()
        assert body["content"] == "Hello from agent"
        assert body["sender_type"] == "agent"

    async def test_send_empty_message(self, client: AsyncClient, db: AsyncSession, admin_agent: Agent, tenant: Tenant, auth_headers):
        conv = await _create_conversation(db, tenant, status="active", assigned_agent_id=admin_agent.id)
        res = await client.post(
            f"/api/v1/conversations/{conv.id}/messages",
            json={"content": ""},
            headers=auth_headers(admin_agent),
        )
        assert res.status_code in (400, 422)


class TestConversationActions:
    async def test_accept(self, client: AsyncClient, db: AsyncSession, admin_agent: Agent, tenant: Tenant, auth_headers):
        conv = await _create_conversation(db, tenant, status="pending")
        res = await client.post(f"/api/v1/conversations/{conv.id}/accept", headers=auth_headers(admin_agent))
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "active"
        assert body["assigned_agent_id"] == admin_agent.id

    async def test_resolve(self, client: AsyncClient, db: AsyncSession, admin_agent: Agent, tenant: Tenant, auth_headers):
        conv = await _create_conversation(db, tenant, status="active", assigned_agent_id=admin_agent.id)
        res = await client.post(f"/api/v1/conversations/{conv.id}/resolve", headers=auth_headers(admin_agent))
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "resolved"

    async def test_reopen(self, client: AsyncClient, db: AsyncSession, admin_agent: Agent, tenant: Tenant, auth_headers):
        conv = await _create_conversation(db, tenant, status="resolved")
        res = await client.post(f"/api/v1/conversations/{conv.id}/reopen", headers=auth_headers(admin_agent))
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "pending"
