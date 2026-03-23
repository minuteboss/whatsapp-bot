"""
Pydantic schemas for agents.
"""

from pydantic import BaseModel
from datetime import datetime


class AgentCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "agent"
    max_chats: int = 5


class AgentUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    role: str | None = None
    max_chats: int | None = None
    email: str | None = None


class AgentResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    status: str
    max_chats: int
    wa_connected: bool
    wa_phone_number: str | None = None
    wa_phone_number_id: str | None = None
    wa_connected_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WAConnectInitiate(BaseModel):
    phone_number: str  # e164 format without +


class WAConnectVerify(BaseModel):
    code: str  # OTP code
