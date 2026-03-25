---
name: whatsapp-backend
description: >
  Use this skill when working on the backend of the WhatsApp Multi-Agent Support project.
  Trigger for any task involving API routes, database models, WhatsApp webhook processing,
  conversation routing, agent management, the widget API, authentication, WebSocket events,
  or any Python/FastAPI code under the backend/ directory. Always read this skill before
  modifying main.py, any router, service, model, or middleware file.
---

# WhatsApp Backend — Agent Knowledge File

## Overview

The backend is a Python 3.11+ **FastAPI** application that powers a multi-tenant, multi-agent customer support platform. It provides REST APIs for the Next.js dashboard, a public widget API, a Meta WhatsApp Cloud API webhook, a superadmin tenant management API, and a WebSocket endpoint for real-time agent updates. The database uses **SQLAlchemy 2.0 async** ORM with SQLite (dev) or PostgreSQL (prod). Auth uses **httpOnly cookies** for JWT tokens.

## Architecture

- **Framework**: FastAPI 0.115+ with lifespan event for DB init, Alembic migrations, and seeding.
- **ORM**: SQLAlchemy 2.0 async (`async_session`, `AsyncSession`) with `DeclarativeBase`.
- **Auth**: JWT via httpOnly cookies (login sets cookie, logout clears) + WS ticket system for WebSocket auth + API key for widget.
- **Multi-Tenancy**: `tenant_id` FK on all core models, tenant resolution middleware (subdomain → header → default), per-tenant WhatsApp credentials.
- **WhatsApp**: Meta Cloud API (Graph API) via `httpx` async HTTP client. Supports per-tenant credentials with env var fallback. Media download support.
- **Real-time**: Native FastAPI `WebSocket` endpoint at `/ws` with ticket-based auth via custom `WebSocketManager`.
- **Rate Limiting**: `slowapi` (token-bucket, configurable per route category).
- **Config**: `pydantic-settings` loading from `.env` file.
- **Migrations**: Alembic for PostgreSQL production; `create_all` for SQLite dev.
- **Pattern**: Singleton services (`wa_service`, `ws_manager`), stateless router functions, `ConversationService` with static methods.

## Directory Structure

```
backend/
├── main.py                      # App factory, lifespan, seed data, CORS, WS endpoint
├── config.py                    # pydantic-settings Settings class
├── database.py                  # Async engine, session factory, Base, get_db dependency
├── middleware/
│   ├── __init__.py
│   ├── auth.py                  # httpOnly cookie JWT, WS ticket auth, require_admin,
│   │                            #   require_superadmin, verify_api_key (tenant-scoped)
│   └── tenant.py                # Tenant resolution middleware (subdomain → header → default)
├── models/
│   ├── __init__.py              # Re-exports all models
│   ├── tenant.py                # Tenant (id, name, slug, plan, max_agents, widget_api_key,
│   │                            #   whatsapp_token, whatsapp_company_phone_number_id, ...)
│   ├── agent.py                 # Agent (id, name, email, role[admin/agent/superadmin],
│   │                            #   status, max_chats, tenant_id FK, wa_* fields)
│   ├── conversation.py          # Conversation (id, channel, status, customer_*, tenant_id FK,
│   │                            #   assigned_agent_id, previous_agent_id, transfer_note, ...)
│   ├── message.py               # Message (id, conversation_id, sender_type, tenant_id FK,
│   │                            #   content, media_url, wa_message_id, delivery_status)
│   └── setting.py               # Setting (key/value, tenant_id FK),
│                                #   CannedResponse (shortcut, title, content, tenant_id FK),
│                                #   TransferLog (conversation_id, from/to_agent_id, tenant_id FK)
├── routers/
│   ├── __init__.py
│   ├── auth.py                  # /api/v1/auth — login (sets httpOnly cookie), me, logout, ws-ticket
│   ├── agents.py                # /api/v1/agents — CRUD + WA connect (all tenant-scoped)
│   ├── conversations.py         # /api/v1/conversations — list, get (cursor pagination), send, accept,
│   │                            #   assign, transfer, resolve, reopen (all tenant-scoped)
│   ├── widget.py                # /api/v1/widget — public widget API (tenant-scoped via API key)
│   ├── webhook.py               # /webhook — Meta WA webhook + media download + /api/v1/media/{filename}
│   ├── admin.py                 # /api/v1/admin — stats, settings (array format), canned (tenant-scoped)
│   └── superadmin.py            # /api/v1/superadmin — tenant CRUD, stats, soft-delete
├── schemas/
│   ├── __init__.py
│   ├── auth.py                  # LoginRequest, TokenResponse, AgentMe
│   ├── agent.py                 # AgentCreate, AgentUpdate, AgentResponse, WAConnectInitiate, WAConnectVerify
│   ├── conversation.py          # ConversationResponse, SendMessageRequest, TransferRequest, AssignRequest
│   └── message.py               # MessageResponse, WidgetConversationCreate, WidgetMessageCreate
├── services/
│   ├── __init__.py
│   ├── whatsapp_service.py      # WhatsAppService class — send_text_message, mark_as_read,
│   │                            #   verify_webhook_signature, parse_incoming_webhook, identify_sender,
│   │                            #   register/request_verification/verify/deregister phone
│   ├── conversation_service.py  # ConversationService — auto_assign, accept, assign, transfer,
│   │                            #   resolve, reopen, helper dicts (_conv_dict, _msg_dict)
│   └── websocket_manager.py     # WebSocketManager — connect, disconnect, send_to_agent,
│                                #   broadcast_all, broadcast_except
├── requirements.txt             # Python dependencies
├── seed_db.py                   # Standalone seed script
├── verify_db.py                 # DB verification utility
└── support.db                   # SQLite database file (dev)
```

