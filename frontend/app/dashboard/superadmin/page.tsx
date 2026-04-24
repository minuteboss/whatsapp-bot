'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { superadminApi, setTenantId } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  max_agents: number;
  max_chats_per_agent: number;
  whatsapp_configured: boolean;
  whatsapp_company_phone_number_id?: string;
  whatsapp_business_account_id?: string;
  widget_api_key?: string;
  api_key?: string;
  agent_count?: number;
  conversation_count?: number;
  package_id?: string | null;
  package_name?: string | null;
  billing_status?: string;
  billing_cycle?: string;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  created_at: string | null;
}

interface PkgType {
  id: string;
  name: string;
  slug: string;
  description?: string;
  max_agents: number;
  max_chats_per_agent: number;
  max_contacts: number;
  max_broadcasts_per_month: number;
  max_templates: number;
  has_widget: boolean;
  has_whatsapp: boolean;
  has_api_access: boolean;
  has_sub_tenants: boolean;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string | null;
}

interface TenantAgent {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  max_chats: number;
  wa_connected: boolean;
  tenant_id: string;
}

interface CrossConversation {
  id: string;
  status: string;
  channel: string;
  customer_name: string | null;
  customer_phone: string | null;
  tenant_id: string;
  tenant_name: string;
  assigned_agent_id: string | null;
  last_message_at: string | null;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────

function fmt(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Main ───────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const { state } = useApp();
  const [activeTab, setActiveTab] = useState<'tenants' | 'agents' | 'conversations' | 'packages'>('tenants');

  if (!state.agent || state.agent.role !== 'superadmin') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p style={{ color: 'var(--color-text-muted)' }}>Superadmin access required.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-10 overflow-y-auto animate-fade-in">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>Superadmin</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>System-wide management across all tenants.</p>
          </div>
          <div className="flex flex-nowrap overflow-x-auto p-1" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
            {(['tenants', 'packages', 'agents', 'conversations'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-4 py-2 text-sm font-semibold transition-all cursor-pointer capitalize flex-shrink-0 whitespace-nowrap"
                style={{
                  borderRadius: 'var(--radius-sm)',
                  background: activeTab === tab ? 'var(--color-surface)' : 'transparent',
                  color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  boxShadow: activeTab === tab ? 'var(--shadow-sm)' : 'none',
                }}>
                {tab}
              </button>
            ))}
          </div>
        </header>

        {activeTab === 'tenants' && <TenantsTab />}
        {activeTab === 'packages' && <PackagesTab />}
        {activeTab === 'agents' && <AgentsTab />}
        {activeTab === 'conversations' && <ConversationsTab />}
      </div>
    </div>
  );
}

// ── TenantsTab ─────────────────────────────────────────────────

