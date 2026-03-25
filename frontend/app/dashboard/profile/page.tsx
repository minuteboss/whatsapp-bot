'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { agentApi } from '@/lib/api';
import WhatsAppConnectModal from '@/components/WhatsAppConnectModal';

export default function ProfilePage() {
  const { state, dispatch } = useApp();
  const [showConnect, setShowConnect] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const agent = state.agent;

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

  if (!agent) return null;

  return (
    <div className="flex-1 p-6 md:p-10 overflow-y-auto animate-fade-in">
      <div className="max-w-3xl mx-auto space-y-8">
        <header>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>Your Profile</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Manage your account and personal integrations.</p>
        </header>

        {/* ── Personal Info ──────────────────────── */}
        <section className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>Account Information</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InfoCard label="Full Name" value={agent.name} />
            <InfoCard label="Email Address" value={agent.email} />
            <InfoCard label="Role" value={agent.role} highlight />
            <InfoCard label="Max Conversations" value={agent.max_chats.toString()} />
          </div>
        </section>

        {/* ── WhatsApp Integration ────────────────── */}
        <section className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>Personal WhatsApp Connection</div>

          {agent.wa_connected ? (
            <div className="card p-6 flex flex-col md:flex-row items-center justify-between gap-4" style={{ borderColor: 'rgba(37, 99, 235, 0.2)' }}>
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#25D366' }}>
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.891.524 3.66 1.434 5.168L2 22l4.981-1.325A9.957 9.957 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
                  </svg>
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{agent.wa_phone_number}</span>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full" style={{ background: 'var(--color-accent-green-light)', color: 'var(--color-accent-green)' }}>Connected</span>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>You can reply via your personal WhatsApp.</p>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="px-5 py-2 text-sm font-semibold transition-all cursor-pointer"
                style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-danger)', border: '1px solid rgba(220, 38, 38, 0.2)', background: 'var(--color-danger-light)' }}
              >
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          ) : (
            <div className="card p-6 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--color-surface-alt)' }}>
                  <svg className="w-6 h-6" fill="none" stroke="var(--color-text-muted)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2C6.477 2 2 6.477 2 12c0 1.891.524 3.66 1.434 5.168L2 22l4.981-1.325A9.957 9.957 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" />
                  </svg>
                </div>
                <div>
                  <span className="text-base font-semibold" style={{ color: 'var(--color-text-secondary)' }}>WhatsApp Not Connected</span>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Connect to handle chats directly from WhatsApp.</p>
                </div>
              </div>
              <button
                onClick={() => setShowConnect(true)}
                className="px-6 py-2.5 text-white text-sm font-semibold transition-all cursor-pointer"
                style={{ background: '#25D366', borderRadius: 'var(--radius-sm)', boxShadow: '0 2px 8px rgba(37, 211, 102, 0.25)' }}
              >
                Connect Now
              </button>
            </div>
          )}
        </section>

        <div className="card p-6 space-y-3">
          <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Why connect your WhatsApp?</h4>
          <ul className="text-xs space-y-2 list-disc list-inside" style={{ color: 'var(--color-text-secondary)' }}>
            <li>Reply to customers even when the dashboard is closed</li>
            <li>Stay on top of support with native phone notifications</li>
            <li>Your replies are automatically synced back to the dashboard</li>
            <li>End-to-end encrypted communication via Meta Business API</li>
          </ul>
        </div>
      </div>

      {showConnect && <WhatsAppConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}

function InfoCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="card p-4 card-hover transition-all">
      <span className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span className="text-sm font-bold truncate block" style={{ color: highlight ? 'var(--color-primary)' : 'var(--color-text)' }}>{value}</span>
    </div>
  );
}
