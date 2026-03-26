/**
 * Typed fetch wrapper for API calls.
 * Auth is handled via httpOnly cookies (credentials: 'include').
 * No token parameter needed — the browser sends the cookie automatically.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Module-level tenant ID — set after login/me() so every request carries X-Tenant-ID
let _tenantId: string | null = null;
export function setTenantId(id: string | null) { _tenantId = id; }

interface ApiOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  apiKey?: string;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T = any>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, apiKey } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (_tenantId) {
    requestHeaders['x-tenant-id'] = _tenantId;
  }

  if (apiKey) {
    requestHeaders['x-api-key'] = apiKey;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new ApiError(errorData.detail || 'Request failed', res.status);
  }

  return res.json();
}

// ── Auth ────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    apiFetch('/api/v1/auth/login', { method: 'POST', body: { email, password } }),
  me: () =>
    apiFetch('/api/v1/auth/me'),
  logout: () =>
    apiFetch('/api/v1/auth/logout', { method: 'POST' }),
  wsTicket: () =>
    apiFetch<{ ticket: string }>('/api/v1/auth/ws-ticket', { method: 'POST' }),
};

// ── Agents ──────────────────────────────────────────────────
export const agentApi = {
  list: () =>
    apiFetch('/api/v1/agents'),
  create: (data: any) =>
    apiFetch('/api/v1/agents', { method: 'POST', body: data }),
  update: (id: string, data: any) =>
    apiFetch(`/api/v1/agents/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) =>
    apiFetch(`/api/v1/agents/${id}`, { method: 'DELETE' }),
  waConnect: (id: string, phoneNumberId: string) =>
    apiFetch(`/api/v1/agents/${id}/wa/connect/initiate`, { method: 'POST', body: { phone_number_id: phoneNumberId } }),
  waDisconnect: (id: string) =>
    apiFetch(`/api/v1/agents/${id}/wa/connect`, { method: 'DELETE' }),
};

// ── Conversations ───────────────────────────────────────────
export const conversationApi = {
  list: (params: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/api/v1/conversations?${query}`);
  },
  get: (id: string, limit?: number, before?: string) => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (before) params.set('before', before);
    const query = params.toString();
    return apiFetch(`/api/v1/conversations/${id}${query ? `?${query}` : ''}`);
  },
  sendMessage: (id: string, content: string) =>
    apiFetch(`/api/v1/conversations/${id}/messages`, { method: 'POST', body: { content } }),
  accept: (id: string) =>
    apiFetch(`/api/v1/conversations/${id}/accept`, { method: 'POST' }),
  assign: (id: string, agentId: string) =>
    apiFetch(`/api/v1/conversations/${id}/assign`, { method: 'POST', body: { agent_id: agentId } }),
  transfer: (id: string, toAgentId: string, note: string | null) =>
    apiFetch(`/api/v1/conversations/${id}/transfer`, { method: 'POST', body: { to_agent_id: toAgentId, note } }),
  resolve: (id: string) =>
    apiFetch(`/api/v1/conversations/${id}/resolve`, { method: 'POST' }),
  reopen: (id: string) =>
    apiFetch(`/api/v1/conversations/${id}/reopen`, { method: 'POST' }),
};

// ── Admin ───────────────────────────────────────────────────
export const adminApi = {
  stats: () =>
    apiFetch('/api/v1/admin/stats'),
  getSettings: () =>
    apiFetch<Array<{ key: string; value: string }>>('/api/v1/admin/settings'),
  updateSettings: (data: Record<string, string>) =>
    apiFetch('/api/v1/admin/settings', { method: 'POST', body: data }),
  listCanned: () =>
    apiFetch('/api/v1/admin/canned'),
  createCanned: (data: any) =>
    apiFetch('/api/v1/admin/canned', { method: 'POST', body: data }),
  deleteCanned: (id: string) =>
    apiFetch(`/api/v1/admin/canned/${id}`, { method: 'DELETE' }),
  waRequestCode: (phoneNumberId: string, method: 'SMS' | 'VOICE' = 'SMS') =>
    apiFetch('/api/v1/admin/wa/request-code', { method: 'POST', body: { phone_number_id: phoneNumberId, method } }),
  waVerifyCode: (phoneNumberId: string, code: string) =>
    apiFetch('/api/v1/admin/wa/verify-code', { method: 'POST', body: { phone_number_id: phoneNumberId, code } }),
};

// ── Superadmin ───────────────────────────────────────────────
export const superadminApi = {
  listTenants: () =>
    apiFetch('/api/superadmin/tenants'),
  createTenant: (data: any) =>
    apiFetch('/api/superadmin/tenants', { method: 'POST', body: data }),
  updateTenant: (id: string, data: any) =>
    apiFetch(`/api/superadmin/tenants/${id}`, { method: 'PATCH', body: data }),
  deleteTenant: (id: string) =>
    apiFetch(`/api/superadmin/tenants/${id}`, { method: 'DELETE' }),
  tenantStats: (id: string) =>
    apiFetch(`/api/superadmin/tenants/${id}/stats`),
  rotateWidgetKey: (id: string) =>
    apiFetch(`/api/superadmin/tenants/${id}/rotate-widget-key`, { method: 'POST' }),
  rotateApiKey: (id: string) =>
    apiFetch(`/api/superadmin/tenants/${id}/rotate-api-key`, { method: 'POST' }),
  // Tenant-scoped agent management
  listTenantAgents: (tenantId: string) =>
    apiFetch(`/api/superadmin/tenants/${tenantId}/agents`),
  createTenantAgent: (tenantId: string, data: any) =>
    apiFetch(`/api/superadmin/tenants/${tenantId}/agents`, { method: 'POST', body: data }),
  updateTenantAgent: (tenantId: string, agentId: string, data: any) =>
    apiFetch(`/api/superadmin/tenants/${tenantId}/agents/${agentId}`, { method: 'PATCH', body: data }),
  deleteTenantAgent: (tenantId: string, agentId: string) =>
    apiFetch(`/api/superadmin/tenants/${tenantId}/agents/${agentId}`, { method: 'DELETE' }),
  // Cross-tenant conversations
  listConversations: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/superadmin/conversations${qs ? `?${qs}` : ''}`);
  },
};

// ── Integration (admin views own tenant keys) ────────────────
export const integrationApi = {
  get: () =>
    apiFetch('/api/v1/admin/integration'),
  getUsage: () =>
    apiFetch('/api/v1/admin/usage'),
  rotateWidgetKey: () =>
    apiFetch('/api/v1/admin/rotate-widget-key', { method: 'POST' }),
  rotateApiKey: () =>
    apiFetch('/api/v1/admin/rotate-api-key', { method: 'POST' }),
  savePhone: (phoneNumberId: string) =>
    apiFetch('/api/v1/admin/wa/save-phone', { method: 'POST', body: { phone_number_id: phoneNumberId } }),
  updateCanned: (id: string, data: any) =>
    apiFetch(`/api/v1/admin/canned/${id}`, { method: 'PATCH', body: data }),
};

export { ApiError };
export default apiFetch;
