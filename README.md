# WhatsApp Multi-Agent Customer Support System — v2.0

A production-ready, end-to-end multi-agent support platform. Customers can chat via a website widget or direct WhatsApp. Agents handle everything from a unified dashboard or their personal WhatsApp accounts.

---

## ⚡ Key Features
*   **Dual Inbound Channels**: Website Chat Widget & Company WhatsApp Business Number.
*   **Dual Reply Paths**: Dashboard Web Dashboard & Personal Agent WhatsApp.
*   **Auto-Assignment**: Intelligent routing to the least-loaded online agent.
*   **Real-time Communication**: WebSocket-powered dashboard for instantaneous updates.
*   **Meta Integration**: Full flow for agents to connect/verify personal phone numbers.
*   **Canned Responses**: Quick slash-command shortcuts for common replies.
*   **Admin Control**: Manage settings, team members, and system behavior.

---

## 🏗 Project Structure
```bash
WHATSAPP/
├── backend/            # FastAPI (Python 3.11+)
│   ├── alembic/        # DB Migrations
│   ├── middleware/     # Auth & Permissions
│   ├── models/         # SQLAlchemy 2.0 ORM
│   ├── routers/        # API Endpoints
│   ├── schemas/        # Pydantic Validation
│   ├── services/       # Business Logic & Integrations
│   └── main.py         # Entry Point
├── frontend/           # Next.js 14+ (Dashboard)
│   ├── app/            # App Router Pages
│   ├── components/     # UI Components
│   ├── context/        # Global App State
│   ├── lib/            # API & WebSocket Clients
│   └── widget/         # Standalone Chat Widget Source
└── test-widget.html    # Widget Verification Page
```

---

## 🚀 Quick Start (Development)

### 1. Backend Setup
1. `cd backend`
2. Install dependencies: `pip install -r requirements.txt`
3. Configure `.env`: Copy from `.env.example` in the root.
4. Run migrations: `alembic upgrade head` (automatically handled on first boot by `main.py`).
5. Start server: `python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload`

### 2. Frontend Setup
1. `cd frontend`
2. Install dependencies: `npm install`
3. Run dev server: `npm run dev` (Access at `http://localhost:3000`)
4. **Build Widget**: `node widget/build.js` (Produces `public/widget.js`)

---

## 📱 WhatsApp Integration Setup
To enable WhatsApp features (Company Number + Agent Linking):
1. Create a Meta Developer App (Business Type).
2. Add the **WhatsApp** product.
3. Obtain your `Permanent System User Token`, `Phone Number ID`, and `Business Account ID`.
4. Configure these in your backend `.env`.
5. Set up the Webhook:
    *   **Callback URL**: `https://your-domain.com/webhook`
    *   **Verify Token**: Matches `WHATSAPP_VERIFY_TOKEN` in env.
    *   **Events**: Subscribe to `messages`.

---

## 🛠 Admin Credentials
*   **Email**: `admin@example.com`
*   **Password**: `admin123`
*   Detailed seeding occurs on the first backend run.

---

## 📎 Embedding the Widget
Add this to any website:
```html
<script>
    window.WA_WIDGET_API_URL = 'http://localhost:8000';
    window.WA_WIDGET_API_KEY = 'YOUR_BUSINESS_API_KEY';
</script>
<script src="path/to/widget.js"></script>
```

---
*Created by Antigravity.*
