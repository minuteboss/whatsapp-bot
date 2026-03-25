---
name: whatsapp-project
description: >
  Use this skill when working on cross-cutting concerns of the WhatsApp Multi-Agent Support project.
  Trigger for tasks spanning backend and frontend, deployment, architecture decisions, local dev setup,
  the end-to-end WhatsApp message lifecycle, environment configuration, the embeddable chat widget,
  or when you need a high-level understanding of the whole system. Always read this skill before
  making changes that touch both backend/ and frontend/, or when onboarding to the project.
---

# WhatsApp Multi-Agent Support — Project Knowledge File

## Overview

A production-ready, full-stack **multi-tenant** multi-agent customer support platform. Customers can chat via a website widget or WhatsApp. Agents handle conversations from a unified web dashboard or their personal WhatsApp accounts. The system features auto-assignment, real-time updates, conversation transfer, canned responses, admin controls, and superadmin tenant management. Auth uses httpOnly cookies. Database migrations via Alembic.

## System Architecture

```
┌─────────────────────┐        ┌──────────────────────┐
│   Customer's Phone  │        │   Customer's Browser  │
│   (WhatsApp App)    │        │   (Chat Widget)       │
└────────┬────────────┘        └──────────┬────────────┘
         │                                │
    Meta Cloud API                   POST /api/v1/widget/*
    (webhook POST)                   (x-api-key auth)
         │                                │
         ▼                                ▼
┌─────────────────────────────────────────────────────┐
│                    BACKEND (FastAPI)                  │
│  Port 8000 | Python 3.11+ | SQLAlchemy 2.0 Async    │
│                                                      │
│  /webhook          ← Meta WhatsApp Cloud API         │
│  /api/v1/auth      ← httpOnly cookie login/logout + WS ticket  │
│  /api/v1/agents    ← Agent CRUD + WA connect (tenant-scoped)   │
│  /api/v1/conversations ← Chat management (cursor pagination)   │
│  /api/v1/widget    ← Public widget API (tenant-scoped API key) │
│  /api/v1/admin     ← Settings, stats, canned (tenant-scoped)   │
│  /api/v1/superadmin ← Tenant management (superadmin only)      │
│  /ws               ← WebSocket (ticket-based auth)             │
│                                                                  │
│  DB: SQLite (dev) / PostgreSQL (prod) + Alembic migrations      │
└──────────────┬──────────────────┬────────────────────┘
               │                  │
          REST API           WebSocket
          (Cookie auth)      (Ticket auth)
               │                  │
               ▼                  ▼
┌─────────────────────────────────────────────────────┐
│               FRONTEND (Next.js 16)                  │
│  Port 3000 | React 19 | Tailwind CSS 4              │
│                                                      │
│  /login            ← Agent login                     │
│  /dashboard        ← Main chat view                  │
│  /dashboard/admin  ← Admin panel                     │
│  /dashboard/profile ← Agent profile + WA setup       │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer      | Technology                         | Version   |
|------------|-------------------------------------|-----------|
| Backend    | Python + FastAPI                    | 3.11+ / 0.115+ |
| ORM        | SQLAlchemy (async)                  | 2.0+      |
| Database   | SQLite (dev) / PostgreSQL (prod)    | —         |
| Migrations | Alembic                             | 1.x       |
| Auth       | JWT (python-jose) + bcrypt (passlib)| —         |
| HTTP Client| httpx (async)                       | 0.28+     |
| Rate Limit | slowapi                             | 0.1.9+    |
| Frontend   | Next.js (App Router)                | 16.1.6    |
| React      | React                               | 19.2.3    |
| CSS        | Tailwind CSS                        | 4.x       |
| Forms      | react-hook-form + zod               | 7.71 / 4.3 |
| Dates      | date-fns                            | 4.1       |
| Widget     | esbuild (standalone bundle)         | 0.27+     |
| Container  | Docker + Docker Compose             | —         |

## Multi-Tenant Architecture

Each request is scoped to a **tenant** resolved in this priority order:
1. Subdomain of the `Host` header (e.g. `acme.yourdomain.com` → slug `acme`)
2. `X-Tenant-ID` request header (used in dev/localhost and widget)
3. Fallback to the `default` tenant

**Frontend** sets `X-Tenant-ID` on every API call using a module-level variable in `frontend/lib/api.ts`:
- Set at login via `setTenantId(response.agent.tenant_id)`
- Restored on session load in `dashboard/layout.tsx`

**Backend** resolves tenant in `middleware/tenant.py` and injects it as a FastAPI dependency (`get_current_tenant`). All DB queries are scoped by `tenant_id`.

Tenant limits: `max_agents`, `max_chats_per_agent` enforced in agent creation and assignment.

## End-to-End Message Lifecycle

### WhatsApp Customer → Agent Dashboard

```
1. Customer sends WhatsApp message
2. Meta Cloud API sends POST /webhook to backend
3. Backend verifies HMAC-SHA256 signature
4. Returns 200 immediately, processes in BackgroundTasks
5. parse_incoming_webhook() extracts message events
6. identify_sender() determines: customer or agent?
7. Customer path:
   a. Find/create Conversation (channel='whatsapp')
   b. auto_assign() to least-loaded online agent
   c. Send welcome/away message via Meta API
   d. Save Message to DB
   e. Broadcast 'conversation:new' + 'message:new' via WebSocket
      — includes last_message field for sidebar preview
