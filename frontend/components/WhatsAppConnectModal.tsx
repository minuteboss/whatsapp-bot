'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { agentApi } from '@/lib/api';

export default function WhatsAppConnectModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp();
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!phoneNumberId.trim() || !state.agent?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const updatedAgent = await agentApi.waConnect(state.agent.id, phoneNumberId.trim());
      dispatch({ type: 'SET_AGENT', agent: updatedAgent });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to connect WhatsApp');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in" style={{ background: 'rgba(0, 0, 0, 0.3)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm animate-slide-up overflow-hidden" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--color-border)' }}>
        <div className="p-6 pb-3 flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>Link WhatsApp Number</h3>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Associate a WhatsApp Business number</p>
          </div>
          <button onClick={onClose} className="p-1.5 cursor-pointer" style={{ color: 'var(--color-text-muted)', borderRadius: 'var(--radius-sm)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 pt-3 space-y-5">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>Phone Number ID</label>
              <input
                type="text"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                placeholder="e.g. 1672455300425950"
                className="w-full border p-3 text-sm focus:outline-none transition-all font-mono"
                style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', background: 'var(--color-surface)' }}
              />
            </div>
            <div className="p-3 text-xs leading-relaxed" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)' }}>
              <p className="font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>Where to find this:</p>
              <p>Meta Business Manager → WhatsApp → API Setup → Phone Number ID</p>
              <p className="mt-1">This is the <strong>numeric ID</strong> (16 digits), not the phone number itself.</p>
            </div>
          </div>

          {error && (
            <div className="p-3 text-xs text-center font-medium" style={{ background: 'var(--color-danger-light)', color: 'var(--color-danger)', borderRadius: 'var(--radius-sm)' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={isLoading || !phoneNumberId.trim()}
            className="w-full py-2.5 font-semibold text-white text-sm transition-all cursor-pointer"
            style={{
              background: isLoading || !phoneNumberId.trim() ? 'var(--color-text-muted)' : '#25D366',
              borderRadius: 'var(--radius-sm)',
              boxShadow: isLoading || !phoneNumberId.trim() ? 'none' : '0 2px 8px rgba(37, 211, 102, 0.25)',
            }}
          >
            {isLoading ? 'Connecting...' : 'Connect WhatsApp →'}
          </button>
        </div>

        <div className="px-6 pb-5 text-center">
          <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Secured by Meta WhatsApp Cloud API</span>
        </div>
      </div>
    </div>
  );
}
