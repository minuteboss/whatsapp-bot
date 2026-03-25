# WhatsApp Multi-Agent Support Platform — v3.0

A production-ready, **multi-tenant** customer support platform with dual-channel messaging (WhatsApp + Web Widget), real-time agent dashboard, and comprehensive admin controls.

---

## ✨ What's New in v3.0

| Feature | Description |
|---------|-------------|
| 🏢 **Multi-Tenancy** | Full tenant isolation with per-tenant data, configs, and WhatsApp credentials |
| 🔒 **httpOnly Cookie Auth** | Secure JWT via httpOnly cookies (replaces client-side token storage) |
| 🎫 **WebSocket Tickets** | Short-lived tickets for secure WS connections |
| 📄 **Cursor Pagination** | Efficient message loading for long conversations |
| 📎 **Media Download** | WhatsApp media (images, docs) downloaded and served locally |
| 🗄️ **Alembic Migrations** | Production database schema management |
| 👑 **Superadmin** | Tenant management API + role-based access control |
| 🎨 **Light Theme UI** | Professional redesign with design tokens and blue primary |

---

## 🏗 Architecture

```
┌─────────────────────┐        ┌──────────────────────┐
│   Customer Phone    │        │   Customer Browser    │
│   (WhatsApp App)    │        │   (Chat Widget)       │
└────────┬────────────┘        └──────────┬────────────┘
         │                                │
    Meta Cloud API                   POST /api/v1/widget/*
    (webhook POST)                   (tenant API key)
         │                                │
         ▼                                ▼
┌────────────────────────────────────────────────────────┐
│                 BACKEND (FastAPI 0.115+)                │
│     Python 3.11+ │ SQLAlchemy 2.0 │ Alembic            │
│                                                        │
│  /webhook           ← Meta WhatsApp Cloud API          │
│  /api/v1/auth       ← httpOnly cookie login + WS ticket│
│  /api/v1/agents     ← Agent CRUD (tenant-scoped)       │
│  /api/v1/conversations ← Chat + cursor pagination      │
│  /api/v1/widget     ← Public widget (tenant API key)   │
│  /api/v1/admin      ← Settings, stats, canned          │
│  /api/v1/superadmin ← Tenant management                │
│  /ws                ← WebSocket (ticket-based auth)     │
│                                                        │
│  DB: SQLite (dev) / PostgreSQL (prod)                  │
└──────────────┬──────────────────┬──────────────────────┘
               │                  │
          REST API           WebSocket
          (Cookie)           (Ticket)
               │                  │
               ▼                  ▼
┌────────────────────────────────────────────────────────┐
│              FRONTEND (Next.js 16 + React 19)          │
│     Tailwind CSS 4 │ Light Theme │ Design Tokens       │
│                                                        │
│  /login             ← Agent login (cookie-based)       │
│  /dashboard         ← Real-time chat view              │
│  /dashboard/admin   ← Admin settings panel             │
│  /dashboard/profile ← Agent profile + WA connect       │
└────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
WHATSAPP/
├── backend/                  # FastAPI (Python 3.11+)
│   ├── alembic/              # Database migrations (PostgreSQL prod)
│   ├── middleware/
│   │   ├── auth.py           # httpOnly cookie JWT, WS tickets, RBAC
│   │   └── tenant.py         # Tenant resolution (subdomain → header → default)
│   ├── models/               # SQLAlchemy 2.0 ORM (7 models, all tenant-scoped)
│   ├── routers/              # 7 API routers (auth, agents, conversations, widget, admin, webhook, superadmin)
│   ├── schemas/              # Pydantic validation
│   ├── services/             # WhatsApp service, conversation service, WS manager
│   ├── tests/                # pytest test suite
│   └── main.py               # Entry point (lifespan, seed, WS endpoint)
├── frontend/                 # Next.js 16 (App Router)
│   ├── app/                  # 5 routes (login, dashboard, admin, profile)
│   ├── components/           # 11 UI components (light theme)
│   ├── context/              # Global state (useReducer, cookie-based auth)
│   ├── lib/                  # api.ts, types.ts, websocket.ts
│   └── widget/               # Embeddable chat widget (esbuild)
├── nginx/                    # Reverse proxy config
├── docker-compose.yml        # Development containers
├── docker-compose.prod.yml   # Production containers
└── SKILL.md                  # Project-wide agent knowledge
```

---

## 🚀 Quick Start (Development)

### Prerequisites
- Python 3.11+
- Node.js 20+
- npm 10+

### 1. Backend
```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt

# Create .env from template
cp ../.env.example .env
# Edit .env with your settings

# Start server (auto-creates SQLite DB + seeds admin + default tenant)
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
# Dashboard at http://localhost:3000
```

