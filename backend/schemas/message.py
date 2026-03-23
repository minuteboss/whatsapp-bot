"""
Pydantic schemas for messages and the widget API.
"""

from pydantic import BaseModel
from datetime import datetime


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_type: str
    sender_agent_id: str | None = None
    sender_name: str | None = None
    content: str
    content_type: str
    wa_message_id: str | None = None
    wa_sent_from: str | None = None
    delivery_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class WidgetConversationCreate(BaseModel):
    name: str
    email: str | None = None
    message: str
    source_page: str | None = None


class WidgetMessageCreate(BaseModel):
    content: str