function TenantsTab() {
  const router = useRouter();
  const { dispatch } = useApp();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [newTenantKey, setNewTenantKey] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ name: '', slug: '', max_agents: 5, max_chats_per_agent: 10 });
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [isSlugEdited, setIsSlugEdited] = useState(false);

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // remove non-alphanumeric except spaces and hyphens
      .trim()
      .replace(/[\s_-]+/g, '-')     // replace spaces and underscores with hyphens
      .replace(/^-+|-+$/g, '');     // remove leading/trailing hyphens
  };

  useEffect(() => {
    superadminApi.listTenants().then(setTenants).catch(console.error).finally(() => setIsLoading(false));
  }, []);

  const handleImpersonate = async (agentId: string) => {
    try {
      const res = await superadminApi.impersonate(agentId);
      dispatch({ type: 'SET_AGENT', agent: res.agent });
      setTenantId(res.agent.tenant_id);
      router.push('/dashboard');
    } catch (err: any) { alert(err.message); }
  };

  const handleToggle = async (tenant: Tenant) => {
    try {
      const updated = await superadminApi.updateTenant(tenant.id, { is_active: !tenant.is_active });
      setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, is_active: updated.is_active } : t));
    } catch (err) { console.error(err); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setIsCreating(true);
    try {
      const created = await superadminApi.createTenant(createForm);
      setTenants(prev => [created, ...prev]);
      setNewTenantKey(created.widget_api_key || null);
      setShowCreate(false);
      setCreateForm({ name: '', slug: '', max_agents: 5, max_chats_per_agent: 10 });
      setIsSlugEdited(false);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create tenant');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete tenant "${name}"? This cannot be undone and will delete all associated data.`)) return;
    try {
      await superadminApi.deleteTenant(id);
      setTenants(prev => prev.filter(t => t.id !== id));
    } catch (err) { console.error(err); }
  };

  const active = tenants.filter(t => t.is_active).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[{ label: 'Total Tenants', value: tenants.length }, { label: 'Active', value: active }, { label: 'Inactive', value: tenants.length - active }].map(s => (
          <div key={s.label} className="card p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* New key banner */}
      {newTenantKey && (
        <div className="card p-4 flex items-start justify-between space-x-4" style={{ borderLeft: '4px solid var(--color-primary)' }}>
          <div>
            <p className="text-xs font-bold mb-1" style={{ color: 'var(--color-text)' }}>Tenant created — save this widget API key now (shown only once):</p>
            <code className="text-xs font-mono" style={{ color: 'var(--color-primary)' }}>{newTenantKey}</code>
          </div>
          <button onClick={() => setNewTenantKey(null)} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* New Tenant button */}
      <div className="flex justify-end">
        <button onClick={() => setShowCreate(true)} className="flex items-center space-x-2 px-4 py-2 text-sm font-semibold text-white cursor-pointer"
          style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>New Tenant</span>
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="card animate-pulse h-40" />
      ) : (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse min-w-[700px]">
            <thead>
              <tr style={{ background: 'var(--color-surface-alt)' }}>
                {['Tenant', 'Slug', 'Package', 'Limits', 'Agents', 'WhatsApp', 'Status', ''].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map(tenant => (
                <tr key={tenant.id} className="transition-colors" style={{ borderTop: '1px solid var(--color-border-light)', opacity: tenant.is_active ? 1 : 0.55 }}>
                  <td className="py-3 px-4">
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{tenant.name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{tenant.id.slice(0, 8)}…</p>
                  </td>
                  <td className="py-3 px-4">
                    <code className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>{tenant.slug}</code>
                  </td>
                  <td className="py-3 px-4">
                    {tenant.package_name ? (
                      <div>
                        <span className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>{tenant.package_name}</span>
                        <span className={`block text-[9px] font-bold uppercase mt-0.5`} style={{
                          color: tenant.billing_status === 'active' ? 'var(--color-accent-green)'
                            : tenant.billing_status === 'trial' ? '#f59e0b'
                            : tenant.billing_status === 'suspended' ? '#ef4444'
                            : 'var(--color-text-muted)',
                        }}>{tenant.billing_status || 'trial'}</span>
                      </div>
                    ) : (
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>No package</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {tenant.max_agents} agents / {tenant.max_chats_per_agent} chats
                  </td>
                  <td className="py-3 px-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {tenant.agent_count ?? '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[10px] font-bold" style={{ color: tenant.whatsapp_configured ? '#25D366' : 'var(--color-text-muted)' }}>
                      {tenant.whatsapp_configured ? '✓ Yes' : '—'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                      background: tenant.is_active ? 'var(--color-accent-green-light)' : 'var(--color-surface-alt)',
                      color: tenant.is_active ? 'var(--color-accent-green)' : 'var(--color-text-muted)',
                    }}>
                      {tenant.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditTenant(tenant)} className="p-1.5 cursor-pointer" style={{ color: 'var(--color-primary)' }} title="Edit">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => handleToggle(tenant)} className="text-xs font-semibold cursor-pointer px-2 py-1 transition-colors" style={{
                        borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
                        color: tenant.is_active ? 'var(--color-danger)' : 'var(--color-primary)',
                      }}>
                        {tenant.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => handleDelete(tenant.id, tenant.name)} className="p-1.5 cursor-pointer opacity-40 hover:opacity-100 transition-opacity" style={{ color: 'var(--color-danger)' }} title="Delete">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tenants.length === 0 && (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>No tenants yet.</div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editTenant && (
        <TenantEditModal
          tenant={editTenant}
          onSave={(updated) => { setTenants(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t)); setEditTenant(null); }}
          onClose={() => setEditTenant(null)}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <SAModal title="New Tenant" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <SAInput label="Company Name" value={createForm.name} onChange={v => {
              setCreateForm(p => ({
                ...p,
                name: v,
                slug: isSlugEdited ? p.slug : slugify(v)
              }));
            }} required placeholder="Acme Inc." />
            <SAInput label="Slug (URL-safe)" value={createForm.slug} onChange={v => {
              setCreateForm(p => ({ ...p, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, '') }));
              setIsSlugEdited(true);
            }} required placeholder="acme" />
            <div className="grid grid-cols-2 gap-3">
              <SAInput label="Max Agents" type="number" value={String(createForm.max_agents)} onChange={v => setCreateForm(p => ({ ...p, max_agents: parseInt(v) || 1 }))} />
              <SAInput label="Max Chats/Agent" type="number" value={String(createForm.max_chats_per_agent)} onChange={v => setCreateForm(p => ({ ...p, max_chats_per_agent: parseInt(v) || 1 }))} />
            </div>
            {createError && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{createError}</p>}
            <button type="submit" disabled={isCreating} className="w-full py-2.5 text-white text-sm font-semibold cursor-pointer"
              style={{ background: isCreating ? 'var(--color-text-muted)' : 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>
              {isCreating ? 'Creating…' : 'Create Tenant'}
            </button>
          </form>
        </SAModal>
      )}
    </div>
  );
}

function TenantEditModal({ tenant, onSave, onClose }: { tenant: Tenant; onSave: (t: Partial<Tenant> & { id: string }) => void; onClose: () => void }) {
  const router = useRouter();
  const { dispatch } = useApp();
  const [form, setForm] = useState({
    name: tenant.name, slug: tenant.slug,
    max_agents: tenant.max_agents, max_chats_per_agent: tenant.max_chats_per_agent,
    is_active: tenant.is_active,
    whatsapp_company_phone_number_id: tenant.whatsapp_company_phone_number_id || '',
    whatsapp_token: '',
    whatsapp_business_account_id: tenant.whatsapp_business_account_id || '',
    whatsapp_app_secret: '',
    whatsapp_verify_token: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [rotating, setRotating] = useState<'widget' | 'api' | null>(null);
  const [newKey, setNewKey] = useState<{ label: string; value: string } | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const [agents, setAgents] = useState<TenantAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [resettingAgent, setResettingAgent] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  useEffect(() => {
    superadminApi.listTenantAgents(tenant.id)
      .then(setAgents)
      .catch(console.error)
      .finally(() => setLoadingAgents(false));
  }, [tenant.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      const payload: any = {
        name: form.name, slug: form.slug,
        max_agents: form.max_agents, max_chats_per_agent: form.max_chats_per_agent,
        is_active: form.is_active,
        whatsapp_company_phone_number_id: form.whatsapp_company_phone_number_id || null,
      };
      if (form.whatsapp_token) payload.whatsapp_token = form.whatsapp_token;
      if (form.whatsapp_business_account_id) payload.whatsapp_business_account_id = form.whatsapp_business_account_id;
      if (form.whatsapp_app_secret) payload.whatsapp_app_secret = form.whatsapp_app_secret;
      if (form.whatsapp_verify_token) payload.whatsapp_verify_token = form.whatsapp_verify_token;
      const updated = await superadminApi.updateTenant(tenant.id, payload);
      onSave({ id: tenant.id, ...updated });
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const rotate = async (type: 'widget' | 'api') => {
    if (!confirm(`Request a new ${type === 'widget' ? 'Widget' : 'API'} key? Your current key will be invalidated immediately.`)) return;
    setRotating(type);
    try {
      if (type === 'widget') {
        const res = await superadminApi.rotateWidgetKey(tenant.id);
        setNewKey({ label: 'New Widget Key', value: res.widget_key });
      } else {
        const res = await superadminApi.rotateApiKey(tenant.id);
        setNewKey({ label: 'New API Key', value: res.api_key });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRotating(null);
    }
  };

  const toggleSecret = (key: string) => setShowSecrets(p => ({ ...p, [key]: !p[key] }));

  return (
    <SAModal title={`Edit — ${tenant.name}`} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <SAInput label="Company Name" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} required />
        <SAInput label="Slug" value={form.slug} onChange={v => setForm(p => ({ ...p, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} required />
        <div className="grid grid-cols-2 gap-3">
          <SAInput label="Max Agents" type="number" value={String(form.max_agents)} onChange={v => setForm(p => ({ ...p, max_agents: parseInt(v) || 1 }))} />
          <SAInput label="Max Chats/Agent" type="number" value={String(form.max_chats_per_agent)} onChange={v => setForm(p => ({ ...p, max_chats_per_agent: parseInt(v) || 1 }))} />
        </div>
        <div className="flex items-center justify-between p-1">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Active</label>
          <button type="button" onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
            className="w-11 h-6 rounded-full p-0.5 transition-all cursor-pointer"
            style={{ background: form.is_active ? 'var(--color-primary)' : 'var(--color-border)' }}>
            <div className="w-5 h-5 rounded-full bg-white transition-all" style={{ transform: form.is_active ? 'translateX(20px)' : 'translateX(0)' }} />
          </button>
        </div>

        {/* Agent Management Section */}
        <div className="pt-4 space-y-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Active Agents</p>
            {!loadingAgents && !agents.some(a => a.role === 'admin') && (
              <button type="button" className="text-[10px] font-bold text-white px-2 py-1 rounded cursor-pointer"
                style={{ background: 'var(--color-primary)' }}
                onClick={async () => {
                   const email = `admin@${tenant.slug}.com`;
                   const name = `${tenant.name} Admin`;
                   const pass = Math.random().toString(36).slice(-8);
                   if (confirm(`Create a new admin agent for ${tenant.name}?\nEmail: ${email}\nPassword: ${pass}`)) {
                     try {
                       const created = await superadminApi.createTenantAgent(tenant.id, {
                         name, email, password: pass, role: 'admin', max_chats: 10
                       });
                       setAgents(p => [...p, created]);
                       alert("Admin created successfully!");
                     } catch(err: any) { alert(err.message); }
                   }
                }}>
                + Create Admin
              </button>
            )}
          </div>

          {loadingAgents ? (
            <div className="text-[10px] animate-pulse" style={{ color: 'var(--color-text-muted)' }}>Loading agents...</div>
          ) : (
            <div className="space-y-2">
              {agents.map(a => (
                <div key={a.id} className="p-2 border" style={{ borderRadius: 'var(--radius-sm)', borderColor: 'var(--color-border-light)', background: 'var(--color-surface-alt)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{a.name}</p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{a.email} ({a.role})</p>
                    </div>
                    <div className="flex gap-2">
                       <button type="button" className="text-[10px] font-bold underline cursor-pointer"
                        style={{ color: 'var(--color-primary)' }}
                        onClick={() => {
                          if (confirm(`Login as ${a.name}? Your current session will be switched.`)) {
                             superadminApi.impersonate(a.id).then(res => {
                               dispatch({ type: 'SET_AGENT', agent: res.agent });
                               setTenantId(res.agent.tenant_id);
                               router.push('/dashboard');
                             }).catch(err => alert(err.message));
                          }
                        }}>
                        Login as
                      </button>
                      <button type="button" className="text-[10px] font-bold underline cursor-pointer"
                        style={{ color: 'var(--color-text-muted)' }}
                        onClick={() => { setResettingAgent(resettingAgent === a.id ? null : a.id); setPwSuccess(null); }}>
                        {resettingAgent === a.id ? 'Cancel' : 'Reset'}
                      </button>
                    </div>
                  </div>
                  {resettingAgent === a.id && (
                    <div className="mt-2 flex gap-2">
                      <input type="password" placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        className="flex-1 px-2 py-1 text-xs border outline-none"
                        style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }} />
                      <button type="button" className="px-2 py-1 text-xs font-bold text-white rounded cursor-pointer"
                        style={{ background: 'var(--color-primary)' }}
                        onClick={async () => {
                          if (newPassword.length < 6) { alert('Min 6 characters'); return; }
                          try {
                            await superadminApi.updateTenantAgent(tenant.id, a.id, { password: newPassword });
                            setPwSuccess(a.id);
                            setResettingAgent(null);
                            setNewPassword('');
                            setTimeout(() => setPwSuccess(null), 3000);
                          } catch (err: any) { alert(err.message); }
                        }}>
                        Set
                      </button>
                    </div>
                  )}
                  {pwSuccess === a.id && <p className="mt-1 text-[10px]" style={{ color: 'var(--color-accent-green)' }}>Password updated!</p>}
                </div>
              ))}
              {agents.length === 0 && (
                <p className="text-[10px] italic" style={{ color: 'var(--color-text-muted)' }}>No agents found for this tenant.</p>
              )}
            </div>
          )}
        </div>

        {/* WhatsApp Configuration */}
        <div className="pt-4 space-y-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>WhatsApp Configuration</p>

          <SAInput label="Phone Number ID" value={form.whatsapp_company_phone_number_id}
            onChange={v => setForm(p => ({ ...p, whatsapp_company_phone_number_id: v }))}
            placeholder="e.g. 123456789012345" />

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>WhatsApp Token</label>
            <div className="flex gap-2">
              <input type={showSecrets.token ? 'text' : 'password'} value={form.whatsapp_token}
                onChange={e => setForm(p => ({ ...p, whatsapp_token: e.target.value }))}
                className="flex-1 px-3 py-2 text-sm border outline-none font-mono"
                style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                placeholder="Leave blank to keep current" />
              <button type="button" onClick={() => toggleSecret('token')} className="px-2 py-2 text-xs cursor-pointer"
                style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                {showSecrets.token ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <SAInput label="Business Account ID" value={form.whatsapp_business_account_id}
            onChange={v => setForm(p => ({ ...p, whatsapp_business_account_id: v }))}
            placeholder="WABA ID" />

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>App Secret</label>
            <div className="flex gap-2">
              <input type={showSecrets.secret ? 'text' : 'password'} value={form.whatsapp_app_secret}
                onChange={e => setForm(p => ({ ...p, whatsapp_app_secret: e.target.value }))}
                className="flex-1 px-3 py-2 text-sm border outline-none font-mono"
                style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                placeholder="Leave blank to keep current" />
              <button type="button" onClick={() => toggleSecret('secret')} className="px-2 py-2 text-xs cursor-pointer"
                style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                {showSecrets.secret ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <SAInput label="Verify Token" value={form.whatsapp_verify_token}
            onChange={v => setForm(p => ({ ...p, whatsapp_verify_token: v }))}
            placeholder="Webhook verify token" />
        </div>

        {error && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <button type="submit" disabled={isSaving} className="w-full py-2.5 text-white text-sm font-semibold cursor-pointer"
          style={{ background: isSaving ? 'var(--color-text-muted)' : 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>

      {/* Billing & Package Assignment */}
      <BillingSection tenant={tenant} onUpdate={(updated) => onSave({ id: tenant.id, ...updated })} />

      {/* Key rotation */}
      <div className="mt-6 pt-6 space-y-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Key Management</p>
        <div className="flex gap-2">
          <button onClick={() => rotate('widget')} disabled={rotating === 'widget'} className="flex-1 py-2 text-xs font-semibold cursor-pointer"
            style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', color: 'var(--color-primary)', opacity: rotating === 'widget' ? 0.5 : 1 }}>
            {rotating === 'widget' ? '…' : 'Request New Widget Key'}
          </button>
          <button onClick={() => rotate('api')} disabled={rotating === 'api'} className="flex-1 py-2 text-xs font-semibold cursor-pointer"
            style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', color: 'var(--color-primary)', opacity: rotating === 'api' ? 0.5 : 1 }}>
            {rotating === 'api' ? '…' : 'Request New API Key'}
          </button>
        </div>
        {newKey && (
          <div className="p-3 space-y-1" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
            <p className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>{newKey.label} — save this now:</p>
            <code className="text-xs font-mono break-all" style={{ color: 'var(--color-primary)' }}>{newKey.value}</code>
            <button onClick={() => setNewKey(null)} className="text-[10px] underline cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>Dismiss</button>
          </div>
        )}
      </div>
    </SAModal>
  );
}

// ── BillingSection (used inside TenantEditModal) ──────────────

function BillingSection({ tenant, onUpdate }: { tenant: Tenant; onUpdate: (t: any) => void }) {
  const [packages, setPackages] = useState<PkgType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPkg, setSelectedPkg] = useState(tenant.package_id || '');
  const [billingStatus, setBillingStatus] = useState(tenant.billing_status || 'trial');
  const [billingCycle, setBillingCycle] = useState(tenant.billing_cycle || 'monthly');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    superadminApi.listPackages().then(setPackages).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleAssign = async () => {
    setSaving(true);
    try {
      const updated = await superadminApi.assignPackage(tenant.id, {
        package_id: selectedPkg || null,
        billing_status: billingStatus,
        billing_cycle: billingCycle,
      });
      onUpdate(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to assign package');
    } finally {
      setSaving(false);
    }
  };

  const statusColors: Record<string, string> = {
    active: 'var(--color-accent-green)',
    trial: '#f59e0b',
    suspended: '#ef4444',
    cancelled: 'var(--color-text-muted)',
  };

  if (loading) return <div className="mt-6 pt-6 animate-pulse h-20" style={{ borderTop: '1px solid var(--color-border)' }} />;

  return (
    <div className="mt-6 pt-6 space-y-4" style={{ borderTop: '1px solid var(--color-border)' }}>
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Billing & Package</p>

      {/* Package selector */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Assigned Package</label>
        <select value={selectedPkg} onChange={e => setSelectedPkg(e.target.value)}
          className="w-full px-3 py-2 text-sm border outline-none cursor-pointer"
          style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
          <option value="">— No Package —</option>
          {packages.filter(p => p.is_active).map(p => (
            <option key={p.id} value={p.id}>{p.name} (${p.price_monthly}/mo)</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Billing Status */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Billing Status</label>
          <select value={billingStatus} onChange={e => setBillingStatus(e.target.value)}
            className="w-full px-3 py-2 text-sm border outline-none cursor-pointer"
            style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: statusColors[billingStatus] || 'var(--color-text)' }}>
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Billing Cycle */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Billing Cycle</label>
          <select value={billingCycle} onChange={e => setBillingCycle(e.target.value)}
            className="w-full px-3 py-2 text-sm border outline-none cursor-pointer"
            style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
      </div>

      <button type="button" onClick={handleAssign} disabled={saving}
        className="w-full py-2 text-sm font-semibold cursor-pointer"
        style={{
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-primary)',
          color: 'var(--color-primary)',
          background: 'var(--color-primary-light)',
          opacity: saving ? 0.5 : 1,
        }}>
        {saving ? 'Saving…' : 'Update Billing'}
      </button>
    </div>
  );
}

// ── AgentsTab ──────────────────────────────────────────────────

function AgentsTab() {
  const router = useRouter();
  const { dispatch } = useApp();
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [agents, setAgents] = useState<TenantAgent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editAgent, setEditAgent] = useState<TenantAgent | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'agent', max_chats: 5 });
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    superadminApi.listTenants().then(data => {
      setTenants(data.map((t: any) => ({ id: t.id, name: t.name })));
      if (data.length > 0) setSelectedTenant(data[0].id);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedTenant) return;
    setIsLoading(true);
    superadminApi.listTenantAgents(selectedTenant).then(setAgents).catch(console.error).finally(() => setIsLoading(false));
  }, [selectedTenant]);

  const handleDelete = async (agentId: string) => {
    if (!confirm('Delete this agent?')) return;
    try {
      await superadminApi.deleteTenantAgent(selectedTenant, agentId);
      setAgents(prev => prev.filter(a => a.id !== agentId));
    } catch (err) { console.error(err); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setIsCreating(true);
    try {
      const created = await superadminApi.createTenantAgent(selectedTenant, createForm);
      setAgents(prev => [created, ...prev]);
      setShowCreate(false);
      setCreateForm({ name: '', email: '', password: '', role: 'agent', max_chats: 5 });
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create agent');
    } finally {
      setIsCreating(false);
    }
  };

  const tenantName = tenants.find(t => t.id === selectedTenant)?.name || '';

  return (
    <div className="space-y-4">
      {/* Tenant selector */}
      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-xs">
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Select Tenant</label>
          <select value={selectedTenant} onChange={e => setSelectedTenant(e.target.value)}
            className="w-full px-3 py-2 text-sm border outline-none"
            style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center space-x-2 px-4 py-2 text-sm font-semibold text-white cursor-pointer mt-5"
          style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Add Agent</span>
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="h-40" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)' }} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(agent => (
            <div key={agent.id} className="card p-5">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0" style={{ background: 'var(--color-primary)' }}>
                  {agent.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm truncate" style={{ color: 'var(--color-text)' }}>{agent.name}</h4>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{agent.role}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => {
                    if (confirm(`Login as ${agent.name}?`)) {
                      superadminApi.impersonate(agent.id).then(res => {
                        dispatch({ type: 'SET_AGENT', agent: res.agent });
                        setTenantId(res.agent.tenant_id);
                        router.push('/dashboard');
                      }).catch(err => alert(err.message));
                    }
                  }} className="p-1 cursor-pointer" style={{ color: 'var(--color-primary)' }} title="Login as">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3 3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                  </button>
                  <button onClick={() => setEditAgent(agent)} className="p-1 cursor-pointer" style={{ color: 'var(--color-primary)' }} title="Edit">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(agent.id)} className="p-1 cursor-pointer opacity-40 hover:opacity-100 transition-opacity" style={{ color: 'var(--color-danger)' }} title="Delete">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-[11px]">
                <SARow label="Email" value={agent.email} />
                <SARow label="Max Chats" value={String(agent.max_chats)} />
                <SARow label="Status" value={<span className="capitalize" style={{ color: agent.status === 'online' ? '#22c55e' : 'var(--color-text-muted)' }}>{agent.status}</span>} />
              </div>
            </div>
          ))}
          {agents.length === 0 && !isLoading && (
            <div className="col-span-3 text-center py-12 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No agents for this tenant yet.
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editAgent && (
        <SAAgentEditModal
          agent={editAgent}
          tenantId={selectedTenant}
          onSave={(updated) => { setAgents(prev => prev.map(a => a.id === updated.id ? updated : a)); setEditAgent(null); }}
          onClose={() => setEditAgent(null)}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <SAModal title={`New Agent — ${tenantName}`} onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <SAInput label="Full Name" value={createForm.name} onChange={v => setCreateForm(p => ({ ...p, name: v }))} required />
            <SAInput label="Email" type="email" value={createForm.email} onChange={v => setCreateForm(p => ({ ...p, email: v }))} required />
            <SAInput label="Password" type="password" value={createForm.password} onChange={v => setCreateForm(p => ({ ...p, password: v }))} required />
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Role</label>
              <select value={createForm.role} onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))}
                className="w-full px-3 py-2 text-sm border outline-none"
                style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
                <option value="agent">Agent</option>
                <option value="support">Support</option>
                <option value="sales">Sales</option>
                <option value="developer">Developer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <SAInput label="Max Concurrent Chats" type="number" value={String(createForm.max_chats)} onChange={v => setCreateForm(p => ({ ...p, max_chats: parseInt(v) || 1 }))} />
            {createError && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{createError}</p>}
            <button type="submit" disabled={isCreating} className="w-full py-2.5 text-white text-sm font-semibold cursor-pointer"
              style={{ background: isCreating ? 'var(--color-text-muted)' : 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>
              {isCreating ? 'Creating…' : 'Create Agent'}
            </button>
          </form>
        </SAModal>
      )}
    </div>
  );
}

function SAAgentEditModal({ agent, tenantId, onSave, onClose }: {
  agent: TenantAgent; tenantId: string; onSave: (a: TenantAgent) => void; onClose: () => void;
}) {
  const router = useRouter();
  const { dispatch } = useApp();
  const [form, setForm] = useState({ name: agent.name, email: agent.email, role: agent.role, max_chats: agent.max_chats });
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      const updated = await superadminApi.updateTenantAgent(tenantId, agent.id, form);
      onSave({ ...agent, ...updated });
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!newPassword.trim() || newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    setIsSaving(true);
    setError('');
    try {
      await superadminApi.updateTenantAgent(tenantId, agent.id, { password: newPassword });
      setNewPassword('');
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SAModal title={`Edit — ${agent.name}`} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <SAInput label="Full Name" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} required />
        <SAInput label="Email" type="email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} required />
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Role</label>
          <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
            className="w-full px-3 py-2 text-sm border outline-none"
            style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <SAInput label="Max Concurrent Chats" type="number" value={String(form.max_chats)} onChange={v => setForm(p => ({ ...p, max_chats: parseInt(v) || 1 }))} />
        {error && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <button type="submit" disabled={isSaving} className="w-full py-2.5 text-white text-sm font-semibold cursor-pointer"
          style={{ background: isSaving ? 'var(--color-text-muted)' : 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
      <div className="mt-6 pt-6 space-y-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Reset Password</p>
        <div className="flex gap-2">
          <input type="password" placeholder="New password (min 6 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border outline-none"
            style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
          <button onClick={handlePasswordReset} disabled={isSaving || !newPassword.trim()} className="px-3 py-2 text-xs font-semibold cursor-pointer"
            style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            Reset
          </button>
        </div>
        {pwSuccess && <p className="text-xs" style={{ color: '#22c55e' }}>Password updated.</p>}
      </div>
    </SAModal>
  );
}

// ── ConversationsTab ───────────────────────────────────────────

function ConversationsTab() {
  const router = useRouter();
  const { dispatch } = useApp();
  const [conversations, setConversations] = useState<CrossConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tenantFilter, setTenantFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    superadminApi.listTenants().then(data => setTenants(data.map((t: any) => ({ id: t.id, name: t.name })))).catch(console.error);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    const params: Record<string, string> = { limit: '50' };
    if (tenantFilter) params.tenant_id = tenantFilter;
    if (statusFilter) params.status = statusFilter;
    superadminApi.listConversations(params).then(data => setConversations(data.conversations || data)).catch(console.error).finally(() => setIsLoading(false));
  }, [tenantFilter, statusFilter]);

  const statusColors: Record<string, string> = {
    pending: 'var(--color-warning)',
    active: 'var(--color-accent-green)',
    resolved: 'var(--color-text-muted)',
  };

  const handleOpen = (conv: CrossConversation) => {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', id: conv.id });
    router.push('/dashboard');
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Tenant</label>
          <select value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}
            className="px-3 py-2 text-sm border outline-none"
            style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
            <option value="">All Tenants</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border outline-none"
            style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="card animate-pulse h-48" />
      ) : (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr style={{ background: 'var(--color-surface-alt)' }}>
                {['Customer', 'Tenant', 'Channel', 'Status', 'Last Message', ''].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.isArray(conversations) && conversations.map(conv => (
                <tr key={conv.id} className="transition-colors" style={{ borderTop: '1px solid var(--color-border-light)' }}>
                  <td className="py-3 px-4">
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{conv.customer_name || 'Unknown'}</p>
                    {conv.customer_phone && <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{conv.customer_phone}</p>}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                      {conv.tenant_name || 'Unknown'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs capitalize" style={{ color: 'var(--color-text-secondary)' }}>
                    {conv.channel?.replace('_', ' ') || 'Unknown'}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[10px] font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusColors[conv.status] || 'var(--color-text-muted)' }} />
                      <span className="capitalize" style={{ color: statusColors[conv.status] || 'var(--color-text-muted)' }}>{conv.status}</span>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {fmt(conv.last_message_at || conv.created_at)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => handleOpen(conv)} className="text-xs font-semibold cursor-pointer px-3 py-1 transition-colors"
                      style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', color: 'var(--color-primary)' }}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {conversations.length === 0 && (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>No conversations found.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PackagesTab ────────────────────────────────────────────────

function PackagesTab() {
  const [packages, setPackages] = useState<PkgType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editPkg, setEditPkg] = useState<PkgType | null>(null);

  const defaultForm = {
    name: '', slug: '', description: '',
    max_agents: 5, max_chats_per_agent: 10, max_contacts: 500,
    max_broadcasts_per_month: 10, max_templates: 10,
    has_widget: true, has_whatsapp: true, has_api_access: false, has_sub_tenants: false,
    price_monthly: 0, price_yearly: 0, currency: 'USD', sort_order: 0,
  };
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    superadminApi.listPackages().then(setPackages).catch(console.error).finally(() => setIsLoading(false));
  }, []);

  const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s_-]+/g, '-');
  const [isSlugEdited, setIsSlugEdited] = useState(false);

  const openCreate = () => {
    setForm(defaultForm);
    setIsSlugEdited(false);
    setError('');
    setShowCreate(true);
    setEditPkg(null);
  };

  const openEdit = (p: PkgType) => {
    setForm({
      name: p.name, slug: p.slug, description: p.description || '',
      max_agents: p.max_agents, max_chats_per_agent: p.max_chats_per_agent,
      max_contacts: p.max_contacts, max_broadcasts_per_month: p.max_broadcasts_per_month,
      max_templates: p.max_templates,
      has_widget: p.has_widget, has_whatsapp: p.has_whatsapp,
      has_api_access: p.has_api_access, has_sub_tenants: p.has_sub_tenants,
      price_monthly: p.price_monthly, price_yearly: p.price_yearly,
      currency: p.currency, sort_order: p.sort_order,
    });
    setIsSlugEdited(true);
    setError('');
    setEditPkg(p);
    setShowCreate(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      if (editPkg) {
        const updated = await superadminApi.updatePackage(editPkg.id, form);
        setPackages(prev => prev.map(p => p.id === editPkg.id ? updated : p));
      } else {
        const created = await superadminApi.createPackage(form);
        setPackages(prev => [...prev, created]);
      }
      setShowCreate(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete package "${name}"? Tenants using it must be reassigned first.`)) return;
    try {
      await superadminApi.deletePackage(id);
      setPackages(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      alert(err.message || 'Cannot delete');
    }
  };

  const featureList = (p: PkgType) => {
    const items: string[] = [];
    items.push(`${p.max_agents} agents`);
    items.push(`${p.max_chats_per_agent} chats/agent`);
    items.push(`${p.max_contacts.toLocaleString()} contacts`);
    items.push(`${p.max_broadcasts_per_month} broadcasts/mo`);
    items.push(`${p.max_templates} templates`);
    if (p.has_widget) items.push('Web Widget');
    if (p.has_whatsapp) items.push('WhatsApp');
    if (p.has_api_access) items.push('API Access');
    if (p.has_sub_tenants) items.push('Sub-tenants');
    return items;
  };

  if (isLoading) return <div className="card animate-pulse h-48" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{packages.length} package(s)</p>
        <button onClick={openCreate} className="px-4 py-2 text-sm font-semibold text-white cursor-pointer"
          style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>
          + New Package
        </button>
      </div>

      {/* Package Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {packages.map(pkg => (
          <div key={pkg.id} className="card p-0 overflow-hidden flex flex-col" style={{ opacity: pkg.is_active ? 1 : 0.6 }}>
            {/* Header */}
            <div className="p-5 pb-3" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>{pkg.name}</h3>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>{pkg.slug}</span>
                </div>
                {!pkg.is_active && (
                  <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }}>Inactive</span>
                )}
              </div>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-2xl font-black" style={{ color: 'var(--color-primary)' }}>
                  {pkg.currency === 'USD' ? '$' : pkg.currency}{pkg.price_monthly.toLocaleString()}
                </span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>/mo</span>
                {pkg.price_yearly > 0 && (
                  <span className="text-[10px] ml-2" style={{ color: 'var(--color-text-muted)' }}>
                    ({pkg.currency === 'USD' ? '$' : pkg.currency}{pkg.price_yearly.toLocaleString()}/yr)
                  </span>
                )}
              </div>
              {pkg.description && <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{pkg.description}</p>}
            </div>

            {/* Features */}
            <div className="flex-1 p-5 pt-3 space-y-1.5">
              {featureList(pkg).map((feat, i) => (
                <div key={i} className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="var(--color-accent-green)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {feat}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="px-5 py-3 flex gap-2" style={{ borderTop: '1px solid var(--color-border-light)', background: 'var(--color-bg)' }}>
              <button onClick={() => openEdit(pkg)} className="flex-1 py-2 text-xs font-semibold cursor-pointer"
                style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', color: 'var(--color-primary)' }}>
                Edit
              </button>
              <button onClick={() => handleDelete(pkg.id, pkg.name)} className="py-2 px-3 text-xs font-semibold cursor-pointer"
                style={{ borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {packages.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No packages yet. Create your first billing package.</p>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <SAModal title={editPkg ? `Edit — ${editPkg.name}` : 'New Package'} onClose={() => setShowCreate(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            <SAInput label="Package Name" value={form.name} onChange={v => {
              setForm(p => ({ ...p, name: v, ...(isSlugEdited ? {} : { slug: slugify(v) }) }));
            }} required />
            <SAInput label="Slug" value={form.slug} onChange={v => { setIsSlugEdited(true); setForm(p => ({ ...p, slug: v })); }} required />
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Description</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2} className="w-full px-3 py-2 text-sm border outline-none resize-none"
                style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
            </div>

            <div className="pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-muted)' }}>Limits</p>
              <div className="grid grid-cols-2 gap-3">
                <SAInput label="Max Agents" type="number" value={String(form.max_agents)} onChange={v => setForm(p => ({ ...p, max_agents: parseInt(v) || 1 }))} />
                <SAInput label="Chats / Agent" type="number" value={String(form.max_chats_per_agent)} onChange={v => setForm(p => ({ ...p, max_chats_per_agent: parseInt(v) || 1 }))} />
                <SAInput label="Max Contacts" type="number" value={String(form.max_contacts)} onChange={v => setForm(p => ({ ...p, max_contacts: parseInt(v) || 0 }))} />
                <SAInput label="Broadcasts / Month" type="number" value={String(form.max_broadcasts_per_month)} onChange={v => setForm(p => ({ ...p, max_broadcasts_per_month: parseInt(v) || 0 }))} />
                <SAInput label="Max Templates" type="number" value={String(form.max_templates)} onChange={v => setForm(p => ({ ...p, max_templates: parseInt(v) || 0 }))} />
                <SAInput label="Sort Order" type="number" value={String(form.sort_order)} onChange={v => setForm(p => ({ ...p, sort_order: parseInt(v) || 0 }))} />
              </div>
            </div>

            <div className="pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-muted)' }}>Features</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'has_widget', label: 'Web Widget' },
                  { key: 'has_whatsapp', label: 'WhatsApp' },
                  { key: 'has_api_access', label: 'API Access' },
                  { key: 'has_sub_tenants', label: 'Sub-tenants' },
                ] as const).map(f => (
                  <label key={f.key} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    <input type="checkbox" checked={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.checked }))} />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-muted)' }}>Pricing (Display Only)</p>
              <div className="grid grid-cols-3 gap-3">
                <SAInput label="Monthly" type="number" value={String(form.price_monthly)} onChange={v => setForm(p => ({ ...p, price_monthly: parseFloat(v) || 0 }))} />
                <SAInput label="Yearly" type="number" value={String(form.price_yearly)} onChange={v => setForm(p => ({ ...p, price_yearly: parseFloat(v) || 0 }))} />
                <SAInput label="Currency" value={form.currency} onChange={v => setForm(p => ({ ...p, currency: v.toUpperCase().slice(0, 3) }))} />
              </div>
            </div>

            {error && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
            <button type="submit" disabled={isSaving} className="w-full py-2.5 text-white text-sm font-semibold cursor-pointer"
              style={{ background: isSaving ? 'var(--color-text-muted)' : 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>
              {isSaving ? 'Saving…' : editPkg ? 'Save Changes' : 'Create Package'}
            </button>
          </form>
        </SAModal>
      )}
    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────────

function SAModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xl)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>{title}</h2>
          <button onClick={onClose} className="cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SAInput({ label, value, onChange, type = 'text', required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border outline-none"
        style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
    </div>
  );
}

function SARow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] uppercase font-semibold" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span className="text-[10px] font-bold" style={{ color: 'var(--color-text-secondary)' }}>{value}</span>
    </div>
  );
}

