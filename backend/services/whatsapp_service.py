"""
WhatsApp Service — Meta Cloud API wrapper.
Each tenant provides their own WhatsApp credentials.
Default tenant falls back to .env variables for backward compatibility.
"""

import hmac
import hashlib
import logging
from typing import Any, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from services.setting_service import global_settings
from models.agent import Agent
from models.tenant import Tenant

logger = logging.getLogger(__name__)


class WhatsAppService:
    """Wrapper around the Meta WhatsApp Cloud API using centralized credentials."""

    def __init__(self):
        self.base_url = settings.whatsapp_base_url

    def _get_token(self) -> str | None:
        """Get global WhatsApp token."""
        return global_settings.get("meta_token", settings.WHATSAPP_TOKEN)

    def _get_company_phone_id(self, tenant=None) -> str | None:
        """Get company phone number ID from tenant (since phone numbers differ per tenant)."""
        if tenant and tenant.whatsapp_company_phone_number_id:
            return tenant.whatsapp_company_phone_number_id
        return settings.WHATSAPP_COMPANY_PHONE_NUMBER_ID

    def _get_waba_id(self) -> str | None:
        """Get global WABA ID."""
        return global_settings.get("meta_waba_id", settings.WHATSAPP_BUSINESS_ACCOUNT_ID)

    def _get_app_secret(self) -> str | None:
        """Get global app secret."""
        return global_settings.get("meta_app_secret", settings.WHATSAPP_APP_SECRET)

    def _get_verify_token(self) -> str:
        """Get global verify token."""
        return global_settings.get("meta_verify_token", settings.WHATSAPP_VERIFY_TOKEN)

    def _headers(self) -> dict:
        token = self._get_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    def is_configured(self, tenant=None) -> bool:
        return bool(self._get_token() and self._get_company_phone_id(tenant))

    # ── Sending ───────────────────────────────────────────────

    async def send_text_message(
        self, phone_number_id: str, to: str, text: str
    ) -> dict | None:
        token = self._get_token()
        if not token:
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
                resp = await client.post(url, json=payload, headers=self._headers(), timeout=15)
                resp.raise_for_status()
                data = resp.json()
                logger.info(f"Message sent to {to} via {phone_number_id}")
                return data
        except Exception as e:
            logger.error(f"Failed to send WA message: {e}")
            return None

    async def send_template_message(
        self, phone_number_id: str, to: str, template_name: str, language: str = "en_US", components: list = None
    ) -> dict | None:
        token = self._get_token()
        if not token:
            return None

        url = f"{self.base_url}/{phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language},
            },
        }
        if components:
            payload["template"]["components"] = components

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, headers=self._headers(), timeout=15)
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.error(f"Failed to send template message: {e}")
            return None

    async def get_templates(self) -> list:
        """Fetch all message templates for the WABA."""
        waba_id = self._get_waba_id()
        if not waba_id:
            return []
        
        url = f"{self.base_url}/{waba_id}/message_templates"
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=self._headers(), timeout=20)
                resp.raise_for_status()
                data = resp.json()
                return data.get("data", [])
        except Exception as e:
            logger.warning(f"get_templates failed: {e}")
            return []

    async def get_phone_number_info(self, phone_number_id: str) -> dict:
        """Fetch quality rating, limit tier, and display number from Meta Graph API."""
        token = self._get_token()
        if not token:
            return {}
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.base_url}/{phone_number_id}",
                    params={"fields": "quality_rating,messaging_limit_tier,display_phone_number,verified_name"},
                    headers=self._headers(),
                    timeout=10,
                )
                if resp.is_success:
                    return resp.json()
        except Exception as e:
            logger.warning(f"get_phone_number_info failed: {e}")
        return {}

    async def mark_as_read(self, phone_number_id: str, wa_message_id: str):
        if not self._get_token():
            return
        url = f"{self.base_url}/{phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": wa_message_id,
        }
        try:
            async with httpx.AsyncClient() as client:
                await client.post(url, json=payload, headers=self._headers(), timeout=10)
        except Exception as e:
            logger.warning(f"Failed to mark as read: {e}")

    # ── Media Download ────────────────────────────────────────

    async def download_media(self, media_id: str) -> tuple[bytes | None, str]:
        """Download media from Meta Graph API. Returns (bytes, mime_type)."""
        token = self._get_token()
        if not token:
            return None, ""
        try:
            async with httpx.AsyncClient() as client:
                # First, get the media URL
                resp = await client.get(
                    f"{self.base_url}/{media_id}",
                    headers=self._headers(),
                    timeout=15,
                )
                resp.raise_for_status()
                media_info = resp.json()
                media_url = media_info.get("url")
                mime_type = media_info.get("mime_type", "application/octet-stream")

                if not media_url:
                    return None, ""

                # Download the actual file
                file_resp = await client.get(
                    media_url,
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=30,
                )
                file_resp.raise_for_status()
                return file_resp.content, mime_type
        except Exception as e:
            logger.error(f"Failed to download media {media_id}: {e}")
            return None, ""

    # ── WABA Overview ─────────────────────────────────────────
    
    async def get_waba_overview(self) -> dict:
        waba_id = self._get_waba_id()
        if not waba_id:
            return {}
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.base_url}/{waba_id}",
                    params={"fields": "name,timezone,currency,health_status"},
                    headers=self._headers(),
                    timeout=15,
                )
                if resp.is_success:
                    return resp.json()
        except Exception as e:
            logger.warning(f"get_waba_overview failed: {e}")
        return {}

    async def get_waba_phone_numbers(self) -> list:
        waba_id = self._get_waba_id()
        if not waba_id:
            return []
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.base_url}/{waba_id}/phone_numbers",
                    params={"fields": "display_phone_number,quality_rating,status,messaging_limit_tier,verified_name"},
                    headers=self._headers(),
                    timeout=15,
                )
                if resp.is_success:
                    data = resp.json()
                    return data.get("data", [])
        except Exception as e:
            logger.warning(f"get_waba_phone_numbers failed: {e}")
        return []

    # ── Webhook Verification ──────────────────────────────────

    def verify_webhook_signature(self, signature: str, raw_body: bytes) -> bool:
        app_secret = self._get_app_secret()
        if not app_secret:
            return True
        expected = hmac.new(
            app_secret.encode(), raw_body, hashlib.sha256
        ).hexdigest()
        sig_hash = signature.replace("sha256=", "") if signature else ""
        return hmac.compare_digest(expected, sig_hash)

    # ── Webhook Parsing ───────────────────────────────────────

    def parse_incoming_webhook(self, body: dict) -> list[dict]:
        events = []
        try:
            for entry in body.get("entry", []):
                for change in entry.get("changes", []):
                    value = change.get("value", {})
                    metadata = value.get("metadata", {})
                    phone_number_id = metadata.get("phone_number_id", "")

                    for status in value.get("statuses", []):
                        events.append({
                            "type": "status",
                            "phone_number_id": phone_number_id,
                            "wa_message_id": status.get("id"),
                            "status": status.get("status"),
                            "recipient": status.get("recipient_id"),
                            "timestamp": status.get("timestamp"),
                            "conversation": status.get("conversation"), # {id, origin, expiration_timestamp}
                            "pricing": status.get("pricing"),
                        })

                    for msg in value.get("messages", []):
                        contact = {}
                        contacts = value.get("contacts", [])
                        if contacts:
                            contact = contacts[0]

                        msg_type = msg.get("type", "text")
                        content = ""
                        media_id = None
                        if msg_type == "text":
                            content = msg.get("text", {}).get("body", "")
                        elif msg_type in ("image", "audio", "document", "video", "sticker"):
                            media_data = msg.get(msg_type, {})
                            media_id = media_data.get("id")
                            content = f"[{msg_type.capitalize()}]"
                            if media_data.get("caption"):
                                content = media_data["caption"]
                        elif msg_type == "location":
                            loc = msg.get("location", {})
                            content = f"[Location: {loc.get('latitude')}, {loc.get('longitude')}]"
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
                            "media_id": media_id,
                        })
        except Exception as e:
            logger.error(f"Failed to parse webhook: {e}")

        return events

    # ── Sender Identification ─────────────────────────────────

    async def identify_sender(
        self, phone_number_id: str, db: AsyncSession
    ) -> Agent | None:
        result = await db.execute(
            select(Agent).where(Agent.wa_phone_number_id == phone_number_id)
        )
        return result.scalar_one_or_none()

    # ── Phone Registration (Agent Connect) ────────────────────

    async def request_verification_code(self, phone_number_id: str, code_method: str = "SMS") -> tuple[bool, str]:
        """Returns (success, error_message). On success error_message is empty."""
        token = self._get_token()
        if not token:
            return False, "WHATSAPP_TOKEN not configured"
        url = f"{self.base_url}/{phone_number_id}/request_code"
        payload = {"code_method": code_method, "language": "en_US"}
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, headers=self._headers(), timeout=15)
                body = resp.json() if resp.content else {}
                logger.info(f"request_code response {resp.status_code}: {body}")
                if not resp.is_success:
                    error_msg = body.get("error", {}).get("message", f"HTTP {resp.status_code}")
                    logger.error(f"request_code failed: {error_msg}")
                    return False, error_msg
                return True, ""
        except Exception as e:
            logger.error(f"Failed to request verification code: {e}")
            return False, str(e)

    async def verify_code(self, phone_number_id: str, code: str) -> tuple[dict, str]:
        """Returns (result_dict, error_message). On failure result is empty."""
        token = self._get_token()
        if not token:
            return {}, "WHATSAPP_TOKEN not configured"
        url = f"{self.base_url}/{phone_number_id}/verify_code"
        payload = {"code": code}
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, headers=self._headers(), timeout=15)
                body = resp.json() if resp.content else {}
                logger.info(f"verify_code response {resp.status_code}: {body}")
                if not resp.is_success:
                    error_msg = body.get("error", {}).get("message", f"HTTP {resp.status_code}")
                    logger.error(f"verify_code failed: {error_msg}")
                    return {}, error_msg
                return body, ""
        except Exception as e:
            logger.error(f"Failed to verify OTP: {e}")
            return {}, str(e)


# ── Singleton ─────────────────────────────────────────────────
wa_service = WhatsAppService()
