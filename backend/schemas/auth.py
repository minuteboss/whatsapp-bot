"""
Pydantic schemas for authentication.
"""

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    agent: dict


class AgentMe(BaseModel):
    id: str
    name: str
    email: str
    role: str
    status: str
    max_chats: int
    wa_connected: bool
    wa_phone_number: str | None = None
