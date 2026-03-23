"""
Pydantic schemas for conversations.
"""

from pydantic import BaseModel
from datetime import datetime


class ConversationResponse(BaseModel):
    id: str
    channel: str
    status: str
    customer_name: str | None = None
    customer_email: str | None = None
    customer_phone: str | None = None
    assigned_agent_id: str | None = None
    previous_agent_id: str | None = None
    transfer_note: str | None = None
    source_page: str | None = None
    wa_session_id: str | None = None
    last_message_at: datetime | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    last_message: str | None = None
    unread_count: int = 0

    model_config = {"from_attributes": True}


class SendMessageRequest(BaseModel):
    content: str


class TransferRequest(BaseModel):
    to_agent_id: str
    note: str | None = None


class AssignRequest(BaseModel):
    agent_id: str
