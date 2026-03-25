"""
Tests for webhook endpoints:
  GET  /webhook   — Meta verification challenge
  POST /webhook   — Event processing (basic smoke test)
  GET  /health    — Health check
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


class TestWebhookVerification:
    async def test_webhook_verify_success(self, client: AsyncClient):
        """GET /webhook with correct verify_token returns challenge."""
        from config import settings
        res = await client.get("/webhook", params={
            "hub.mode": "subscribe",
            "hub.verify_token": settings.WHATSAPP_VERIFY_TOKEN,
            "hub.challenge": "test_challenge_123",
        })
        assert res.status_code == 200
        assert res.text.strip('"') == "test_challenge_123"

    async def test_webhook_verify_wrong_token(self, client: AsyncClient):
        """GET /webhook with wrong token returns 403."""
        res = await client.get("/webhook", params={
            "hub.mode": "subscribe",
            "hub.verify_token": "WRONG_TOKEN",
            "hub.challenge": "test_challenge_123",
        })
        assert res.status_code == 403


class TestWebhookPost:
    async def test_webhook_post_empty_body(self, client: AsyncClient):
        """POST /webhook with empty/irrelevant body returns 200 (fire and forget)."""
        res = await client.post("/webhook", json={
            "object": "whatsapp_business_account",
            "entry": [],
        })
        # Webhook should return 200 to Meta regardless
        assert res.status_code == 200


class TestHealthCheck:
    async def test_health(self, client: AsyncClient):
        """GET /health returns ok status."""
        res = await client.get("/health")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "ok"
