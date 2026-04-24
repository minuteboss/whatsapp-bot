'use client';

import { useEffect, useState, useCallback } from 'react';
import { subtenantApi } from '@/lib/api';

export default function SubTenantsPage() {
  const [subtenants, setSubtenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editSubtenant, setEditSubtenant] = useState<any | null>(null);
  const [manageSubtenant, setManageSubtenant] = useState<any | null>(null);
  const [formData, setFormData] = useState({ name: '', slug: '', max_agents: 5 });

  const loadSubtenants = useCallback(async () => {
    try { setSubtenants(await subtenantApi.list()); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSubtenants(); }, [loadSubtenants]);

  const generateSlug = (name: string) => {
    let base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!base) return '';
    let slug = base, c = 1;
    while (subtenants.some(s => s.slug === slug)) { slug = `${base}-${c}`; c++; }
    return slug;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await subtenantApi.create(formData);
      setShowCreateModal(false);
      setFormData({ name: '', slug: '', max_agents: 5 });
      loadSubtenants();
    } catch {}
  };

  const handleUpdate = async (id: string, data: any) => {
    try { await subtenantApi.update(id, data); setEditSubtenant(null); loadSubtenants(); } catch {}
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Deactivate "${name}"? This will free the slug.`)) return;
    try { await subtenantApi.delete(id); loadSubtenants(); } catch {}
  };

  const filtered = subtenants.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) || s.slug.toLowerCase().includes(search.toLowerCase())
  );
  const activeCount = subtenants.filter(s => s.is_active).length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>Sub-Accounts</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Manage your reseller network and their agent provisioning.</p>
          </div>
          <button onClick={() => setShowCreateModal(true)} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md cursor-pointer" style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Create Sub-Account
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Accounts', value: subtenants.length, icon: '🏢' },
          { label: 'Active', value: activeCount, icon: '✅' },
          { label: 'Inactive', value: subtenants.length - activeCount, icon: '⏸️' },
          { label: 'Agent Capacity', value: subtenants.reduce((a: number, s: any) => a + (s.max_agents || 0), 0), icon: '👥' },
        ].map((s, i) => (
          <div key={i} className="p-4 border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{s.label}</span>
              <span className="text-base">{s.icon}</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 text-sm border outline-none" style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
        </div>
        <span className="text-xs font-medium px-3 py-1.5 border" style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-7 h-7 border-2 border-t-transparent animate-spin rounded-full" style={{ borderColor: 'var(--color-primary)' }}></div></div>
      ) : (
        <div className="border overflow-x-auto" style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_120px_100px_100px_180px] gap-4 px-5 py-3 text-[10px] font-bold uppercase tracking-wider border-b" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)', background: 'var(--color-surface-alt)' }}>
            <span>Account</span><span>Max Agents</span><span>Status</span><span>Created</span><span className="text-right">Actions</span>
          </div>
          {/* Rows */}
          {filtered.map((sub) => (
            <div key={sub.id} className="grid grid-cols-[1fr_120px_100px_100px_180px] gap-4 px-5 py-3.5 items-center border-b transition-colors hover:bg-slate-50/50" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{sub.name}</p>
                <code className="text-[10px] font-mono" style={{ color: 'var(--color-primary)' }}>{sub.slug}</code>
              </div>
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{sub.max_agents || 5}</span>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: sub.is_active ? 'var(--color-accent-green)' : 'var(--color-danger)' }}></span>
                <span style={{ color: sub.is_active ? 'var(--color-accent-green)' : 'var(--color-danger)' }}>{sub.is_active ? 'Active' : 'Inactive'}</span>
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{new Date(sub.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <div className="flex items-center justify-end gap-1">
                <button onClick={() => setManageSubtenant(sub)} className="px-3 py-1.5 text-xs font-semibold text-white cursor-pointer transition-all hover:opacity-90" style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>Manage</button>
                <button onClick={() => setEditSubtenant(sub)} className="px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors hover:bg-slate-50" style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}>Edit</button>
                <button onClick={() => handleDelete(sub.id, sub.name)} className="px-2 py-1.5 text-xs cursor-pointer transition-colors hover:bg-red-50 rounded" style={{ color: 'var(--color-danger)' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>{search ? 'No accounts match your search.' : 'No sub-accounts yet. Create your first one.'}</p>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && <CreateModal formData={formData} setFormData={(d: any) => setFormData(d)} onSubmit={handleCreate} onClose={() => setShowCreateModal(false)} onNameChange={(name: string) => setFormData({ ...formData, name, slug: generateSlug(name) })} />}
      {editSubtenant && <EditModal subtenant={editSubtenant} onClose={() => setEditSubtenant(null)} onSave={(data: any) => handleUpdate(editSubtenant.id, data)} />}
      {manageSubtenant && manageSubtenant.id && <ManageModal subtenant={manageSubtenant} onClose={() => setManageSubtenant(null)} />}
    </div>
  );
}

/* ── Modal Shell ────────────────────────────────────────── */
function ModalShell({ title, subtitle, onClose, children, width = 'max-w-lg' }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; width?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className={`w-full ${width} shadow-xl animate-slide-up max-h-[90vh] overflow-y-auto`} style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)' }}>
        <div className="flex items-start justify-between p-6 pb-0">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{title}</h2>
            {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 -m-1.5 cursor-pointer rounded-full hover:bg-black/5 transition-colors" style={{ color: 'var(--color-text-muted)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

/* ── Create Modal ───────────────────────────────────────── */
function CreateModal({ formData, setFormData, onSubmit, onClose, onNameChange }: any) {
  return (
    <ModalShell title="Create Sub-Account" subtitle="Provision a new reseller account" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FieldGroup label="Account Name"><input type="text" required autoFocus placeholder="e.g. Acme Corp" value={formData.name} onChange={e => onNameChange(e.target.value)} className="field-input" style={fieldStyle} /></FieldGroup>
        <FieldGroup label="Unique Slug"><input type="text" required value={formData.slug} onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} className="field-input font-mono" style={fieldStyle} /></FieldGroup>
        <FieldGroup label="Max Agents"><input type="number" required min="1" value={formData.max_agents || ''} onChange={e => setFormData({ ...formData, max_agents: parseInt(e.target.value) || 0 })} className="field-input" style={fieldStyle} /></FieldGroup>
        <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
          <button type="submit" className="px-5 py-2 text-sm font-semibold text-white cursor-pointer transition-all hover:opacity-90" style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>Create Account</button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ── Edit Modal ─────────────────────────────────────────── */
function EditModal({ subtenant, onClose, onSave }: { subtenant: any; onClose: () => void; onSave: (d: any) => void }) {
  const [fd, setFd] = useState({ name: subtenant.name || '', max_agents: subtenant.max_agents || 5, is_active: subtenant.is_active ?? true });
  return (
    <ModalShell title="Edit Sub-Account" subtitle={subtenant.slug} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); onSave(fd); }} className="space-y-4">
        <FieldGroup label="Account Name"><input type="text" required value={fd.name} onChange={e => setFd({ ...fd, name: e.target.value })} className="field-input" style={fieldStyle} /></FieldGroup>
        <FieldGroup label="Max Agents"><input type="number" required min="1" value={fd.max_agents || ''} onChange={e => setFd({ ...fd, max_agents: parseInt(e.target.value) || 0 })} className="field-input" style={fieldStyle} /></FieldGroup>
        <div className="flex items-center gap-3 p-3" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
          <input type="checkbox" id="active_edit" checked={fd.is_active} onChange={e => setFd({ ...fd, is_active: e.target.checked })} className="w-4 h-4 accent-blue-600" />
          <label htmlFor="active_edit" className="text-sm font-medium cursor-pointer" style={{ color: 'var(--color-text)' }}>Account Active</label>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
          <button type="submit" className="px-5 py-2 text-sm font-semibold text-white cursor-pointer transition-all hover:opacity-90" style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>Save Changes</button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ── Manage Modal ───────────────────────────────────────── */
function ManageModal({ subtenant, onClose }: { subtenant: any; onClose: () => void }) {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editAgent, setEditAgent] = useState<any | null>(null);
  const [newAgent, setNewAgent] = useState({ name: '', email: '', password: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { setAgents(await subtenantApi.listAgents(subtenant.id)); } catch {} finally { setLoading(false); }
  }, [subtenant.id]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await subtenantApi.createAgent(subtenant.id, newAgent); setShowAdd(false); setNewAgent({ name: '', email: '', password: '' }); load(); } catch {}
  };

  const handleUpdate = async (id: string, data: any) => {
    try { await subtenantApi.updateAgent(subtenant.id, id, data); setEditAgent(null); load(); } catch {}
  };

  const handleDeleteAgent = async (id: string, name: string) => {
    if (!confirm(`Remove agent "${name}"?`)) return;
    try { await subtenantApi.deleteAgent(subtenant.id, id); load(); } catch {}
  };

  const handleImpersonate = async (agentId: string) => {
    try { await subtenantApi.impersonate(subtenant.id, agentId); window.location.href = '/dashboard'; } catch {}
  };

  return (
    <ModalShell title={subtenant.name} subtitle={`${subtenant.slug} · ${agents.length}/${subtenant.max_agents || 5} agents provisioned`} onClose={onClose} width="max-w-2xl">
      {/* Agent Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Agents</h3>
        <button onClick={() => setShowAdd(true)} disabled={agents.length >= (subtenant.max_agents || 5)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90" style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Agent
        </button>
      </div>

      {/* Capacity Bar */}
      <div className="mb-5">
        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--color-surface-alt)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((agents.length / (subtenant.max_agents || 5)) * 100, 100)}%`, background: agents.length >= (subtenant.max_agents || 5) ? 'var(--color-danger)' : 'var(--color-primary)' }}></div>
        </div>
      </div>

      {/* Agent List */}
      {loading ? (
        <div className="py-12 text-center"><div className="inline-block w-6 h-6 border-2 border-t-transparent animate-spin rounded-full" style={{ borderColor: 'var(--color-primary)' }}></div></div>
      ) : (
        <div className="space-y-2">
          {agents.map(a => (
            <div key={a.id} className="flex items-center justify-between p-3 border transition-colors" style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--color-primary)' }}>{a.name?.charAt(0)}</div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{a.name}</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{a.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setEditAgent(a)} className="px-2.5 py-1 text-[11px] font-medium border cursor-pointer transition-colors hover:bg-slate-50" style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}>Edit</button>
                <button onClick={() => handleDeleteAgent(a.id, a.name)} className="px-2.5 py-1 text-[11px] font-medium cursor-pointer transition-colors hover:bg-red-50" style={{ color: 'var(--color-danger)', borderRadius: 'var(--radius-sm)' }}>Remove</button>
                <button onClick={() => handleImpersonate(a.id)} className="px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer transition-all hover:opacity-90" style={{ background: 'var(--color-text)', borderRadius: 'var(--radius-sm)' }}>Login As</button>
              </div>
            </div>
          ))}
          {agents.length === 0 && <div className="py-12 text-center text-xs border-2 border-dashed" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)' }}>No agents provisioned yet.</div>}
        </div>
      )}

      {/* Add Agent Form */}
      {showAdd && (
        <div className="mt-5 p-4 border-2" style={{ borderColor: 'var(--color-primary)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)' }}>
          <h4 className="text-xs font-bold uppercase mb-3" style={{ color: 'var(--color-text)' }}>New Agent</h4>
          <form onSubmit={handleCreate} className="grid grid-cols-3 gap-3">
            <input type="text" placeholder="Full Name" required value={newAgent.name} onChange={e => setNewAgent({...newAgent, name: e.target.value})} className="field-input text-xs" style={fieldStyle} />
            <input type="email" placeholder="Email" required value={newAgent.email} onChange={e => setNewAgent({...newAgent, email: e.target.value})} className="field-input text-xs" style={fieldStyle} />
            <input type="password" placeholder="Password" required value={newAgent.password} onChange={e => setNewAgent({...newAgent, password: e.target.value})} className="field-input text-xs" style={fieldStyle} />
            <div className="col-span-3 flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>Cancel</button>
              <button type="submit" className="px-4 py-1.5 text-xs font-semibold text-white cursor-pointer" style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>Create</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Agent Form */}
      {editAgent && (
        <div className="mt-5 p-4 border-2" style={{ borderColor: 'var(--color-primary)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)' }}>
          <h4 className="text-xs font-bold uppercase mb-3" style={{ color: 'var(--color-text)' }}>Edit: {editAgent.name}</h4>
          <form onSubmit={e => { e.preventDefault(); handleUpdate(editAgent.id, editAgent); }} className="grid grid-cols-3 gap-3">
            <input type="text" required value={editAgent.name} onChange={e => setEditAgent({...editAgent, name: e.target.value})} className="field-input text-xs" style={fieldStyle} />
            <input type="email" required value={editAgent.email} onChange={e => setEditAgent({...editAgent, email: e.target.value})} className="field-input text-xs" style={fieldStyle} />
            <input type="password" placeholder="New password (optional)" value={editAgent.password || ''} onChange={e => setEditAgent({...editAgent, password: e.target.value})} className="field-input text-xs" style={fieldStyle} />
            <div className="col-span-3 flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditAgent(null)} className="px-3 py-1.5 text-xs cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>Cancel</button>
              <button type="submit" className="px-4 py-1.5 text-xs font-semibold text-white cursor-pointer" style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>Update</button>
            </div>
          </form>
        </div>
      )}
    </ModalShell>
  );
}

/* ── Shared ──────────────────────────────────────────────── */
const fieldStyle: React.CSSProperties = { borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' };

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}

import React from 'react';
