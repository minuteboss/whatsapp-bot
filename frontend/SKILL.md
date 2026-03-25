---
name: whatsapp-frontend
description: >
  Use this skill when working on the frontend of the WhatsApp Multi-Agent Support project.
  Trigger for any task involving the Next.js dashboard, React components, pages, routing,
  state management, WebSocket integration, API calls, the chat widget, styling, or any
  TypeScript/TSX code under the frontend/ directory. Always read this skill before modifying
  any page, component, context, or lib file in the frontend.
---

# WhatsApp Frontend — Agent Knowledge File

## Overview

The frontend is a **Next.js 16** (App Router) dashboard for support agents. It provides a real-time chat interface with conversation filtering, message sending (web + WhatsApp), cursor-based message pagination, agent profile management, admin controls (settings, team, canned responses), and a customer-facing embeddable chat widget. The UI uses **Tailwind CSS 4** with a **professional light theme** and CSS design tokens. Authentication uses **httpOnly cookies** — no client-side token storage.

## Architecture

- **Framework**: Next.js 16.1.6 with App Router (file-based routing in `app/`).
- **React**: v19.2.3 — all components are client-side (`'use client'`).
- **State Management**: `useReducer` + React Context (`AppContext`) — no Redux/Zustand.
- **Auth**: Cookie-based (`credentials: 'include'`). No client-side token storage. Session restored via `authApi.me()`.
- **Real-time**: Custom `useWebSocket` hook with ticket-based auth (fetches short-lived ticket via `authApi.wsTicket()`).
- **API Layer**: Typed `fetch` wrapper in `lib/api.ts` — namespaced exports (`authApi`, `agentApi`, `conversationApi`, `adminApi`).
- **Forms**: `react-hook-form` + `zod` validation (login page).
- **Styling**: Tailwind CSS 4 via `@tailwindcss/postcss`. Professional light theme with CSS custom properties (`--color-primary`, `--color-surface`, `--color-border`, etc.) defined in `globals.css`.
- **Design Tokens**: Primary blue (#2563EB), white surfaces, subtle shadows, refined borders. Card and hover utilities via `.card`, `.card-hover` classes.
- **Font**: Google Fonts Inter (loaded via `<link>` in layout).
- **Widget**: Standalone chat widget built separately (source in `widget/`, built via `node widget/build.js` → `public/widget.js`).

## Directory Structure

```
frontend/
├── app/
│   ├── layout.tsx               # Root layout — <html>, Inter font, AppProvider wrapper
│   ├── page.tsx                 # / → redirect to /dashboard
│   ├── globals.css              # Tailwind imports + light theme design tokens + card/animation utilities
│   ├── login/
│   │   └── page.tsx             # Login form (cookie-based auth, no token stored)
│   └── dashboard/
│       ├── layout.tsx           # Dashboard shell — Sidebar + WebSocket init (ticket-based) + InfoPanel
│       ├── page.tsx             # Main chat view — loads conversations, renders ChatPanel
│       ├── admin/
│       │   └── page.tsx         # Admin panel — Settings, Agents, Canned Replies tabs (superadmin supported)
│       └── profile/
│           └── page.tsx         # Agent profile + WhatsApp connect/disconnect
├── components/
│   ├── AgentStatusPill.tsx      # Online/away/offline status pill (click to cycle)
│   ├── CannedDropdown.tsx       # Slash-command canned response picker
│   ├── ChatPanel.tsx            # Active conversation view — header, messages, pagination, actions
│   ├── ConversationList.tsx     # Filtered conversation list items
│   ├── InfoPanel.tsx            # Right sidebar — customer details, transfer note
│   ├── MessageBubble.tsx        # Individual message — customer/agent/system styling + delivery ticks + media preview
│   ├── QueueBadge.tsx           # Pending count badge in sidebar
│   ├── ReplyBar.tsx             # Message composer — textarea, canned dropdown, send indicator
│   ├── Sidebar.tsx              # Left sidebar — logo, agent info, filters, conversation list, nav
│   ├── TransferModal.tsx        # Modal to select target agent for transfer
│   └── WhatsAppConnectModal.tsx # OTP flow for connecting personal WhatsApp
├── context/
│   └── AppContext.tsx           # useReducer store: agent, conversations, messages (with pagination),
│                                #   agents, cannedResponses, pendingCount, filter, wsConnected
├── lib/
│   ├── api.ts                   # fetch wrapper (credentials:'include') + authApi, agentApi, conversationApi, adminApi
│   ├── types.ts                 # Agent (incl. superadmin role), Conversation (incl. tenant_id),
│   │                            #   Message (incl. media_url), CannedResponse, Setting ([{key,value}]), Stats
│   └── websocket.ts             # useWebSocket hook — ticket-based auth, auto-reconnect, enabled flag
├── widget/                      # Chat widget source (esbuild-bundled)
│   └── build.js                 # Widget build script → public/widget.js
├── public/                      # Static assets (widget.js output, favicon)
├── package.json                 # Dependencies + scripts
└── tsconfig.json                # TypeScript config
```

## Page & Route Map

| Route                    | File                              | Purpose                             |
|--------------------------|-----------------------------------|-------------------------------------|
| `/`                      | `app/page.tsx`                    | Redirects to `/dashboard`           |
| `/login`                 | `app/login/page.tsx`              | Agent login form (cookie-based)     |
| `/dashboard`             | `app/dashboard/page.tsx`          | Main chat view (conversation list + chat panel) |
| `/dashboard/admin`       | `app/dashboard/admin/page.tsx`    | Admin settings, agents, canned replies |
| `/dashboard/profile`     | `app/dashboard/profile/page.tsx`  | Agent profile + WA integration      |

## State Management (AppContext)

The entire app state lives in `context/AppContext.tsx` using `useReducer`:

```typescript
interface AppState {
  agent: Agent | null;           // Current logged-in agent
  conversations: Conversation[]; // All loaded conversations
  activeConversationId: string | null;
  messages: Message[];           // Messages for the active conversation
  hasMoreMessages: boolean;      // Whether older messages can be loaded
  nextCursor: string | null;     // Cursor for loading older messages
  agents: Agent[];               // All agents (for transfer, admin)
  cannedResponses: CannedResponse[];
  pendingCount: number;          // Queue badge count
  filter: ConversationFilter;    // 'all' | 'queue' | 'mine' | 'resolved'
  wsConnected: boolean;
}
```

### Key Actions
| Action                    | Trigger                                      |
|---------------------------|----------------------------------------------|
| `SET_AGENT`               | Login success, session restore via me()       |
| `LOGOUT`                 | Logout                                        |
| `SET_CONVERSATIONS`      | Initial fetch on dashboard load               |
| `UPDATE_CONVERSATION`    | WS events: new, assigned, transferred, resolved |
| `SET_ACTIVE_CONVERSATION`| Click conversation in sidebar                 |
| `SET_MESSAGES`           | Fetch messages for active conv (with cursor)  |
| `PREPEND_MESSAGES`       | "Load older messages" button click            |
| `ADD_MESSAGE`            | WS `message:new` or `wa:reply_received`       |
| `UPDATE_MESSAGE_STATUS`  | WS `message:status` (delivery ticks)          |
| `SET_PENDING_COUNT`      | WS `queue:update`                             |
| `SET_FILTER`             | Sidebar filter buttons                        |

## API Client (`lib/api.ts`)

Base URL: `process.env.NEXT_PUBLIC_API_URL` (fallback: `http://localhost:8001`).

All calls use `credentials: 'include'` for httpOnly cookie auth. **No token parameters.**

- `authApi.login(email, password)` → `POST /api/v1/auth/login` (sets cookie)
- `authApi.me()` → `GET /api/v1/auth/me`
- `authApi.logout()` → `POST /api/v1/auth/logout` (clears cookie)
- `authApi.wsTicket()` → `POST /api/v1/auth/ws-ticket` (short-lived ticket for WS)
- `agentApi.list()` → `GET /api/v1/agents`
- `agentApi.create(data)` → `POST /api/v1/agents`
- `agentApi.update(id, data)` → `PATCH /api/v1/agents/{id}`
- `agentApi.waConnectInitiate(id, phone)` → `POST /api/v1/agents/{id}/wa/connect/initiate`
- `agentApi.waConnectVerify(id, code)` → `POST /api/v1/agents/{id}/wa/connect/verify`
- `agentApi.waDisconnect(id)` → `DELETE /api/v1/agents/{id}/wa/connect`
- `conversationApi.list(params)` → `GET /api/v1/conversations`
- `conversationApi.get(id, limit?, cursor?)` → `GET /api/v1/conversations/{id}` (cursor pagination)
- `conversationApi.sendMessage(id, content)` → `POST /api/v1/conversations/{id}/messages`
- `conversationApi.accept / assign / transfer / resolve / reopen`
- `adminApi.stats / getSettings / updateSettings / listCanned / createCanned / deleteCanned`

## WebSocket Integration (`lib/websocket.ts`)

URL: `process.env.NEXT_PUBLIC_WS_URL` (fallback: `ws://localhost:8001/ws`).

1. When `enabled` flag is true, connects to WS.
2. Fetches short-lived ticket via `authApi.wsTicket()`.
3. Sends `{ type: 'auth', ticket }` for authentication.
4. On `auth:success` → marks WS connected in context.
5. All incoming events routed to `handleWSEvent()` in `AppContext`.
6. Auto-reconnects after 3s on disconnect.
7. Exposes `sendTyping(conversationId)` for typing indicators.

## Auth Flow

1. User submits login form → `authApi.login()` → backend sets httpOnly cookie.
2. Dashboard layout calls `authApi.me()` to restore session → dispatches `SET_AGENT`.
3. If `me()` fails (no cookie/expired) → redirects to `/login`.
4. All API calls use `credentials: 'include'` — browser sends cookie automatically.
5. Logout: `authApi.logout()` → backend clears cookie → `LOGOUT` action resets state.

## Design System (Light Theme)

CSS custom properties defined in `globals.css`:

| Token                    | Value              | Usage                           |
|--------------------------|--------------------|---------------------------------|
| `--color-primary`        | `#2563EB`          | Primary blue for buttons, links |
| `--color-primary-light`  | `#EFF6FF`          | Light blue backgrounds          |
| `--color-surface`        | `#FFFFFF`          | Card/panel backgrounds          |
| `--color-surface-alt`    | `#F8FAFC`          | Section backgrounds             |
| `--color-bg`             | `#F1F5F9`          | Page background                 |
| `--color-text`           | `#0F172A`          | Primary text                    |
| `--color-text-secondary` | `#475569`          | Secondary text                  |
| `--color-text-muted`     | `#94A3B8`          | Muted/placeholder text          |
| `--color-border`         | `#E2E8F0`          | Borders                         |
| `--color-accent-green`   | `#16A34A`          | Online/success indicators       |
| `--color-warning`        | `#D97706`          | Warning badges                  |
| `--color-danger`         | `#DC2626`          | Error/danger indicators         |

Utility classes: `.card`, `.card-hover`, `.animate-fade-in`, `.animate-slide-up`, `.pulse-blue`.

## Key Conventions

- **All components use `'use client'`** — no server components.
- **Cookie-based auth** — no token parameters on any API call. Auth is handled by `credentials: 'include'`.
- **Light theme with design tokens** — all colors use CSS variables, no hardcoded dark-mode Tailwind classes.
- **`style={}` for design tokens** — components use inline `style` attributes for CSS variable references.
- **Date formatting**: `date-fns` (`formatDistanceToNow`, `format`).
- **Component naming**: PascalCase files matching export name. No barrel imports.
- **Pagination**: Messages use cursor-based pagination. `hasMoreMessages` + `nextCursor` in state.
- **Media preview**: MessageBubble renders `media_url` images when available.

## Common Tasks

### Add a new page
1. Create `app/dashboard/your-page/page.tsx` with `'use client'` directive.
2. Add navigation link in `components/Sidebar.tsx`.
3. Use `useApp()` hook to access state and dispatch.

### Add a new component
1. Create `components/YourComponent.tsx` with `'use client'`.
2. Use CSS variables via `style={{ color: 'var(--color-text)' }}` — don't use Tailwind color classes.
3. Access state via `const { state, dispatch } = useApp()`.

### Add a new API endpoint call
1. Add the function to the appropriate namespace in `lib/api.ts`.
2. Use `apiFetch<ReturnType>(endpoint, { method, body })` — no token parameter needed.

### Handle a new WebSocket event
1. Add a new case in `handleWSEvent()` inside `context/AppContext.tsx`.
2. Define a new action type and reducer case if state changes are needed.

## Environment & Config

| Variable               | Example                      | Purpose                     |
|------------------------|------------------------------|-----------------------------|
| `NEXT_PUBLIC_API_URL`  | `http://localhost:8000`      | Backend REST API base URL   |
| `NEXT_PUBLIC_WS_URL`   | `ws://localhost:8000/ws`     | Backend WebSocket URL       |

## Gotchas & Known Issues

- **Hardcoded fallback ports**: `api.ts` falls back to `http://localhost:8001` and `websocket.ts` falls back to `ws://localhost:8001/ws` — these must match the actual backend port.
- **No SSR/RSC usage**: Despite using Next.js App Router, all pages are client components. No server-side data fetching.
- **No error toast system**: Errors are logged to `console.error` — no user-facing error notifications.
- **Full page navigation for sidebar links**: Admin and Profile links use `window.location.href = ...` instead of Next.js `router.push()`.
- **Messages only for active conversation**: `ADD_MESSAGE` only appends if `message.conversation_id === activeConversationId`.
- **Widget built separately**: Must run `node widget/build.js` to update `public/widget.js` after changes to the widget source.
- **Admin access**: Admin page grants access to both `admin` and `superadmin` roles.
