'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { adminApi, agentApi, integrationApi } from '@/lib/api';
import { Agent, CannedResponse } from '@/lib/types';

// ── Types ──────────────────────────────────────────────────────

interface UsageData {
  plan: string;
  limits: { max_agents: number; max_chats_per_agent: number };
  usage: {
    agents_total: number;
    agents_online: number;
    conversations_active: number;
    conversations_today: number;
    messages_sent_today: number;
    messages_sent_month: number;
  };
  whatsapp: { configured: boolean; quality_rating?: string | null; messaging_limit_tier?: string | null; display_phone_number?: string | null } | null;
}

interface IntegrationData {
  widget_key: string;
  api_key: string;
  snippets: { js: string; iframe: string; curl: string };
}

// ── Helpers ────────────────────────────────────────────────────

function mask(key: string | null | undefined): string {
  if (!key) return '—';
  if (key.length <= 12) return key;
  return key.slice(0, 8) + '••••••••' + key.slice(-4);
}

const TIER_LABELS: Record<string, string> = {
  TIER_50: '50 / day', TIER_250: '250 / day', TIER_1K: '1,000 / day',
  TIER_10K: '10,000 / day', TIER_100K: '100,000 / day',
};
const QUALITY_COLORS: Record<string, string> = {
  GREEN: '#22c55e', YELLOW: '#f59e0b', RED: '#ef4444',
};

// ── Main page ──────────────────────────────────────────────────

export default function AdminPage() {
  const { state } = useApp();
  const [activeTab, setActiveTab] = useState<'settings' | 'agents' | 'canned' | 'whatsapp' | 'integration'>('settings');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [agents, setAgents] = useState<Agent[]>([]);
  const [canned, setCanned] = useState<CannedResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!state.agent || !['admin', 'superadmin'].includes(state.agent.role)) return;
      setIsLoading(true);
      try {
        const [settingsData, agentsData, cannedData] = await Promise.all([
          adminApi.getSettings(), agentApi.list(), adminApi.listCanned(),
        ]);
        const settingsObj: Record<string, string> = {};
        settingsData.forEach((s: any) => { settingsObj[s.key] = s.value; });
        setSettings(settingsObj);
        setAgents(agentsData);
        setCanned(cannedData);
      } catch (err) {
        console.error('Failed to fetch admin data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [state.agent]);

  if (!state.agent || !['admin', 'superadmin'].includes(state.agent.role)) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Access Denied</h2>
          <p style={{ color: 'var(--color-text-muted)' }}>You must be an administrator to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-10 overflow-y-auto animate-fade-in">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>Admin Settings</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>System configuration and team management.</p>
          </div>
          <div className="flex flex-nowrap overflow-x-auto gap-1 p-1" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
            {(['settings', 'agents', 'canned', 'whatsapp', 'integration'] as const).map(tab => (
              <TabButton key={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)}
                label={tab === 'integration' ? 'Integration' : tab === 'canned' ? 'Canned Replies' : tab.charAt(0).toUpperCase() + tab.slice(1)} />
            ))}
          </div>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-48" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)' }} />)}
          </div>
        ) : (
          <div className="animate-slide-up">
            {activeTab === 'settings' && <SettingsTab settings={settings} setSettings={setSettings} />}
            {activeTab === 'agents' && <AgentsTab agents={agents} setAgents={setAgents} currentAgentId={state.agent?.id} />}
            {activeTab === 'canned' && <CannedTab canned={canned} setCanned={setCanned} />}
            {activeTab === 'whatsapp' && <WhatsAppTab />}
            {activeTab === 'integration' && <IntegrationTab />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TabButton ──────────────────────────────────────────────────

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="px-4 py-2 text-sm font-semibold transition-all cursor-pointer flex-shrink-0 whitespace-nowrap" style={{
      borderRadius: 'var(--radius-sm)',
      background: active ? 'var(--color-surface)' : 'transparent',
      color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
      boxShadow: active ? 'var(--shadow-sm)' : 'none',
    }}>
      {label}
    </button>
  );
}

// ── SettingsTab ────────────────────────────────────────────────

