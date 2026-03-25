'use client';

import { useApp } from '@/context/AppContext';
import { useRouter } from 'next/navigation';
import AgentStatusPill from './AgentStatusPill';
import ConversationList from './ConversationList';
import QueueBadge from './QueueBadge';

export default function Sidebar({ isOpen, toggle }: { isOpen: boolean; toggle: () => void }) {
  const { state, dispatch } = useApp();
  const router = useRouter();

  const filterBtn = (filter: 'all' | 'queue' | 'mine' | 'resolved', label: string, badge?: React.ReactNode) => (
    <button
      onClick={() => { dispatch({ type: 'SET_FILTER', filter }); router.push('/dashboard'); }}
      className="flex items-center justify-between px-3 py-2 text-sm transition-all cursor-pointer"
      style={{
        borderRadius: 'var(--radius-sm)',
        background: state.filter === filter ? 'var(--color-primary-light)' : 'transparent',
        color: state.filter === filter ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        fontWeight: state.filter === filter ? 600 : 400,
      }}
    >
      <span>{label}</span>
      {badge}
    </button>
  );

  return (
    <aside
      className={`${isOpen ? 'w-[280px]' : 'w-0'} transition-all duration-300 flex flex-col h-full overflow-hidden`}
      style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}
    >
      <div className="p-5 flex flex-col h-full min-w-[280px]">
        {/* ── Logo & Status ─────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 flex items-center justify-center" style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)', boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)' }}>
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
              </svg>
            </div>
            <span className="font-bold text-base tracking-tight" style={{ color: 'var(--color-text)' }}>Support</span>
          </div>
          {!state.wsConnected && (
            <span className="text-[10px] font-semibold px-2 py-0.5 animate-pulse" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)', borderRadius: 'var(--radius-sm)' }}>
              Reconnecting…
            </span>
          )}
        </div>

        {/* ── Agent Card ─────────────────────────────── */}
        <div className="mb-5">
          <div className="flex items-center space-x-3 p-3" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm" style={{ background: 'var(--color-primary)' }}>
              {state.agent?.name.charAt(0)}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{state.agent?.name}</span>
              <AgentStatusPill />
            </div>
          </div>
        </div>

        {/* ── Filters ─────────────────────────────────── */}
        <nav className="flex flex-col space-y-0.5 mb-4">
          {filterBtn('all', 'All Conversations')}
          {filterBtn('queue', 'Queue', <QueueBadge />)}
          {filterBtn('mine', 'Assigned to Me')}
          {filterBtn('resolved', 'Resolved')}
        </nav>

        {/* ── Conversation List ──────────────────────── */}
        <div className="flex-1 overflow-y-auto -mx-2 px-2">
          <ConversationList />
        </div>

        {/* ── Footer / Navigation ────────────────────── */}
        <div className="pt-3 mt-3 space-y-1" style={{ borderTop: '1px solid var(--color-border)' }}>
          {(state.agent?.role === 'admin' || state.agent?.role === 'superadmin') && (
            <button
              onClick={() => router.push('/dashboard/admin')}
              className="w-full flex items-center space-x-3 px-3 py-2 transition-all cursor-pointer"
              style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm">Admin Settings</span>
            </button>
          )}
          <button
            onClick={() => router.push('/dashboard/profile')}
            className="w-full flex items-center space-x-3 px-3 py-2 transition-all cursor-pointer"
            style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-sm">Profile</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
