"""
WhatsApp Service — Meta Cloud API wrapper.
All calls via httpx AsyncClient.
"""

import hmac
import hashlib
import logging
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.agent import Agent

logger = logging.getLogger(__name__)


class WhatsAppService:
    """Wrapper around the Meta WhatsApp Cloud API."""

    def __init__(self):
        self.base_url = settings.whatsapp_base_url
        self.token = settings.WHATSAPP_TOKEN
        self.company_phone_id = settings.WHATSAPP_COMPANY_PHONE_NUMBER_ID
        self.waba_id = settings.WHATSAPP_BUSINESS_ACCOUNT_ID
        self.app_secret = settings.WHATSAPP_APP_SECRET
        self.verify_token = settings.WHATSAPP_VERIFY_TOKEN

    @property
    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    @property
    def is_configured(self) -> bool:
        return bool(self.token and self.company_phone_id)

    # ── Sending ───────────────────────────────────────────────

    async def send_text_message(
        self, phone_number_id: str, to: str, text: str
    ) -> dict | None:
        """
        Send a text message via the WhatsApp API.
        phone_number_id: the sender's Phone Number ID (company or agent personal).
        to: recipient phone number in e164 format (no +).
        """
        if not self.is_configured:
            logger.warning("WhatsApp not configured — skipping send")
            return None

        url = f"{self.base_url}/{phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": text},
        }
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, headers=self._headers, timeout=15)
                resp.raise_for_status()
                data = resp.json()
                logger.info(f"Message sent to {to} via {phone_number_id}")
                return data
        except Exception as e:
            logger.error(f"Failed to send WA message: {e}")
            return None

    async def mark_as_read(self, phone_number_id: str, wa_message_id: str):
        """Mark a message as read. Non-critical — catch all exceptions."""
        if not self.is_configured:
            return
        url = f"{self.base_url}/{phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": wa_message_id,
        }
        try:
            async with httpx.AsyncClient() as client:
                await client.post(url, json=payload, headers=self._headers, timeout=10)
        except Exception as e:
            logger.warning(f"Failed to mark as read: {e}")

    # ── Webhook Verification ──────────────────────────────────

    def verify_webhook_signature(self, signature: str, raw_body: bytes) -> bool:
        """
        Verify HMAC-SHA256 signature from Meta.
        Returns True if no secret is configured (dev mode).
        """
        if not self.app_secret:
            return True
        expected = hmac.new(
            self.app_secret.encode(), raw_body, hashlib.sha256
        ).hexdigest()
        sig_hash = signature.replace("sha256=", "") if signature else ""
        return hmac.compare_digest(expected, sig_hash)

    # ── Webhook Parsing ───────────────────────────────────────

    def parse_incoming_webhook(self, body: dict) -> list[dict]:
        """
        Parse inbound webhook payload from Meta.
        Returns list of parsed events (messages or statuses).
        """
        events = []
        try:
            for entry in body.get("entry", []):
                for change in entry.get("changes", []):
                    value = change.get("value", {})
                    metadata = value.get("metadata", {})
                    phone_number_id = metadata.get("phone_number_id", "")

                    # Status updates
                    for status in value.get("statuses", []):
                        events.append({
                            "type": "status",
                            "phone_number_id": phone_number_id,
                            "wa_message_id": status.get("id"),
                            "status": status.get("status"),
                            "recipient": status.get("recipient_id"),
                            "timestamp": status.get("timestamp"),
                        })

                    # Incoming messages
                    for msg in value.get("messages", []):
                        contact = {}
                        contacts = value.get("contacts", [])
                        if contacts:
                            contact = contacts[0]

                        msg_type = msg.get("type", "text")
                        content = ""
                        if msg_type == "text":
                            content = msg.get("text", {}).get("body", "")
                        elif msg_type == "image":
                            content = "[Image]"
                        elif msg_type == "audio":
                            content = "[Audio]"
                        elif msg_type == "document":
                            content = "[Document]"
                        elif msg_type == "location":
                            loc = msg.get("location", {})
                            content = f"[Location: {loc.get('latitude')}, {loc.get('longitude')}]"
                        elif msg_type == "sticker":
                            content = "[Sticker]"
                        elif msg_type == "interactive":
                            interactive = msg.get("interactive", {})
                            content = interactive.get("button_reply", {}).get("title", "[Interactive]")
                        else:
                            content = f"[{msg_type}]"

                        events.append({
                            "type": "message",
                            "phone_number_id": phone_number_id,
                            "wa_message_id": msg.get("id"),
                            "from": msg.get("from"),
                            "timestamp": msg.get("timestamp"),
                            "msg_type": msg_type,
                            "content": content,
                            "contact_name": contact.get("profile", {}).get("name", ""),
                        })
        except Exception as e:
            logger.error(f"Failed to parse webhook: {e}")

        return events

    # ── Sender Identification ─────────────────────────────────

    async def identify_sender(
        self, phone_number_id: str, db: AsyncSession
    ) -> Agent | None:
        """
        Check if phone_number_id belongs to an agent.
        Returns the Agent if found, None if it's a customer.
        """
        result = await db.execute(
            select(Agent).where(Agent.wa_phone_number_id == phone_number_id)
        )
        return result.scalar_one_or_none()

    # ── Phone Registration (Agent Connect) ────────────────────

    async def register_phone_number(self, phone_number: str, pin: str = "000000") -> dict | None:
        """
        Add a new phone number to the WABA.
        Initiates the OTP verification flow.
        """
        if not self.token or not self.waba_id:
            logger.error("WhatsApp not configured for phone registration")
            return None

        url = f"{self.base_url}/{self.waba_id}/phone_numbers"
        payload = {
            "cc": phone_number[:3],  # Country code (approx)
            "phone_number": phone_number,
            "migrate_phone_number": False,
            "pin": pin,
        }
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, headers=self._headers, timeout=30)
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.error(f"Failed to register phone number: {e}")
            return None

    async def request_verification_code(self, phone_number_id: str, code_method: str = "SMS") -> bool:
        """Request an OTP code for phone verification."""
        if not self.token:
            return False

        url = f"{self.base_url}/{phone_number_id}/request_code"
        payload = {"code_method": code_method, "language": "en_US"}
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, headers=self._headers, timeout=15)
                resp.raise_for_status()
                return True
        except Exception as e:
            logger.error(f"Failed to request verification code: {e}")
            return False

    async def verify_phone_otp(self, phone_number_id: str, code: str) -> bool:
        """Submit OTP to complete phone registration."""
        if not self.token:
            return False

        url = f"{self.base_url}/{phone_number_id}/verify_code"
        payload = {"code": code}
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, headers=self._headers, timeout=15)
                resp.raise_for_status()
                return True
        except Exception as e:
            logger.error(f"Failed to verify OTP: {e}")
            return False

    async def deregister_phone_number(self, phone_number_id: str) -> bool:
        """Remove a phone number from WABA."""
        if not self.token:
            return False

        url = f"{self.base_url}/{phone_number_id}"
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.delete(url, headers=self._headers, timeout=15)
                resp.raise_for_status()
                return True
        except Exception as e:
            logger.error(f"Failed to deregister phone number: {e}")
            return False


# ── Singleton ─────────────────────────────────────────────────
wa_service = WhatsAppService()