function SettingsTab({ settings, setSettings }: { settings: Record<string, string>; setSettings: any }) {
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await adminApi.updateSettings(settings);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const set = (key: string, value: string) => setSettings((p: Record<string, string>) => ({ ...p, [key]: value }));
  const toggle = (key: string) => set(key, settings[key] === 'true' ? 'false' : 'true');

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
      {/* General */}
      <div className="card p-8 space-y-6">
        <SectionHeader color="var(--color-primary)" title="General Configuration" />
        <InputGroup label="Business Name" value={settings.business_name} onChange={v => set('business_name', v)} />
        <ToggleGroup label="Auto-Assign Conversations" value={settings.auto_assign === 'true'} onChange={() => toggle('auto_assign')} />
        <TextAreaGroup label="Welcome Message" value={settings.welcome_message} onChange={v => set('welcome_message', v)} />
        <TextAreaGroup label="Offline / Away Message" value={settings.away_message} onChange={v => set('away_message', v)} />
      </div>

      {/* Notifications */}
      <div className="card p-8 space-y-6">
        <SectionHeader color="#f59e0b" title="Notifications" />
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Control how agents are alerted when new messages arrive. Settings apply to your browser session.
        </p>
        <ToggleGroup label="Sound Alerts" value={settings.notifications_sound !== 'false'} onChange={() => toggle('notifications_sound')} />
        <ToggleGroup label="Browser Notifications" value={settings.notifications_browser !== 'false'} onChange={() => toggle('notifications_browser')} />
      </div>

      {/* Pre-chat Form */}
      <div className="card p-8 space-y-6">
        <SectionHeader color="#8b5cf6" title="Pre-chat Form (Starter Messages)" />
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Show a form to visitors before they start chatting, or when all agents are offline.
        </p>
        <ToggleGroup label="Enable Pre-chat Form" value={settings.starter_enabled === 'true'} onChange={() => toggle('starter_enabled')} />
        {settings.starter_enabled === 'true' && (
          <>
            <TextAreaGroup label="Greeting Message" value={settings.starter_greeting} onChange={v => set('starter_greeting', v)} />
            <StarterFieldsEditor
              value={settings.starter_fields}
              onChange={v => set('starter_fields', v)}
            />
          </>
        )}
        <ToggleGroup label="Collect Email When Offline" value={settings.offline_collect_email === 'true'} onChange={() => toggle('offline_collect_email')} />
      </div>

      <button type="submit" disabled={isSaving} className="w-full max-w-2xl py-2.5 text-white text-sm font-semibold transition-all cursor-pointer" style={{
        background: isSaving ? 'var(--color-text-muted)' : 'var(--color-primary)',
        borderRadius: 'var(--radius-sm)',
        boxShadow: isSaving ? 'none' : '0 2px 8px rgba(37, 99, 235, 0.3)',
      }}>
        {isSaving ? 'Saving...' : 'Save Configuration'}
      </button>
    </form>
  );
}

interface StarterField {
  label: string;
  key: string;
  required: boolean;
  type: 'text' | 'email' | 'phone' | 'select' | 'checkbox' | 'textarea' | 'radio';
  options?: string[];
  conditional?: Array<{ trigger_value: string; follow_up: StarterField }>;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'select', label: 'Dropdown' },
  { value: 'radio', label: 'Radio' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'textarea', label: 'Textarea' },
] as const;

function StarterFieldsEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  let fields: StarterField[] = [];
  try { fields = JSON.parse(value || '[]'); } catch { fields = []; }

  const update = (updated: StarterField[]) => onChange(JSON.stringify(updated));
  const add = () => update([...fields, { label: '', key: '', required: false, type: 'text', options: [], conditional: [] }]);
  const remove = (i: number) => update(fields.filter((_, idx) => idx !== i));
  const setField = (i: number, prop: string, val: any) => {
    const next = fields.map((f, idx) => idx === i ? { ...f, [prop]: val } : f);
    update(next);
  };

  const inputStyle = { borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', color: 'var(--color-text)' };

  return (
    <div className="space-y-3">
      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Form Fields</label>
      {fields.map((f, i) => (
        <div key={i} className="p-3 rounded space-y-2" style={{ background: 'var(--color-surface-alt)' }}>
          {/* Row 1: label, key, type, required, delete */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="flex-1 min-w-[120px] px-2 py-1 text-xs border outline-none"
              style={inputStyle}
              placeholder="Label (e.g. Name)"
              value={f.label}
              onChange={e => setField(i, 'label', e.target.value)}
            />
            <input
              className="w-24 px-2 py-1 text-xs border outline-none font-mono"
              style={inputStyle}
              placeholder="key"
              value={f.key}
              onChange={e => setField(i, 'key', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
            />
            <select
              className="px-2 py-1 text-xs border outline-none cursor-pointer"
              style={inputStyle}
              value={f.type}
              onChange={e => {
                const newType = e.target.value as StarterField['type'];
                setField(i, 'type', newType);
                if (!['select', 'radio'].includes(newType)) {
                  setField(i, 'options', []);
                  setField(i, 'conditional', []);
                }
              }}
            >
              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs cursor-pointer flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
              <input type="checkbox" checked={f.required} onChange={e => setField(i, 'required', e.target.checked)} />
              Req
            </label>
            <button type="button" onClick={() => remove(i)} className="flex-shrink-0 cursor-pointer" style={{ color: 'var(--color-danger)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Options editor for select/radio */}
          {(f.type === 'select' || f.type === 'radio') && (
            <div className="pl-3 space-y-1.5" style={{ borderLeft: '2px solid var(--color-border)' }}>
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Options</span>
              {(f.options || []).map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input
                    className="flex-1 px-2 py-1 text-xs border outline-none"
                    style={inputStyle}
                    placeholder={`Option ${oi + 1}`}
                    value={opt}
                    onChange={e => {
                      const newOpts = [...(f.options || [])];
                      newOpts[oi] = e.target.value;
                      setField(i, 'options', newOpts);
                    }}
                  />
                  <button type="button" className="text-[10px] cursor-pointer" style={{ color: 'var(--color-danger)' }}
                    onClick={() => {
                      const newOpts = (f.options || []).filter((_, idx) => idx !== oi);
                      setField(i, 'options', newOpts);
                      // Also remove conditionals referencing this option
                      const newCond = (f.conditional || []).filter(c => c.trigger_value !== opt);
                      setField(i, 'conditional', newCond);
                    }}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button"
                className="text-[10px] font-semibold px-2 py-1 cursor-pointer"
                style={{ color: 'var(--color-primary)', background: 'var(--color-primary-light)', borderRadius: 'var(--radius-sm)' }}
                onClick={() => setField(i, 'options', [...(f.options || []), ''])}>
                + Option
              </button>

              {/* Conditional follow-up builder */}
              {(f.options || []).filter(o => o.trim()).length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Conditional Follow-ups</span>
                  {(f.conditional || []).map((cond, ci) => (
                    <div key={ci} className="flex flex-wrap items-center gap-2 p-2 rounded" style={{ background: 'var(--color-bg)' }}>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>If</span>
                      <select className="px-1 py-0.5 text-[10px] border outline-none cursor-pointer" style={inputStyle}
                        value={cond.trigger_value}
                        onChange={e => {
                          const newCond = [...(f.conditional || [])];
                          newCond[ci] = { ...newCond[ci], trigger_value: e.target.value };
                          setField(i, 'conditional', newCond);
                        }}>
                        <option value="">Select...</option>
                        {(f.options || []).filter(o => o.trim()).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>then show:</span>
                      <input className="flex-1 min-w-[80px] px-1 py-0.5 text-[10px] border outline-none" style={inputStyle}
                        placeholder="Follow-up label"
                        value={cond.follow_up?.label || ''}
                        onChange={e => {
                          const newCond = [...(f.conditional || [])];
                          const key = (e.target.value || '').toLowerCase().replace(/\s+/g, '_');
                          newCond[ci] = { ...newCond[ci], follow_up: { ...newCond[ci].follow_up, label: e.target.value, key, type: newCond[ci].follow_up?.type || 'text', required: false } };
                          setField(i, 'conditional', newCond);
                        }}
                      />
                      <button type="button" className="text-[10px] cursor-pointer" style={{ color: 'var(--color-danger)' }}
                        onClick={() => {
                          const newCond = (f.conditional || []).filter((_, idx) => idx !== ci);
                          setField(i, 'conditional', newCond);
                        }}>
                        Remove
                      </button>
                    </div>
                  ))}
                  <button type="button"
                    className="text-[10px] font-semibold px-2 py-1 cursor-pointer"
                    style={{ color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', borderRadius: 'var(--radius-sm)' }}
                    onClick={() => setField(i, 'conditional', [...(f.conditional || []), { trigger_value: '', follow_up: { label: '', key: '', required: false, type: 'text' } }])}>
                    + Conditional
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs font-semibold px-3 py-1.5 cursor-pointer" style={{
        color: 'var(--color-primary)', background: 'var(--color-primary-light)', borderRadius: 'var(--radius-sm)',
      }}>
        + Add Field
      </button>
    </div>
  );
}

// ── AgentsTab ──────────────────────────────────────────────────

function AgentsTab({ agents, setAgents, currentAgentId }: { agents: Agent[]; setAgents: any; currentAgentId?: string }) {
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'agent' as 'admin' | 'agent', max_chats: 5 });
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    try {
      await agentApi.delete(id);
      setAgents((prev: Agent[]) => prev.filter((a: Agent) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete agent:', err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setIsCreating(true);
    try {
      const created = await agentApi.create(createForm);
      setAgents((prev: Agent[]) => [created, ...prev]);
      setShowCreate(false);
      setCreateForm({ name: '', email: '', password: '', role: 'agent', max_chats: 5 });
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create agent');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowCreate(true)} className="flex items-center space-x-2 px-4 py-2 text-sm font-semibold text-white cursor-pointer"
          style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>New Agent</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <div key={agent.id} className="card card-hover p-5 transition-all">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0" style={{ background: 'var(--color-primary)' }}>
                {agent.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm truncate" style={{ color: 'var(--color-text)' }}>{agent.name}</h4>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{agent.role}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setEditAgent(agent)} className="cursor-pointer p-1 opacity-50 hover:opacity-100 transition-opacity" style={{ color: 'var(--color-primary)' }} title="Edit">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                {agent.id !== currentAgentId && (
                  <button onClick={() => handleDelete(agent.id)} className="cursor-pointer p-1 opacity-40 hover:opacity-100 transition-opacity" style={{ color: 'var(--color-danger)' }} title="Delete">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2 text-[11px]">
              <Row label="Email" value={agent.email} />
              <Row label="Max Chats" value={String(agent.max_chats)} />
              <Row label="Status" value={
                <span className="font-bold px-1.5 py-0.5 rounded-full capitalize" style={{
                  background: agent.status === 'online' ? 'var(--color-accent-green-light)' : 'var(--color-surface-alt)',
                  color: agent.status === 'online' ? 'var(--color-accent-green)' : 'var(--color-text-muted)',
                }}>{agent.status}</span>
              } />
              <Row label="WhatsApp" value={
                <span style={{ color: agent.wa_connected ? '#25D366' : 'var(--color-text-muted)' }}>
                  {agent.wa_connected ? '✓ Connected' : 'Not linked'}
                </span>
              } />
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editAgent && (
        <AgentEditModal
          agent={editAgent}
          onSave={(updated) => {
            setAgents((prev: Agent[]) => prev.map((a: Agent) => a.id === updated.id ? updated : a));
            setEditAgent(null);
          }}
          onClose={() => setEditAgent(null)}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal title="New Agent" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <ModalInput label="Full Name" value={createForm.name} onChange={v => setCreateForm(p => ({ ...p, name: v }))} required />
            <ModalInput label="Email" type="email" value={createForm.email} onChange={v => setCreateForm(p => ({ ...p, email: v }))} required />
            <ModalInput label="Password" type="password" value={createForm.password} onChange={v => setCreateForm(p => ({ ...p, password: v }))} required />
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Role</label>
              <select value={createForm.role} onChange={e => setCreateForm(p => ({ ...p, role: e.target.value as 'admin' | 'agent' }))}
                className="w-full px-3 py-2 text-sm border outline-none"
                style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <ModalInput label="Max Concurrent Chats" type="number" value={String(createForm.max_chats)} onChange={v => setCreateForm(p => ({ ...p, max_chats: parseInt(v) || 1 }))} />
            {createError && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{createError}</p>}
            <button type="submit" disabled={isCreating} className="w-full py-2.5 text-white text-sm font-semibold cursor-pointer"
              style={{ background: isCreating ? 'var(--color-text-muted)' : 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>
              {isCreating ? 'Creating…' : 'Create Agent'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function AgentEditModal({ agent, onSave, onClose }: { agent: Agent; onSave: (a: Agent) => void; onClose: () => void }) {
  const [form, setForm] = useState({ name: agent.name, email: agent.email, role: agent.role, max_chats: agent.max_chats });
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      const updated = await agentApi.update(agent.id, form);
      onSave({ ...agent, ...updated });
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!newPassword.trim() || newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    setError('');
    setIsSaving(true);
    try {
      await agentApi.update(agent.id, { password: newPassword });
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
    <Modal title={`Edit — ${agent.name}`} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <ModalInput label="Full Name" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} required />
        <ModalInput label="Email" type="email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} required />
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Role</label>
          <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as any }))}
            className="w-full px-3 py-2 text-sm border outline-none"
            style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <ModalInput label="Max Concurrent Chats" type="number" value={String(form.max_chats)} onChange={v => setForm(p => ({ ...p, max_chats: parseInt(v) || 1 }))} />
        {error && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <button type="submit" disabled={isSaving} className="w-full py-2.5 text-white text-sm font-semibold cursor-pointer"
          style={{ background: isSaving ? 'var(--color-text-muted)' : 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>

      <div className="mt-6 pt-6 space-y-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Reset Password</p>
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="New password (min 6 chars)"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border outline-none"
            style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
          <button onClick={handlePasswordReset} disabled={isSaving || !newPassword.trim()} className="px-3 py-2 text-xs font-semibold cursor-pointer"
            style={{ borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            Reset
          </button>
        </div>
        {pwSuccess && <p className="text-xs" style={{ color: '#22c55e' }}>Password updated successfully.</p>}
      </div>
    </Modal>
  );
}

// ── CannedTab ──────────────────────────────────────────────────

function CannedTab({ canned, setCanned }: { canned: CannedResponse[]; setCanned: any }) {
  const [editItem, setEditItem] = useState<CannedResponse | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ shortcut: '', title: '', content: '' });
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this canned reply?')) return;
    try {
      await adminApi.deleteCanned(id);
      setCanned((prev: CannedResponse[]) => prev.filter((c: CannedResponse) => c.id !== id));
    } catch (err) {
      console.error('Failed to delete canned reply:', err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setIsCreating(true);
    try {
      const created = await adminApi.createCanned(createForm);
      setCanned((prev: CannedResponse[]) => [created, ...prev]);
      setShowCreate(false);
      setCreateForm({ shortcut: '', title: '', content: '' });
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowCreate(true)} className="flex items-center space-x-2 px-4 py-2 text-sm font-semibold text-white cursor-pointer"
          style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>New Reply</span>
        </button>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse min-w-[500px]">
          <thead>
            <tr style={{ background: 'var(--color-surface-alt)' }}>
              {['Shortcut', 'Title', 'Content', ''].map(h => (
                <th key={h} className="text-left py-3 px-5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {canned.map((item) => (
              <tr key={item.id} className="transition-colors" style={{ borderTop: '1px solid var(--color-border-light)' }}>
                <td className="py-3 px-5 font-mono text-sm font-bold" style={{ color: 'var(--color-primary)' }}>{item.shortcut}</td>
                <td className="py-3 px-5 font-semibold text-xs" style={{ color: 'var(--color-text)' }}>{item.title}</td>
                <td className="py-3 px-5 text-xs max-w-[300px]" style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="line-clamp-2 block">{item.content}</span>
                </td>
                <td className="py-3 px-5">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setEditItem(item)} className="cursor-pointer p-1 opacity-50 hover:opacity-100 transition-opacity" style={{ color: 'var(--color-primary)' }} title="Edit">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="cursor-pointer p-1 opacity-40 hover:opacity-100 transition-opacity" style={{ color: 'var(--color-danger)' }} title="Delete">
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
        {canned.length === 0 && (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No canned replies yet. Create one to speed up agent responses.
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editItem && (
        <CannedEditModal
          item={editItem}
          onSave={(updated) => {
            setCanned((prev: CannedResponse[]) => prev.map((c: CannedResponse) => c.id === updated.id ? updated : c));
            setEditItem(null);
          }}
          onClose={() => setEditItem(null)}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal title="New Canned Reply" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <ModalInput label="Shortcut (e.g. /hello)" value={createForm.shortcut} onChange={v => setCreateForm(p => ({ ...p, shortcut: v }))} required />
            <ModalInput label="Title" value={createForm.title} onChange={v => setCreateForm(p => ({ ...p, title: v }))} required />
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Content</label>
              <textarea
                value={createForm.content}
                onChange={e => setCreateForm(p => ({ ...p, content: e.target.value }))}
                required
                rows={4}
                className="w-full px-3 py-2 text-sm border outline-none resize-none leading-relaxed"
                style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
            </div>
            {createError && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{createError}</p>}
            <button type="submit" disabled={isCreating} className="w-full py-2.5 text-white text-sm font-semibold cursor-pointer"
              style={{ background: isCreating ? 'var(--color-text-muted)' : 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>
              {isCreating ? 'Creating…' : 'Create Canned Reply'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function CannedEditModal({ item, onSave, onClose }: { item: CannedResponse; onSave: (c: CannedResponse) => void; onClose: () => void }) {
  const [form, setForm] = useState({ shortcut: item.shortcut, title: item.title, content: item.content });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      const updated = await integrationApi.updateCanned(item.id, form);
      onSave({ ...item, ...updated });
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal title="Edit Canned Reply" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <ModalInput label="Shortcut" value={form.shortcut} onChange={v => setForm(p => ({ ...p, shortcut: v }))} required />
        <ModalInput label="Title" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} required />
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Content</label>
          <textarea
            value={form.content}
            onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
            required
            rows={4}
            className="w-full px-3 py-2 text-sm border outline-none resize-none leading-relaxed"
            style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </div>
        {error && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <button type="submit" disabled={isSaving} className="w-full py-2.5 text-white text-sm font-semibold cursor-pointer"
          style={{ background: isSaving ? 'var(--color-text-muted)' : 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </Modal>
  );
}

// ── WhatsAppTab ────────────────────────────────────────────────

function WhatsAppTab() {
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<'SMS' | 'VOICE'>('SMS');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestCode = async () => {
    if (!phoneNumberId.trim()) return;
    setIsLoading(true); setStatus(null);
    try {
      await adminApi.waRequestCode(phoneNumberId.trim(), method);
      setStep('verify');
      setStatus({ type: 'success', msg: `Code sent via ${method}. Enter the 6-digit code below.` });
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message || 'Failed to request code' });
    } finally { setIsLoading(false); }
  };

  const handleVerifyCode = async () => {
    if (!code.trim() || !phoneNumberId.trim()) return;
    setIsLoading(true); setStatus(null);
    try {
      await adminApi.waVerifyCode(phoneNumberId.trim(), code.trim());
      setStatus({ type: 'success', msg: 'Phone number registered successfully! You can now send and receive WhatsApp messages.' });
      setStep('request'); setCode('');
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message || 'Failed to verify code' });
    } finally { setIsLoading(false); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="card p-8 space-y-6">
        <SectionHeader color="#25D366" title="Company Phone Number Registration" />
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Register your WhatsApp Business phone number with Meta. The number must already be added to your WhatsApp Business Account in Meta Business Manager.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>Phone Number ID</label>
          <input type="text" value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)}
            placeholder="e.g. 1672455300425950" disabled={step === 'verify'}
            className="w-full border px-4 py-2.5 text-sm focus:outline-none font-mono"
            style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', background: step === 'verify' ? 'var(--color-surface-alt)' : 'var(--color-surface)' }} />
          <p className="text-xs px-1" style={{ color: 'var(--color-text-muted)' }}>
            Find this in Meta Business Manager → WhatsApp → API Setup → Phone Number ID
          </p>
        </div>

        {step === 'request' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>Delivery Method</label>
            <div className="flex gap-2">
              {(['SMS', 'VOICE'] as const).map(m => (
                <button key={m} type="button" onClick={() => setMethod(m)} className="px-4 py-2 text-sm font-semibold transition-all cursor-pointer" style={{
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${method === m ? '#25D366' : 'var(--color-border)'}`,
                  background: method === m ? 'rgba(37,211,102,0.1)' : 'var(--color-surface)',
                  color: method === m ? '#25D366' : 'var(--color-text-muted)',
                }}>
                  {m === 'SMS' ? 'SMS Text' : 'Voice Call'}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>6-Digit Verification Code</label>
            <input type="text" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handleVerifyCode()} placeholder="123456" maxLength={6}
              className="w-full border px-4 py-2.5 text-sm focus:outline-none font-mono tracking-widest"
              style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', background: 'var(--color-surface)' }} />
          </div>
        )}

        {status && (
          <div className="p-3 text-xs font-medium" style={{
            background: status.type === 'success' ? 'var(--color-accent-green-light)' : 'var(--color-danger-light)',
            color: status.type === 'success' ? 'var(--color-accent-green)' : 'var(--color-danger)',
            borderRadius: 'var(--radius-sm)',
          }}>
            {status.msg}
          </div>
        )}

        <div className="flex gap-3">
          {step === 'verify' && (
            <button onClick={() => { setStep('request'); setCode(''); setStatus(null); }} className="px-4 py-2.5 text-sm font-semibold cursor-pointer"
              style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
              Back
            </button>
          )}
          <button onClick={step === 'request' ? handleRequestCode : handleVerifyCode}
            disabled={isLoading || (step === 'request' ? !phoneNumberId.trim() : !code.trim())}
            className="flex-1 py-2.5 text-white text-sm font-semibold transition-all cursor-pointer"
            style={{ background: '#25D366', borderRadius: 'var(--radius-sm)', opacity: isLoading ? 0.7 : 1 }}>
            {isLoading ? 'Please wait...' : step === 'request' ? 'Send Verification Code' : 'Verify & Register'}
          </button>
        </div>
      </div>

      <div className="card p-6 space-y-3">
        <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>How it works</h4>
        <ol className="text-xs space-y-2 list-decimal list-inside" style={{ color: 'var(--color-text-secondary)' }}>
          <li>Add your phone number in Meta Business Manager → WhatsApp → Phone Numbers</li>
          <li>Copy the Phone Number ID (16-digit number, not the actual phone number)</li>
          <li>Enter it above and click Send Verification Code — Meta sends an SMS</li>
          <li>Enter the 6-digit code and click Verify &amp; Register</li>
          <li>The number status changes from Pending to Connected in Meta</li>
        </ol>
      </div>
    </div>
  );
}

// ── IntegrationTab ─────────────────────────────────────────────

function IntegrationTab() {
  const [data, setData] = useState<IntegrationData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [embedTab, setEmbedTab] = useState<'js' | 'iframe' | 'curl'>('js');
  const [copied, setCopied] = useState<string | null>(null);
  const [rotating, setRotating] = useState<'widget' | 'api' | null>(null);
  const [showWidgetKey, setShowWidgetKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    Promise.all([integrationApi.get(), integrationApi.getUsage()])
      .then(([d, u]) => { setData(d); setUsage(u); })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const rotate = async (type: 'widget' | 'api') => {
    if (!confirm(`Request a new ${type === 'widget' ? 'Widget' : 'API'} key? Your current key will be invalidated immediately.`)) return;
    setRotating(type);
    try {
      if (type === 'widget') {
        const result = await integrationApi.rotateWidgetKey();
        setData(prev => prev ? { ...prev, widget_key: result.widget_key } : prev);
      } else {
        const result = await integrationApi.rotateApiKey();
        setData(prev => prev ? { ...prev, api_key: result.api_key } : prev);
      }
    } catch (err) {
      console.error(`Failed to rotate ${type} key:`, err);
    } finally {
      setRotating(null);
    }
  };

  if (isLoading) return <div className="animate-pulse h-64 card" />;

  return (
    <div className="space-y-6">
      {/* Usage cards */}
      {usage && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <UsageCard label="Agents" used={usage.usage.agents_total} max={usage.limits.max_agents} color="var(--color-primary)" />
          <UsageCard label="Active Chats" used={usage.usage.conversations_active} max={usage.limits.max_agents * usage.limits.max_chats_per_agent} color="#8b5cf6" />
          <div className="card p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Messages Today</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{usage.usage.messages_sent_today.toLocaleString()}</p>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{usage.usage.messages_sent_month.toLocaleString()} this month</p>
          </div>
          {usage.whatsapp?.configured && (
            <div className="card p-4 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>WA Quality</p>
              <p className="text-lg font-bold" style={{ color: usage.whatsapp.quality_rating ? QUALITY_COLORS[usage.whatsapp.quality_rating] || 'var(--color-text)' : 'var(--color-text-muted)' }}>
                {usage.whatsapp.quality_rating || '—'}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                {usage.whatsapp.messaging_limit_tier ? TIER_LABELS[usage.whatsapp.messaging_limit_tier] || usage.whatsapp.messaging_limit_tier : 'Tier unknown'}
              </p>
            </div>
          )}
        </div>
      )}

      {data && (
        <>
          {/* Widget Key */}
          <div className="card p-6 space-y-4">
            <SectionHeader color="var(--color-primary)" title="Widget API Key" />
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Use this key to embed the chat widget on your website.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 text-xs font-mono rounded select-all" style={{ background: 'var(--color-surface-alt)', color: 'var(--color-primary)', border: '1px solid var(--color-border)' }}>
                {showWidgetKey ? data.widget_key : mask(data.widget_key)}
              </code>
              <button onClick={() => setShowWidgetKey(v => !v)} className="p-2 cursor-pointer" style={{ color: 'var(--color-text-muted)' }} title={showWidgetKey ? 'Hide' : 'Show'}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showWidgetKey
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                  }
                </svg>
              </button>
              <button onClick={() => copy(data.widget_key, 'wk')} className="p-2 cursor-pointer" style={{ color: copied === 'wk' ? '#22c55e' : 'var(--color-text-muted)' }} title="Copy">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {copied === 'wk'
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  }
                </svg>
              </button>
              <button onClick={() => rotate('widget')} disabled={rotating === 'widget'} className="px-3 py-1.5 text-xs font-semibold cursor-pointer" style={{
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
                color: 'var(--color-primary)', opacity: rotating === 'widget' ? 0.5 : 1,
              }}>
                {rotating === 'widget' ? '…' : 'Request New Key'}
              </button>
            </div>
          </div>

          {/* REST API Key */}
          <div className="card p-6 space-y-4">
            <SectionHeader color="#8b5cf6" title="REST API Key" />
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Use this key to access the REST API from your backend systems.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 text-xs font-mono rounded select-all" style={{ background: 'var(--color-surface-alt)', color: '#8b5cf6', border: '1px solid var(--color-border)' }}>
                {showApiKey ? data.api_key : mask(data.api_key)}
              </code>
              <button onClick={() => setShowApiKey(v => !v)} className="p-2 cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showApiKey
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                  }
                </svg>
              </button>
              <button onClick={() => copy(data.api_key, 'ak')} className="p-2 cursor-pointer" style={{ color: copied === 'ak' ? '#22c55e' : 'var(--color-text-muted)' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {copied === 'ak'
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  }
                </svg>
              </button>
              <button onClick={() => rotate('api')} disabled={rotating === 'api'} className="px-3 py-1.5 text-xs font-semibold cursor-pointer" style={{
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
                color: 'var(--color-primary)', opacity: rotating === 'api' ? 0.5 : 1,
              }}>
                {rotating === 'api' ? '…' : 'Request New Key'}
              </button>
            </div>
          </div>

          {/* Embed Code */}
          <div className="card p-6 space-y-4">
            <SectionHeader color="#f59e0b" title="Embed Options" />
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Choose how to integrate the chat widget into your website or application.
            </p>
            <div className="flex p-1 w-fit" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
              {(['js', 'iframe', 'curl'] as const).map(t => (
                <button key={t} onClick={() => setEmbedTab(t)} className="px-4 py-1.5 text-xs font-semibold transition-all cursor-pointer" style={{
                  borderRadius: 'var(--radius-sm)',
                  background: embedTab === t ? 'var(--color-surface)' : 'transparent',
                  color: embedTab === t ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  boxShadow: embedTab === t ? 'var(--shadow-sm)' : 'none',
                }}>
                  {t === 'js' ? 'JavaScript' : t === 'iframe' ? 'iFrame' : 'REST API'}
                </button>
              ))}
            </div>

            <div className="relative">
              <pre className="text-xs p-4 overflow-x-auto leading-relaxed" style={{
                background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {data.snippets[embedTab]}
              </pre>
              <button
                onClick={() => copy(data.snippets[embedTab], `embed_${embedTab}`)}
                className="absolute top-2 right-2 px-2 py-1 text-xs font-semibold cursor-pointer"
                style={{
                  borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: copied === `embed_${embedTab}` ? '#22c55e' : 'var(--color-text-muted)',
                }}
              >
                {copied === `embed_${embedTab}` ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            {embedTab === 'js' && (
              <div className="p-3 text-xs space-y-1" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)' }}>
                <p className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Customisation attributes:</p>
                <p><code className="font-mono" style={{ color: 'var(--color-primary)' }}>data-position</code> — bottom-right (default), bottom-left, top-right, top-left</p>
                <p><code className="font-mono" style={{ color: 'var(--color-primary)' }}>data-color</code> — hex color for the bubble (e.g. #1d4ed8)</p>
                <p><code className="font-mono" style={{ color: 'var(--color-primary)' }}>data-label</code> — tooltip text on hover</p>
              </div>
            )}
            {embedTab === 'curl' && (
              <div className="p-3 text-xs" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)' }}>
                Include <code className="font-mono" style={{ color: '#8b5cf6' }}>x-api-key: {'<your_key>'}</code> in all REST API requests.
                The key is tenant-scoped — only your tenant's data is accessible.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Shared UI helpers ──────────────────────────────────────────

function SectionHeader({ color, title }: { color: string; title: string }) {
  return (
    <h3 className="text-base font-bold flex items-center space-x-2" style={{ color: 'var(--color-text)' }}>
      <span className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span>{title}</span>
    </h3>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] uppercase font-semibold" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span className="text-[10px] font-bold" style={{ color: 'var(--color-text-secondary)' }}>{value}</span>
    </div>
  );
}

function UsageCard({ label, used, max, color }: { label: string; used: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((used / max) * 100) : 0;
  return (
    <div className="card p-4 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <p className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{used} <span className="text-sm font-normal" style={{ color: 'var(--color-text-muted)' }}>/ {max}</span></p>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-alt)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 90 ? 'var(--color-danger)' : color }} />
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
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

function ModalInput({ label, value, onChange, type = 'text', required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required}
        className="w-full px-3 py-2 text-sm border outline-none"
        style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
    </div>
  );
}

function InputGroup({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
        className="w-full border px-4 py-2.5 text-sm focus:outline-none transition-all"
        style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', background: 'var(--color-surface)' }} />
    </div>
  );
}

function TextAreaGroup({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      <textarea value={value || ''} onChange={e => onChange(e.target.value)}
        className="w-full border px-4 py-3 text-sm focus:outline-none transition-all h-28 resize-none leading-relaxed"
        style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', background: 'var(--color-surface)' }} />
    </div>
  );
}

function ToggleGroup({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between p-1">
      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      <button type="button" onClick={onChange} className="w-11 h-6 rounded-full p-0.5 transition-all cursor-pointer" style={{ background: value ? 'var(--color-primary)' : 'var(--color-border)' }}>
        <div className="w-5 h-5 rounded-full bg-white transition-all" style={{ transform: value ? 'translateX(20px)' : 'translateX(0)' }} />
      </button>
    </div>
  );
}
