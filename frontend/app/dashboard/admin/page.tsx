'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { adminApi, agentApi } from '@/lib/api';
import { Agent, CannedResponse } from '@/lib/types';

export default function AdminPage() {
  const { state } = useApp();
  const [activeTab, setActiveTab] = useState<'settings' | 'agents' | 'canned' | 'whatsapp'>('settings');
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
          adminApi.getSettings(),
          agentApi.list(),
          adminApi.listCanned(),
        ]);

        const settingsObj: Record<string, string> = {};
        settingsData.forEach((s: any) => settingsObj[s.key] = s.value);

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

          <div className="flex p-1" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
            <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} label="Settings" />
            <TabButton active={activeTab === 'agents'} onClick={() => setActiveTab('agents')} label="Agents" />
            <TabButton active={activeTab === 'canned'} onClick={() => setActiveTab('canned')} label="Canned Replies" />
            <TabButton active={activeTab === 'whatsapp'} onClick={() => setActiveTab('whatsapp')} label="WhatsApp" />
          </div>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-48" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)' }} />)}
          </div>
        ) : (
          <div className="animate-slide-up">
            {activeTab === 'settings' && <SettingsTab settings={settings} setSettings={setSettings} />}
            {activeTab === 'agents' && <AgentsTab agents={agents} />}
            {activeTab === 'canned' && <CannedTab canned={canned} setCanned={setCanned} />}
            {activeTab === 'whatsapp' && <WhatsAppTab />}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm font-semibold transition-all cursor-pointer"
      style={{
        borderRadius: 'var(--radius-sm)',
        background: active ? 'var(--color-surface)' : 'transparent',
        color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
        boxShadow: active ? 'var(--shadow-sm)' : 'none',
      }}
    >
      {label}
    </button>
  );
}

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

  return (
    <div className="max-w-2xl card p-8">
      <form onSubmit={handleSave} className="space-y-6">
        <h3 className="text-base font-bold flex items-center space-x-2" style={{ color: 'var(--color-text)' }}>
          <span className="w-1 h-5 rounded-full" style={{ background: 'var(--color-primary)' }} />
          <span>General Configuration</span>
        </h3>

        <div className="space-y-5">
          <InputGroup label="Business Name" value={settings.business_name} onChange={(v) => setSettings({ ...settings, business_name: v })} />
          <ToggleGroup label="Auto-Assign Conversations" value={settings.auto_assign === 'true'} onChange={(v) => setSettings({ ...settings, auto_assign: v ? 'true' : 'false' })} />
          <TextAreaGroup label="Welcome Message" value={settings.welcome_message} onChange={(v) => setSettings({ ...settings, welcome_message: v })} />
          <TextAreaGroup label="Offline/Away Message" value={settings.away_message} onChange={(v) => setSettings({ ...settings, away_message: v })} />
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="w-full py-2.5 text-white text-sm font-semibold transition-all cursor-pointer"
          style={{
            background: isSaving ? 'var(--color-text-muted)' : 'var(--color-primary)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: isSaving ? 'none' : '0 2px 8px rgba(37, 99, 235, 0.3)',
          }}
        >
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </button>
      </form>
    </div>
  );
}