8. Agent's dashboard receives WS event → AppContext updates → UI re-renders
```

### Agent Dashboard → WhatsApp Customer

```
1. Agent types message in ReplyBar component
2. POST /api/v1/conversations/{id}/messages
3. Backend checks channel:
   - If WhatsApp + agent has personal WA connected → send via agent's phone
   - If WhatsApp + no personal WA → send via company phone (settings.WHATSAPP_COMPANY_PHONE_NUMBER_ID)
   - If web_widget → no WA send needed
4. wa_service.send_text_message() calls Meta Graph API
5. Save Message to DB (with wa_message_id for tracking)
6. Broadcast 'message:new' via WebSocket to all agents
7. Agent sees message appear in ChatPanel
```

### Web Widget → Agent Dashboard

```
1. Customer opens widget on website
2. Widget JS sends POST /api/v1/widget/conversations (x-api-key auth)
3. Backend creates Conversation (channel='web_widget') + first Message
4. auto_assign() routes to available agent
5. Broadcasts 'conversation:new' via WebSocket
6. Customer polls GET /api/v1/widget/conversations/{id}/messages?since=...
7. Agent replies via dashboard → message saved → customer sees on next poll
```

## Project Structure

```
WHATSAPP/
├── .env.example              # All environment variables documented
├── .env                      # Local overrides (gitignored)
├── README.md                 # Quick start guide
├── SKILL.md                  # THIS FILE — project-wide knowledge
├── docker-compose.yml        # Dev/prod Docker Compose (PostgreSQL + backend + frontend)
├── docker-compose.prod.yml   # Production overrides
├── test.html                 # Widget test page
│
├── nginx/                    # Nginx reverse proxy config (prod)
│
├── backend/                  # Python/FastAPI backend
│   ├── SKILL.md              # Backend-specific agent knowledge
│   ├── main.py               # Entry point — app factory, seed, WS
│   ├── config.py             # pydantic-settings
│   ├── database.py           # Async engine + session + Base
│   ├── requirements.txt      # Python dependencies
│   ├── support.db            # SQLite database (dev only)
│   ├── Dockerfile            # Backend container
│   ├── alembic.ini           # Alembic config
│   ├── alembic/              # Migration scripts
│   ├── middleware/
│   │   ├── auth.py           # JWT + API key + admin guards
│   │   └── tenant.py         # Tenant resolution middleware
│   ├── models/               # 6 ORM models (Agent, Tenant, Conversation, Message, Setting, CannedResponse)
│   ├── routers/              # 7 routers (auth, agents, conversations, admin, widget, webhook, superadmin)
│   ├── services/             # whatsapp_service, conversation_service, websocket_manager
│   └── tests/                # pytest test suite (41 tests)
│
├── frontend/                 # Next.js 16 dashboard
│   ├── SKILL.md              # Frontend-specific agent knowledge
│   ├── package.json          # npm dependencies + scripts
│   ├── app/                  # App Router pages (5 routes)
│   ├── components/           # 11 UI components
│   ├── context/AppContext.tsx # Global state (useReducer)
│   ├── lib/                  # api.ts, types.ts, websocket.ts
│   └── widget/               # Embeddable chat widget source
│
└── public/                   # Static assets (widget.js output)
```

## External Services & APIs

| Service             | Purpose                                       | Config                          |
|---------------------|-----------------------------------------------|---------------------------------|
| Meta WhatsApp Cloud API | Send/receive WhatsApp messages            | `WHATSAPP_TOKEN`, `WHATSAPP_COMPANY_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET` |
| Meta Graph API (v18.0)  | Phone registration, OTP verification      | Same token as above             |
| PostgreSQL (prod)       | Primary database                          | `DATABASE_URL` (asyncpg)        |
| SQLite (dev)            | Local development database                | `DATABASE_URL` (aiosqlite)      |

## Docker Deployment

### Start all services (dev)
```bash
docker-compose up -d
```

### Rebuild after code changes
```bash
docker-compose build backend
docker-compose up -d backend
```

### View logs
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Run migrations manually
```bash
docker-compose exec backend alembic upgrade head
```

### Stop and remove
```bash
docker-compose down
docker-compose down -v   # also removes volumes (destroys DB data)
```

The backend container runs: `alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000`
Alembic migrations run automatically on every container start.

## Local Dev Setup (Step by Step)

### 1. Backend
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate          # Windows
pip install -r requirements.txt
# Copy ../.env.example to .env and configure
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
First boot auto-creates tables and seeds admin user (`admin@example.com` / `admin123`).

### 2. Frontend
```bash
cd frontend
npm install
npm run dev                      # Starts on http://localhost:3000
```

### 3. Widget (optional)
```bash
cd frontend
node widget/build.js             # Outputs public/widget.js
# Open test.html in browser to test
```

### 4. WhatsApp Integration (optional)
1. Create Meta Developer App → add WhatsApp product.
2. Get System User Token, Phone Number ID, Business Account ID, App Secret.
3. Set in `.env`.
4. Configure webhook: `https://your-domain.com/webhook` with verify token matching `WHATSAPP_VERIFY_TOKEN`.

