'use client';

import { useApp } from '@/context/AppContext';
import { Agent } from '@/lib/types';
import { agentApi } from '@/lib/api';

const statusColors: Record<string, string> = {
  online: 'var(--color-accent-green)',
  away: 'var(--color-warning)',
  offline: 'var(--color-text-muted)',
};

export default function AgentStatusPill() {
  const { state, dispatch } = useApp();

  const handleStatusChange = async () => {
    if (!state.agent) return;

    const statuses: Agent['status'][] = ['online', 'away', 'offline'];
    const currentIndex = statuses.indexOf(state.agent.status);
    const nextStatus = statuses[(currentIndex + 1) % statuses.length];

    try {
      const updatedAgent = { ...state.agent, status: nextStatus };
      dispatch({ type: 'SET_AGENT', agent: updatedAgent });
      await agentApi.update(state.agent.id, { status: nextStatus });
    } catch (err) {
      console.error('Failed to update status:', err);
      dispatch({ type: 'SET_AGENT', agent: state.agent });
    }
  };

  if (!state.agent) return null;

  return (
    <button
      onClick={handleStatusChange}
      className="flex items-center space-x-1.5 group outline-none cursor-pointer"
    >
      <div className="w-2 h-2 rounded-full group-hover:scale-125 transition-transform" style={{ background: statusColors[state.agent.status] }} />
      <span className="text-[11px] font-medium capitalize select-none" style={{ color: 'var(--color-text-muted)' }}>
        {state.agent.status}
      </span>
    </button>
  );
}