## API Route Table

| Method   | Path                                          | Auth       | Purpose                                   |
|----------|-----------------------------------------------|------------|-------------------------------------------|
| `POST`   | `/api/v1/auth/login`                          | None       | Agent login (sets httpOnly cookie)        |
| `GET`    | `/api/v1/auth/me`                             | Cookie     | Current agent profile                     |
| `POST`   | `/api/v1/auth/logout`                         | Cookie     | Logout, clear cookie, set status offline  |
| `POST`   | `/api/v1/auth/ws-ticket`                      | Cookie     | Get short-lived WS auth ticket            |
| `GET`    | `/api/v1/agents`                              | Cookie     | List agents (tenant-scoped)               |
| `POST`   | `/api/v1/agents`                              | Admin      | Create agent (tenant-scoped)              |
| `PATCH`  | `/api/v1/agents/{id}`                         | Cookie     | Update agent                              |
| `DELETE` | `/api/v1/agents/{id}`                         | Admin      | Delete agent                              |
| `POST`   | `/api/v1/agents/{id}/wa/connect/initiate`     | Cookie     | Start WA phone registration               |
| `POST`   | `/api/v1/agents/{id}/wa/connect/verify`       | Cookie     | Verify OTP for WA connection              |
| `DELETE` | `/api/v1/agents/{id}/wa/connect`              | Cookie     | Disconnect personal WA                    |
| `GET`    | `/api/v1/conversations`                       | Cookie     | List conversations (tenant-scoped)        |
| `GET`    | `/api/v1/conversations/{id}`                  | Cookie     | Get conversation + messages (cursor pagination) |
| `POST`   | `/api/v1/conversations/{id}/messages`         | Cookie     | Send message (4096 char max)              |
| `POST`   | `/api/v1/conversations/{id}/accept`           | Cookie     | Accept pending conversation               |
| `POST`   | `/api/v1/conversations/{id}/assign`           | Cookie     | Assign to specific agent                  |
| `POST`   | `/api/v1/conversations/{id}/transfer`         | Cookie     | Transfer to another agent                 |
| `POST`   | `/api/v1/conversations/{id}/resolve`          | Cookie     | Resolve conversation                      |
| `POST`   | `/api/v1/conversations/{id}/reopen`           | Cookie     | Reopen resolved conversation              |
| `POST`   | `/api/v1/widget/conversations`                | API Key    | Widget: create new chat (tenant-scoped)   |
| `POST`   | `/api/v1/widget/conversations/{id}/messages`  | API Key    | Widget: customer sends follow-up          |
| `GET`    | `/api/v1/widget/conversations/{id}/messages`  | API Key    | Widget: poll for new messages             |
| `GET`    | `/api/v1/admin/stats`                         | Admin      | Dashboard statistics (tenant-scoped)      |
| `GET`    | `/api/v1/admin/settings`                      | Admin      | Get settings (returns [{key,value}])      |
| `POST`   | `/api/v1/admin/settings`                      | Admin      | Upsert settings                           |
| `GET`    | `/api/v1/admin/canned`                        | Admin      | List canned responses                     |
| `POST`   | `/api/v1/admin/canned`                        | Admin      | Create canned response                    |
| `DELETE` | `/api/v1/admin/canned/{id}`                   | Admin      | Delete canned response                    |
| `GET`    | `/api/v1/superadmin/tenants`                  | Superadmin | List all tenants                          |
| `POST`   | `/api/v1/superadmin/tenants`                  | Superadmin | Create tenant                             |
| `PATCH`  | `/api/v1/superadmin/tenants/{id}`             | Superadmin | Update tenant                             |
| `DELETE` | `/api/v1/superadmin/tenants/{id}`             | Superadmin | Soft-delete tenant                        |
| `GET`    | `/api/v1/superadmin/tenants/{id}/stats`       | Superadmin | Per-tenant statistics                     |
| `GET`    | `/webhook`                                    | Verify Token | Meta webhook verification               |
| `POST`   | `/webhook`                                    | HMAC-SHA256  | Receive Meta webhook events             |
| `GET`    | `/api/v1/media/{filename}`                    | None       | Serve downloaded media files              |
| `GET`    | `/health`                                     | None       | Health check                              |
| `WS`     | `/ws`                                         | Ticket/JWT | Agent dashboard WebSocket                 |

