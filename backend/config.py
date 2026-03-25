"""
Application configuration via pydantic-settings.
All values loaded from environment variables / .env file.
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./support.db"

    # ── Environment ───────────────────────────────────────────
    ENVIRONMENT: str = "development"
    
    # ── JWT ───────────────────────────────────────────────────
    JWT_SECRET: str = "change-me-in-production-use-a-long-random-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 24

    # ── CORS ──────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # ── WhatsApp (Meta Cloud API) ─────────────────────────────
    WHATSAPP_TOKEN: Optional[str] = None
    WHATSAPP_COMPANY_PHONE_NUMBER_ID: Optional[str] = None
    WHATSAPP_BUSINESS_ACCOUNT_ID: Optional[str] = None
    WHATSAPP_APP_SECRET: Optional[str] = None
    WHATSAPP_VERIFY_TOKEN: str = "my-verify-token"
    WHATSAPP_API_VERSION: str = "v18.0"

    # ── Rate Limiting ─────────────────────────────────────────
    RATE_LIMIT_API: str = "500/15minutes"
    RATE_LIMIT_WEBHOOK: str = "1000/minute"
    RATE_LIMIT_AUTH: str = "10/minute"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def whatsapp_base_url(self) -> str:
        return f"https://graph.facebook.com/{self.WHATSAPP_API_VERSION}"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