function AgentsTab({ agents }: { agents: Agent[] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <div key={agent.id} className="card card-hover p-5 transition-all">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm" style={{ background: 'var(--color-primary)' }}>
                {agent.name.charAt(0)}
              </div>
              <div className="overflow-hidden">
                <h4 className="font-semibold text-sm truncate" style={{ color: 'var(--color-text)' }}>{agent.name}</h4>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{agent.role}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-semibold" style={{ color: 'var(--color-text-muted)' }}>Status</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize" style={{
                  background: agent.status === 'online' ? 'var(--color-accent-green-light)' : 'var(--color-surface-alt)',
                  color: agent.status === 'online' ? 'var(--color-accent-green)' : 'var(--color-text-muted)',
                }}>
                  {agent.status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-semibold" style={{ color: 'var(--color-text-muted)' }}>WA Link</span>
                <span className="text-[10px] font-bold" style={{ color: agent.wa_connected ? '#25D366' : 'var(--color-text-muted)' }}>
                  {agent.wa_connected ? 'Connected' : 'Not Linked'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CannedTab({ canned, setCanned }: { canned: CannedResponse[]; setCanned: any }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: 'var(--color-surface-alt)' }}>
            <th className="text-left py-3 px-5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Shortcut</th>
            <th className="text-left py-3 px-5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Title</th>
            <th className="text-left py-3 px-5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Content</th>
            <th className="py-3 px-5"></th>
          </tr>
        </thead>
        <tbody>
          {canned.map((item) => (
            <tr key={item.id} className="transition-colors" style={{ borderTop: '1px solid var(--color-border-light)' }}>
              <td className="py-3 px-5 font-mono text-sm font-bold" style={{ color: 'var(--color-primary)' }}>{item.shortcut}</td>
              <td className="py-3 px-5 font-semibold text-xs" style={{ color: 'var(--color-text)' }}>{item.title}</td>
              <td className="py-3 px-5 text-xs truncate max-w-[300px]" style={{ color: 'var(--color-text-secondary)' }}>{item.content}</td>
              <td className="py-3 px-5 text-right">
                <button className="cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WhatsAppTab() {
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<'SMS' | 'VOICE'>('SMS');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestCode = async () => {
    if (!phoneNumberId.trim()) return;
    setIsLoading(true);
    setStatus(null);
    try {
      await adminApi.waRequestCode(phoneNumberId.trim(), method);
      setStep('verify');
      setStatus({ type: 'success', msg: `Code sent via ${method} to the phone number. Enter the 6-digit code below.` });
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message || 'Failed to request code' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code.trim() || !phoneNumberId.trim()) return;
    setIsLoading(true);
    setStatus(null);
    try {
      await adminApi.waVerifyCode(phoneNumberId.trim(), code.trim());
      setStatus({ type: 'success', msg: 'Phone number registered successfully! You can now send and receive WhatsApp messages.' });
      setStep('request');
      setCode('');
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message || 'Failed to verify code' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="card p-8 space-y-6">
        <h3 className="text-base font-bold flex items-center space-x-2" style={{ color: 'var(--color-text)' }}>
          <span className="w-1 h-5 rounded-full" style={{ background: '#25D366' }} />
          <span>Company Phone Number Registration</span>
        </h3>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Register your WhatsApp Business phone number with Meta so it can send and receive messages.
          The phone number must already be added to your WhatsApp Business Account in Meta Business Manager.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>Phone Number ID</label>
          <input
            type="text"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="e.g. 1672455300425950"
            disabled={step === 'verify'}
            className="w-full border px-4 py-2.5 text-sm focus:outline-none font-mono"
            style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', background: step === 'verify' ? 'var(--color-surface-alt)' : 'var(--color-surface)' }}
          />
          <p className="text-xs px-1" style={{ color: 'var(--color-text-muted)' }}>
            Find this in Meta Business Manager → WhatsApp → API Setup → Phone Number ID
          </p>
        </div>

        {step === 'request' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>Delivery Method</label>
            <div className="flex gap-2">
              {(['SMS', 'VOICE'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className="px-4 py-2 text-sm font-semibold transition-all cursor-pointer"
                  style={{
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${method === m ? '#25D366' : 'var(--color-border)'}`,
                    background: method === m ? 'rgba(37,211,102,0.1)' : 'var(--color-surface)',
                    color: method === m ? '#25D366' : 'var(--color-text-muted)',
                  }}
                >
                  {m === 'SMS' ? 'SMS Text' : 'Voice Call'}
                </button>
              ))}
            </div>
            <p className="text-xs px-1" style={{ color: 'var(--color-text-muted)' }}>
              If SMS doesn't arrive, try Voice Call — Meta will call the number and read the code.
            </p>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>6-Digit Verification Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
              placeholder="123456"
              maxLength={6}
              className="w-full border px-4 py-2.5 text-sm focus:outline-none font-mono tracking-widest"
              style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', background: 'var(--color-surface)' }}
            />
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
            <button
              onClick={() => { setStep('request'); setCode(''); setStatus(null); }}
              className="px-4 py-2.5 text-sm font-semibold cursor-pointer"
              style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
            >
              Back
            </button>
          )}
          <button
            onClick={step === 'request' ? handleRequestCode : handleVerifyCode}
            disabled={isLoading || (step === 'request' ? !phoneNumberId.trim() : !code.trim())}
            className="flex-1 py-2.5 text-white text-sm font-semibold transition-all cursor-pointer"
            style={{
              background: '#25D366',
              borderRadius: 'var(--radius-sm)',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? 'Please wait...' : step === 'request' ? 'Send Verification Code' : 'Verify & Register'}
          </button>
        </div>
      </div>

      <div className="card p-6 space-y-3">
        <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>How it works</h4>
        <ol className="text-xs space-y-2 list-decimal list-inside" style={{ color: 'var(--color-text-secondary)' }}>
          <li>Add your phone number in Meta Business Manager → WhatsApp → Phone Numbers</li>
          <li>Copy the Phone Number ID (16-digit number, not the actual phone number)</li>
          <li>Enter it above and click Send Verification Code — Meta sends an SMS to the number</li>
          <li>Enter the 6-digit code and click Verify &amp; Register</li>
          <li>The number status changes from Pending to Connected in Meta</li>
        </ol>
      </div>
    </div>
  );
}

function InputGroup({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border px-4 py-2.5 text-sm focus:outline-none transition-all"
        style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', background: 'var(--color-surface)' }}
      />
    </div>
  );
}

function TextAreaGroup({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border px-4 py-3 text-sm focus:outline-none transition-all h-28 resize-none leading-relaxed"
        style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', background: 'var(--color-surface)' }}
      />
    </div>
  );
}

function ToggleGroup({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-1">
      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className="w-11 h-6 rounded-full p-0.5 transition-all cursor-pointer"
        style={{ background: value ? 'var(--color-primary)' : 'var(--color-border)' }}
      >
        <div className="w-5 h-5 rounded-full bg-white transition-all" style={{ transform: value ? 'translateX(20px)' : 'translateX(0)' }} />
      </button>
    </div>
  );
}