## Database Schema Summary

### tenants
`id` (PK, UUID), `name`, `slug` (unique), `plan` (free/starter/pro/enterprise), `max_agents`, `max_chats_per_agent`, `widget_api_key` (unique), `whatsapp_token`, `whatsapp_company_phone_number_id`, `whatsapp_business_account_id`, `whatsapp_app_secret`, `is_active`, `created_at`, `updated_at`

### agents
`id` (PK, UUID), `name`, `email` (unique), `password_hash`, `role` (admin/agent/superadmin), `status`, `max_chats`, `api_key`, `tenant_id` (FK→tenants), `wa_*` fields, `created_at`, `updated_at`

### conversations
`id` (PK, UUID), `channel`, `status`, `customer_*`, `tenant_id` (FK→tenants), `assigned_agent_id` (FK→agents), `previous_agent_id`, `transfer_note`, `source_page`, `last_message_at`, `resolved_at`, `created_at`, `updated_at`

### messages
`id` (PK, UUID), `conversation_id` (FK), `tenant_id` (FK→tenants), `sender_type`, `sender_agent_id`, `content`, `content_type`, `media_url`, `wa_message_id`, `delivery_status`, `created_at`

### settings
`key` (PK), `tenant_id` (FK→tenants), `value`, `updated_at`

### canned_responses
`id` (PK, UUID), `tenant_id` (FK→tenants), `shortcut`, `title`, `content`, `created_by`, `created_at`

### transfer_log
`id` (PK, UUID), `conversation_id` (FK), `tenant_id` (FK→tenants), `from_agent_id`, `to_agent_id`, `note`, `transferred_at`

## WhatsApp Message Lifecycle

1. **Inbound**: Meta sends POST to `/webhook` → signature verified → `_process_webhook()` runs in background task.
2. **Parse**: `WhatsAppService.parse_incoming_webhook()` extracts message/status events from Meta's nested JSON.
3. **Sender ID**: `identify_sender()` checks if `phone_number_id` belongs to an agent.
4. **Customer path**: Find or create `Conversation` → auto-assign via `ConversationService.auto_assign()` → send welcome/away message → save `Message` → broadcast via WebSocket.
5. **Agent WA reply path**: `_handle_agent_wa_reply()` matches conversation by `customer_phone` → saves as agent message.
6. **Outbound (from dashboard)**: `POST /api/v1/conversations/{id}/messages` → if WA channel, sends via `wa_service.send_text_message()` using agent's personal phone ID or company phone ID → saves message → broadcasts.
7. **Delivery status**: Meta sends status updates → `_handle_status_update()` updates `Message.delivery_status` → broadcasts `message:status`.

## WebSocket Events

| Event Type                 | Direction     | Payload                                      |
|----------------------------|---------------|----------------------------------------------|
| `auth` (with `ticket`)     | Client→Server | WS ticket authentication frame               |
| `auth:success`             | Server→Client | Confirmation + `agent_id`                    |
| `auth:error`               | Server→Client | Auth failure detail                          |
| `conversation:new`         | Server→Client | New/reopened conversation object              |
| `conversation:assigned`    | Server→Client | Conversation assigned to agent               |
| `conversation:transferred` | Server→Client | Conversation transferred                     |
| `conversation:resolved`    | Server→Client | Conversation resolved                        |
| `message:new`              | Server→Client | New message + conversation update            |
| `message:status`           | Server→Client | Delivery status update (`wa_message_id`, `status`) |
| `wa:reply_received`        | Server→Client | Agent WA reply synced                        |
| `agent:status`             | Server→Client | Agent online/offline status change           |
| `queue:update`             | Server→Client | Pending conversation count                   |
| `typing`                   | Client→Server | Typing indicator (`conversation_id`)         |

