'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { agentApi } from '@/lib/api';
import WhatsAppConnectModal from '@/components/WhatsAppConnectModal';

export default function ProfilePage() {
  const { state, dispatch } = useApp();
  const [showConnect, setShowConnect] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [isSavingPw, setIsSavingPw] = useState(false);

  const agent = state.agent;
  const [form, setForm] = useState({
    name: agent?.name || '',
    email: agent?.email || '',
    status: agent?.status || 'online',
  });

  if (!agent) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    setIsSaving(true);
    try {
      const updated = await agentApi.update(agent.id, form);
      dispatch({ type: 'SET_AGENT', agent: { ...agent, ...updated } });
      setSaveSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.next !== pwForm.confirm) { setPwError('New passwords do not match'); return; }
    if (pwForm.next.length < 6) { setPwError('Password must be at least 6 characters'); return; }
    setIsSavingPw(true);
    try {
      await agentApi.update(agent.id, { password: pwForm.next });
      setPwForm({ current: '', next: '', confirm: '' });
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: any) {
      setPwError(err.message || 'Failed to change password');
    } finally {
      setIsSavingPw(false);
    }
  };

  const handleDisconnect = async () => {
    if (!agent?.id) return;
    setIsDisconnecting(true);
    try {
      const updatedAgent = await agentApi.waDisconnect(agent.id);
      dispatch({ type: 'SET_AGENT', agent: updatedAgent });
    } catch (err) {
      console.error('Failed to disconnect WhatsApp:', err);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const statusOptions = [
    { value: 'online', label: 'Online', color: 'var(--color-accent-green)' },
    { value: 'away', label: 'Away', color: 'var(--color-warning)' },
    { value: 'offline', label: 'Offline', color: 'var(--color-text-muted)' },
  ];

  return (
    <div className="flex-1 p-6 md:p-10 overflow-y-auto animate-fade-in">
      <div className="max-w-2xl mx-auto space-y-8">
        <header>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>Your Profile</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Manage your account details and integrations.</p>
        </header>

        {/* ── Profile Card ───────────────────────────── */}
        <div className="card p-8 space-y-6">
          {/* Avatar + read-only meta */}
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl text-white flex-shrink-0" style={{ background: 'var(--color-primary)' }}>
              {agent.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{agent.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-semibold capitalize px-2 py-0.5 rounded-full" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                  {agent.role}
                </span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>·</span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Max {agent.max_chats} chats</span>
              </div>
            </div>
          </div>

          {/* Editable form */}
          {isEditing ? (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Full Name</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required
                  className="w-full border px-4 py-2.5 text-sm focus:outline-none"
                  style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', background: 'var(--color-surface)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Email Address</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required
                  className="w-full border px-4 py-2.5 text-sm focus:outline-none"
                  style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', background: 'var(--color-surface)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>Status</label>
                <div className="flex gap-2">
                  {statusOptions.map(opt => (
                    <button key={opt.value} type="button" onClick={() => setForm(p => ({ ...p, status: opt.value as 'online' | 'away' | 'offline' }))}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold cursor-pointer transition-all"
                      style={{
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${form.status === opt.value ? opt.color : 'var(--color-border)'}`,
                        background: form.status === opt.value ? `${opt.color}18` : 'var(--color-surface)',
                        color: form.status === opt.value ? opt.color : 'var(--color-text-muted)',
                      }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: opt.color }} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {saveError && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{saveError}</p>}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={isSaving} className="flex-1 py-2.5 text-white text-sm font-semibold cursor-pointer"
                  style={{ background: isSaving ? 'var(--color-text-muted)' : 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>
                  {isSaving ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => { setIsEditing(false); setForm({ name: agent.name, email: agent.email, status: agent.status }); setSaveError(''); }}
                  className="px-4 py-2.5 text-sm font-semibold cursor-pointer"
                  style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <ProfileRow label="Full Name" value={agent.name} />
              <ProfileRow label="Email" value={agent.email} />
              <ProfileRow label="Status" value={
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: statusOptions.find(o => o.value === agent.status)?.color || 'var(--color-text-muted)' }} />
                  <span className="capitalize">{agent.status}</span>
                </span>
              } />
              <ProfileRow label="Role" value={<span className="capitalize font-bold" style={{ color: 'var(--color-primary)' }}>{agent.role}</span>} />
              <ProfileRow label="Max Chats" value={`${agent.max_chats} concurrent (set by admin)`} muted />

              {saveSuccess && <p className="text-xs" style={{ color: '#22c55e' }}>Profile updated successfully.</p>}

              <button onClick={() => setIsEditing(true)} className="w-full mt-4 py-2.5 text-sm font-semibold cursor-pointer transition-all"
                style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', color: 'var(--color-primary)', background: 'var(--color-primary-light)' }}>
                Edit Profile
              </button>
            </div>
          )}
        </div>

        {/* ── Change Password ────────────────────────── */}
        <div className="card p-8 space-y-5">
          <div className="flex items-center space-x-2">
            <span className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: '#f59e0b' }} />
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>Change Password</h3>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            {[
              { key: 'next', label: 'New Password' },
              { key: 'confirm', label: 'Confirm New Password' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>{f.label}</label>
                <input type="password" value={(pwForm as any)[f.key]}
                  onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                  required minLength={6}
                  className="w-full border px-4 py-2.5 text-sm focus:outline-none"
                  style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', background: 'var(--color-surface)' }} />
              </div>
            ))}

            {pwError && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{pwError}</p>}
            {pwSuccess && <p className="text-xs" style={{ color: '#22c55e' }}>Password changed successfully.</p>}

            <button type="submit" disabled={isSavingPw} className="w-full py-2.5 text-white text-sm font-semibold cursor-pointer"
              style={{ background: isSavingPw ? 'var(--color-text-muted)' : '#f59e0b', borderRadius: 'var(--radius-sm)' }}>
              {isSavingPw ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* ── WhatsApp Connection ────────────────────── */}
        <div className="card p-8 space-y-5">
          <div className="flex items-center space-x-2">
            <span className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: '#25D366' }} />
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>Personal WhatsApp</h3>
          </div>

          {agent.wa_connected ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg" style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.2)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#25D366' }}>
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.891.524 3.66 1.434 5.168L2 22l4.981-1.325A9.957 9.957 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{agent.wa_phone_number}</p>
                  <p className="text-xs" style={{ color: '#22c55e' }}>Connected — replies sync to dashboard</p>
                </div>
              </div>
              <button onClick={handleDisconnect} disabled={isDisconnecting}
                className="px-4 py-2 text-sm font-semibold cursor-pointer transition-all"
                style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-danger)', border: '1px solid rgba(220,38,38,0.25)', background: 'var(--color-danger-light)' }}>
                {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg" style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Not connected</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Connect to handle chats from your personal WhatsApp.</p>
              </div>
              <button onClick={() => setShowConnect(true)}
                className="px-5 py-2 text-white text-sm font-semibold cursor-pointer flex-shrink-0"
                style={{ background: '#25D366', borderRadius: 'var(--radius-sm)', boxShadow: '0 2px 8px rgba(37,211,102,0.25)' }}>
                Connect WhatsApp
              </button>
            </div>
          )}
        </div>

        {/* Tenant info (read-only) */}
        {agent.tenant_id && (
          <div className="card p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Tenant ID</p>
              <code className="text-xs font-mono mt-0.5 block" style={{ color: 'var(--color-text-secondary)' }}>{agent.tenant_id}</code>
            </div>
            <span className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }}>Read-only</span>
          </div>
        )}
      </div>

      {showConnect && <WhatsAppConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}

function ProfileRow({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: muted ? 'var(--color-text-muted)' : 'var(--color-text)' }}>{value}</span>
    </div>
  );
}