## All Environment Variables

| Variable                            | Layer    | Required | Example                              |
|-------------------------------------|----------|----------|--------------------------------------|
| `DATABASE_URL`                      | Backend  | Yes      | `sqlite+aiosqlite:///./support.db` (dev) / `postgresql+asyncpg://user:pass@db/dbname` (prod) |
| `JWT_SECRET`                        | Backend  | Yes      | Random 64-char hex string           |
| `JWT_ALGORITHM`                     | Backend  | No       | `HS256`                              |
| `JWT_EXPIRY_HOURS`                  | Backend  | No       | `24`                                 |
| `CORS_ORIGINS`                      | Backend  | No       | `http://localhost:3000`              |
| `WHATSAPP_TOKEN`                    | Backend  | No*      | Meta System User permanent token    |
| `WHATSAPP_COMPANY_PHONE_NUMBER_ID`  | Backend  | No*      | Meta Phone Number ID (numeric, e.g. `123456789012345`) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID`      | Backend  | No*      | Meta WABA ID                        |
| `WHATSAPP_APP_SECRET`               | Backend  | No*      | Meta App Secret                     |
| `WHATSAPP_VERIFY_TOKEN`             | Backend  | No       | `my-verify-token`                    |
| `WHATSAPP_API_VERSION`              | Backend  | No       | `v18.0`                              |
| `POSTGRES_USER`                     | Docker   | Prod     | `support`                            |
| `POSTGRES_PASSWORD`                 | Docker   | Prod     | Strong random password               |
| `POSTGRES_DB`                       | Docker   | Prod     | `supportdb`                          |
| `NEXT_PUBLIC_API_URL`               | Frontend | Yes      | `http://localhost:8000`              |
| `NEXT_PUBLIC_WS_URL`                | Frontend | Yes      | `ws://localhost:8000/ws`             |

\* Required only if WhatsApp integration is enabled.

## NPM Scripts (frontend/package.json)

| Script          | Command          | Purpose                          |
|-----------------|------------------|----------------------------------|
| `dev`           | `next dev`       | Start Next.js dev server (3000)  |
| `build`         | `next build`     | Production build                 |
| `start`         | `next start`     | Start prod server                |

## Quick-Reference Cheat Sheet

```bash
# Docker: start everything
docker-compose up -d

# Docker: rebuild backend after code change
docker-compose build backend && docker-compose up -d backend

# Start backend (local dev)
cd backend && .\venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Start frontend (local dev)
cd frontend && npm run dev

# Default admin login
Email: admin@example.com
Password: admin123

# API health check
curl http://localhost:8000/health

# Test login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'

# Build widget
cd frontend && node widget/build.js

# Run backend tests
cd backend && pytest tests/ -v
```

## Known Patterns & Pitfalls

### 1. DateTime Timezone — CRITICAL
All `DateTime` ORM columns are **timezone-naive** (no `timezone=True`). PostgreSQL with asyncpg will raise `DataError: can't subtract offset-naive and offset-aware datetimes` if you write a timezone-aware datetime.