## Key Conventions

- **UUIDs everywhere**: All primary keys are `uuid4()` strings (36 chars).
- **Async all the way**: Every DB operation uses `async/await` with `AsyncSession`.
- **No ORM relationships**: Models use plain `ForeignKey` columns; joins are manual via `select()`.
- **Dict serialization**: `ConversationService._conv_dict()` and `_msg_dict()` are used instead of Pydantic `.model_dump()` for WebSocket payloads.
- **Background tasks**: Webhook processing uses FastAPI's `BackgroundTasks` to return 200 immediately.
- **`db.flush()` not `db.commit()`**: Routers flush within the `get_db` dependency which auto-commits.

## Environment & Config

| Variable                        | Type     | Default / Example                                  | Service    |
|---------------------------------|----------|-----------------------------------------------------|------------|
| `ENVIRONMENT`                   | `str`    | `development`                                       | App        |
| `DATABASE_URL`                  | `str`    | `sqlite+aiosqlite:///./support.db`                 | SQLAlchemy |
| `JWT_SECRET`                    | `str`    | `change-me-in-production-use-a-long-random-string` | Auth       |
| `JWT_ALGORITHM`                 | `str`    | `HS256`                                             | Auth       |
| `JWT_EXPIRY_HOURS`              | `int`    | `24`                                                | Auth       |
| `CORS_ORIGINS`                  | `str`    | `http://localhost:3000,http://127.0.0.1:3000`      | CORS       |
| `WHATSAPP_TOKEN`                | `str?`   | _(Meta System User token)_                          | WhatsApp   |
| `WHATSAPP_COMPANY_PHONE_NUMBER_ID` | `str?` | _(Meta Phone Number ID)_                           | WhatsApp   |
| `WHATSAPP_BUSINESS_ACCOUNT_ID`  | `str?`   | _(Meta WABA ID)_                                    | WhatsApp   |
| `WHATSAPP_APP_SECRET`           | `str?`   | _(Meta App Secret for HMAC)_                        | WhatsApp   |
| `WHATSAPP_VERIFY_TOKEN`         | `str`    | `my-verify-token`                                   | Webhook    |
| `WHATSAPP_API_VERSION`          | `str`    | `v18.0`                                             | WhatsApp   |
| `RATE_LIMIT_API`                | `str`    | `500/15minutes`                                     | slowapi    |
| `RATE_LIMIT_AUTH`               | `str`    | `20/minute`                                         | slowapi    |
| `RATE_LIMIT_WEBHOOK`            | `str`    | `1000/minute`                                       | slowapi    |

## Common Tasks

### Add a new API route
1. Create or extend a router file in `routers/`.
2. All queries MUST include `.where(Model.tenant_id == tenant.id)` for tenant scoping.
3. Register the router in `main.py` via `app.include_router(your_router.router)`.
4. Use `Depends(get_db)` for DB access and `Depends(get_current_agent)` for auth.

### Add a new database model
1. Create `models/your_model.py` extending `Base` from `database.py`.
2. Include `tenant_id = Column(String(36), ForeignKey('tenants.id'), nullable=False)` for multi-tenancy.
3. Re-export in `models/__init__.py`.
4. For prod: create Alembic migration via `alembic revision --autogenerate`.

### Send a WhatsApp message (tenant-aware)
```python
from services.whatsapp_service import wa_service
company_phone_id = wa_service._get_company_phone_id(tenant)
await wa_service.send_text_message(company_phone_id, recipient_phone, text, tenant=tenant)
```

## Gotchas & Known Issues

- **Seed data checks Tenant table**: The `seed_data()` checks for existing `Tenant` rows (not `Agent`). Delete all tenants to re-seed.
- **Tenant scoping is mandatory**: Every query in every router must filter by `tenant_id`. Missing this creates a data leak between tenants.
- **httpOnly cookies**: JWT is sent as httpOnly cookie — cannot be read by JavaScript. Use `/api/v1/auth/ws-ticket` for WebSocket auth.
- **Alembic in production**: PostgreSQL uses Alembic migrations on boot. SQLite uses `create_all`. New models need both paths handled.
- **Media files stored locally**: Downloaded WhatsApp media saved to `backend/media/`. In production, use object storage.
- **`db.flush()` pattern**: All routers use `flush()` and rely on `get_db` dependency to commit. If you bypass the dependency, you must commit manually.
