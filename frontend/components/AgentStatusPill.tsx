'use client';

import { useRef, useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { Agent } from '@/lib/types';
import { agentApi } from '@/lib/api';

const statusConfig: Record<Agent['status'], { color: string; label: string }> = {
  online:  { color: 'var(--color-accent-green)', label: 'Online'  },
  away:    { color: 'var(--color-warning)',       label: 'Away'    },
  offline: { color: 'var(--color-text-muted)',    label: 'Offline' },
};

export default function AgentStatusPill() {
  const { state, dispatch } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!state.agent) return null;

  const handleSelect = async (status: Agent['status']) => {
    setOpen(false);
    const prev = state.agent!;
    dispatch({ type: 'SET_AGENT', agent: { ...prev, status } });
    try {
      await agentApi.update(prev.id, { status });
    } catch {
      dispatch({ type: 'SET_AGENT', agent: prev });
    }
  };

  const current = statusConfig[state.agent.status];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center space-x-1.5 outline-none cursor-pointer"
      >
        <div className="w-2 h-2 rounded-full" style={{ background: current.color }} />
        <span className="text-[11px] font-medium select-none" style={{ color: 'var(--color-text-muted)' }}>
          {current.label}
        </span>
        <svg className="w-2.5 h-2.5" style={{ color: 'var(--color-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 min-w-[110px] py-1"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {(['online', 'away', 'offline'] as Agent['status'][]).map(s => (
            <button
              key={s}
              onClick={() => handleSelect(s)}
              className="w-full flex items-center space-x-2 px-3 py-1.5 cursor-pointer transition-colors"
              style={{
                background: state.agent!.status === s ? 'var(--color-primary-light)' : 'transparent',
                color: state.agent!.status === s ? 'var(--color-primary)' : 'var(--color-text)',
              }}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusConfig[s].color }} />
              <span className="text-xs font-medium">{statusConfig[s].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