**Always strip tzinfo when writing to DB:**
```python
# WRONG — causes DataError on PostgreSQL
datetime.now(timezone.utc)

# CORRECT — use everywhere when writing to DateTime columns
datetime.now(timezone.utc).replace(tzinfo=None)
```
This applies to: `webhook.py`, `conversation_service.py`, `conversations.py`, `agents.py`.

### 2. WhatsApp Personal Connect — Phone Number ID, not Phone Number
When an agent connects their personal WhatsApp via `POST /api/v1/agents/{id}/wa/connect/initiate`, the `phone_number` field must be the **Meta Phone Number ID** (a long numeric string like `123456789012345`) from the Meta Business Manager — **not** the actual phone number like `+14155552671`.

### 3. WebSocket Auth Flow
```
1. Client calls GET /api/v1/auth/ws-ticket  (sends JWT cookie)
2. Backend returns {"ticket": "<60-second token>"}
3. Client connects to ws://host/ws
4. Client immediately sends: {"type": "auth", "ticket": "<token>"}
5. Backend confirms: {"type": "auth_ok"}
```
WS ticket expires in 60 seconds. If WS auth fails, client gets `{"type": "auth_error"}` and should re-fetch ticket.

### 4. Webhook Background Processing
Meta requires 200 OK within 20 seconds. Backend returns 200 immediately and processes in `BackgroundTasks`. All DB writes in the background task must succeed — if they fail (e.g. timezone error), the task silently swallows the exception and no message is saved. **Always check `docker-compose logs -f backend` for `ERROR:routers.webhook:` lines when messages aren't appearing.**

### 5. Tenant Resolution in Dev
In localhost, there's no subdomain, so tenant is resolved from the `X-Tenant-ID` header. The frontend sets this header automatically after login via `setTenantId()` in `lib/api.ts`. If you test API endpoints directly (curl/Postman), add `-H "X-Tenant-ID: <tenant_id>"`.

### 6. Missing Import Pattern
`backend/routers/conversations.py` uses `settings.WHATSAPP_COMPANY_PHONE_NUMBER_ID`. Always ensure `from config import settings` is present at the top of any router that references it.

## Audit Findings Summary

### Top 5 Architectural Strengths

1. **Clean separation**: Backend (Python/FastAPI) and Frontend (Next.js) are fully independent with a well-defined REST + WS contract.
2. **Real-time first**: WebSocket events cover all state changes — conversation lifecycle, messages, agent status, queue count — enabling instant dashboard updates.
3. **Dual-channel support**: Both WhatsApp and web widget channels use the same conversation/message models, simplifying the codebase.
4. **Auto-assignment algorithm**: Least-loaded-agent routing with configurable `max_chats` per agent and a toggleable `auto_assign` setting.
5. **Agent personal WhatsApp**: Agents can connect their own WhatsApp number for mobile replies that sync back to the dashboard.

### Bugs Found and Fixed (Session History)

| Bug | Symptom | Root Cause | Fix |
|-----|---------|------------|-----|
| **Webhook silent failure** | Messages never appear in dashboard despite 200 OK | `datetime.now(timezone.utc)` (aware) written to naive `DateTime` columns → PostgreSQL `DataError` in background task | Replace all with `.replace(tzinfo=None)` in webhook.py, conversation_service.py, conversations.py, agents.py |
| **Agent reply crashes** | Agents couldn't send messages | `settings.WHATSAPP_COMPANY_PHONE_NUMBER_ID` used without `from config import settings` import | Added missing import to conversations.py |
| **Sidebar never updates** | Conversation list shows "No messages yet" after live messages | `_conv_dict()` didn't include `last_message` field; WS broadcasts didn't pass message content | Added `last_message` param to `_conv_dict`, passed at all broadcast sites |
| **Resolve never sends WA** | Resolved conversations didn't send closing message to WhatsApp | `ConversationService.resolve()` called without `tenant=` kwarg | Pass `tenant=tenant` in resolve call |
| **WhatsApp Connect broken** | Connect modal asked for phone number, API needs phone_number_id | UI label/placeholder wrong; field semantics mismatched | Updated modal label to "Phone Number ID" with correct placeholder |
| **Multi-tenant header missing** | All API calls hit wrong tenant in dev | Frontend never sent `X-Tenant-ID` header | Added module-level `_tenantId` tracking in `api.ts`, set on login + session restore |
