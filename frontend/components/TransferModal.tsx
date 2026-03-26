'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { agentApi, conversationApi } from '@/lib/api';
import { Agent } from '@/lib/types';

type StatusGroup = 'online' | 'away' | 'offline';

const STATUS_CONFIG: Record<StatusGroup, { label: string; color: string; note?: string }> = {
  online: { label: 'Online', color: '#22c55e' },
  away: { label: 'Away', color: '#f59e0b' },
  offline: { label: 'Offline', color: '#9ca3af', note: 'Chat will wait for their return' },
};

export default function TransferModal({ onClose }: { onClose: () => void }) {
  const { state } = useApp();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const data = await agentApi.list();
        setAgents(data.filter((a: Agent) => a.id !== state.agent?.id));
      } catch (err) {
        console.error('Failed to fetch agents:', err);
      }
    };
    fetchAgents();
  }, [state.agent?.id]);

  const handleTransfer = async () => {
    if (!selectedAgentId || !state.activeConversationId) return;
    setIsLoading(true);
    try {
      await conversationApi.transfer(state.activeConversationId, selectedAgentId, note);
      onClose();
    } catch (err) {
      console.error('Transfer failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const grouped: Record<StatusGroup, Agent[]> = { online: [], away: [], offline: [] };
  for (const a of agents) {
    const g = (a.status === 'online' || a.status === 'away') ? a.status : 'offline';
    grouped[g].push(a);
  }
  // Sort alphabetically within each group
  for (const g of Object.keys(grouped) as StatusGroup[]) {
    grouped[g].sort((a, b) => a.name.localeCompare(b.name));
  }

  const hasAgents = agents.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in" style={{ background: 'rgba(0, 0, 0, 0.3)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md animate-slide-up overflow-hidden" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--color-border)' }}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h3 className="font-bold text-base" style={{ color: 'var(--color-text)' }}>Transfer Conversation</h3>
          <button onClick={onClose} className="cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>Select Agent</label>

            {hasAgents ? (
              (['online', 'away', 'offline'] as StatusGroup[]).map(status => {
                const list = grouped[status];
                if (list.length === 0) return null;
                const cfg = STATUS_CONFIG[status];
                return (
                  <div key={status} className="space-y-1.5">
                    <div className="flex items-center gap-2 px-1">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>{cfg.label}</span>
                      {cfg.note && <span className="text-[10px] italic" style={{ color: 'var(--color-text-muted)' }}>— {cfg.note}</span>}
                    </div>
                    {list.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => setSelectedAgentId(agent.id)}
                        className="flex items-center space-x-3 p-3 w-full transition-all cursor-pointer"
                        style={{
                          borderRadius: 'var(--radius-sm)',
                          background: selectedAgentId === agent.id ? 'var(--color-primary-light)' : 'var(--color-surface-alt)',
                          border: selectedAgentId === agent.id ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid transparent',
                        }}
                      >
                        <div className="relative">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--color-primary)' }}>
                            {agent.name.charAt(0)}
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2" style={{ borderColor: 'var(--color-surface)', background: cfg.color }} />
                        </div>
                        <div className="flex flex-col text-left overflow-hidden">
                          <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{agent.name}</span>
                          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{agent.role}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)' }}>
                No other agents available.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--color-text-muted)' }}>Transfer Note (Internal)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain why you're transferring this chat..."
              className="w-full p-3 text-sm focus:outline-none resize-none h-20"
              style={{
                background: 'var(--color-surface-alt)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text)',
              }}
            />
          </div>
        </div>

        <div className="p-5 flex space-x-3" style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 text-sm font-semibold transition-all cursor-pointer"
            style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleTransfer}
            disabled={!selectedAgentId || isLoading}
            className="flex-1 py-2.5 px-4 text-sm font-semibold text-white transition-all cursor-pointer"
            style={{
              borderRadius: 'var(--radius-sm)',
              background: !selectedAgentId || isLoading ? 'var(--color-text-muted)' : 'var(--color-primary)',
              boxShadow: !selectedAgentId || isLoading ? 'none' : '0 2px 8px rgba(37, 99, 235, 0.3)',
            }}
          >
            {isLoading ? 'Transferring...' : 'Transfer Chat'}
          </button>
        </div>
      </div>
    </div>
  );
}