### 3. Widget (optional)
```bash
cd frontend
node widget/build.js
# Open ../test-widget.html in browser to test
```

### 4. Docker (optional)
```bash
docker-compose up --build
# Backend: http://localhost:8000
# Frontend: http://localhost:3000
```

---

## 🔐 Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@example.com` | `admin123` |
| Superadmin | `superadmin@system.local` | `superadmin123` |

> ⚠️ Change these immediately in production!

---

## 🌐 Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `sqlite+aiosqlite:///./support.db` | Database connection string |
| `JWT_SECRET` | Yes | _(auto-generated)_ | Secret for JWT signing. **Must be random in production** |
| `JWT_EXPIRY_HOURS` | No | `24` | Token expiration time |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Comma-separated allowed origins |
| `WHATSAPP_TOKEN` | No* | — | Meta System User permanent token |
| `WHATSAPP_COMPANY_PHONE_NUMBER_ID` | No* | — | Meta Phone Number ID |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | No* | — | Meta WABA ID |
| `WHATSAPP_APP_SECRET` | No* | — | Meta App Secret (HMAC verification) |
| `WHATSAPP_VERIFY_TOKEN` | No | `my-verify-token` | Webhook verification token |
| `RATE_LIMIT_API` | No | `500/15minutes` | API rate limit |
| `RATE_LIMIT_AUTH` | No | `20/minute` | Auth endpoint rate limit |

\* Required only if WhatsApp integration is enabled. Can also be configured per-tenant via Superadmin API.

### Frontend (`frontend/.env.local`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:8000` | Backend REST API URL |
| `NEXT_PUBLIC_WS_URL` | Yes | `ws://localhost:8000/ws` | Backend WebSocket URL |

---

## 📱 WhatsApp Integration

1. Create a **Meta Developer App** (Business type)
2. Add the **WhatsApp** product
3. Obtain credentials:
   - Permanent System User Token → `WHATSAPP_TOKEN`
   - Phone Number ID → `WHATSAPP_COMPANY_PHONE_NUMBER_ID`
   - Business Account ID → `WHATSAPP_BUSINESS_ACCOUNT_ID`
   - App Secret → `WHATSAPP_APP_SECRET`
4. Configure webhook:
   - **Callback URL**: `https://your-domain.com/webhook`
   - **Verify Token**: matches `WHATSAPP_VERIFY_TOKEN`
   - **Events**: Subscribe to `messages`
5. Configure in `.env` or per-tenant via Superadmin API

---

## 📎 Embedding the Chat Widget

```html
<script>
  window.WA_WIDGET_API_URL = 'https://your-api.com';
  window.WA_WIDGET_API_KEY = 'your-tenant-widget-api-key';
</script>
<script src="https://your-cdn.com/widget.js"></script>
```

---

## 🏢 Multi-Tenancy

Each tenant gets:
- Isolated data (conversations, messages, agents, settings, canned responses)
- Own widget API key
- Optional per-tenant WhatsApp credentials (falls back to global env vars)
- Configurable agent limits and plan tier

**Tenant resolution** (in order):
1. Subdomain extraction (e.g., `acme.your-domain.com`)
2. `X-Tenant-ID` header
3. Default tenant (for local development)

---

## 🧪 Running Tests

### Backend
```bash
cd backend
pip install pytest pytest-asyncio httpx
python -m pytest tests/ -v
```

### Frontend Build Verification
```bash
cd frontend
npm run build
```

---

## 🐳 Production Deployment

```bash
# Build and start with Docker Compose
docker-compose -f docker-compose.prod.yml up -d --build

# Run database migrations
docker-compose exec backend alembic upgrade head
```

> **Important**: Set a strong `JWT_SECRET` environment variable in production. The app will refuse to start with the default secret.

---

## 📊 API Quick Reference

| Category | Endpoint | Auth |
|----------|----------|------|
| Login | `POST /api/v1/auth/login` | None |
| Session | `GET /api/v1/auth/me` | Cookie |
| WS Ticket | `POST /api/v1/auth/ws-ticket` | Cookie |
| Conversations | `GET /api/v1/conversations` | Cookie |
| Send Message | `POST /api/v1/conversations/{id}/messages` | Cookie |
| Agents | `GET /api/v1/agents` | Cookie |
| Admin Settings | `GET/POST /api/v1/admin/settings` | Admin |
| Tenants | `GET/POST /api/v1/superadmin/tenants` | Superadmin |
| Widget | `POST /api/v1/widget/conversations` | API Key |
| Webhook | `POST /webhook` | HMAC-SHA256 |
| Health | `GET /health` | None |
| WebSocket | `WS /ws` | Ticket |

---

*Built with FastAPI + Next.js + Meta WhatsApp Cloud API*
*MinuteBossTech · minutebosstech.co.ke · Nairobi, Kenya*
