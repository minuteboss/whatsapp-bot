'use client';

import { useApp } from '@/context/AppContext';
import { useRouter } from 'next/navigation';
import AgentStatusPill from './AgentStatusPill';
import ConversationList from './ConversationList';
import QueueBadge from './QueueBadge';

export default function Sidebar({ isOpen, toggle, onClose }: { isOpen: boolean; toggle: () => void; onClose?: () => void }) {
  const { state, dispatch } = useApp();
  const router = useRouter();

  const filterBtn = (filter: 'all' | 'queue' | 'mine' | 'resolved', label: string, badge?: React.ReactNode) => (
    <button
      onClick={() => { 
        dispatch({ type: 'SET_FILTER', filter }); 
        dispatch({ type: 'SET_ACTIVE_CONVERSATION', id: null });
        router.push('/dashboard'); 
        onClose?.(); 
      }}
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

  const navTo = (path: string) => {
    router.push(path);
    onClose?.();
  };

  return (
    <aside
      className={`
        ${isOpen ? 'w-[280px]' : 'w-0'}
        transition-all duration-300 flex flex-col h-full overflow-hidden
        fixed z-50 md:relative md:z-auto
      `}
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
          <div className="flex items-center gap-2">
            {!state.wsConnected && (
              <span className="text-[10px] font-semibold px-2 py-0.5 animate-pulse" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)', borderRadius: 'var(--radius-sm)' }}>
                Reconnecting…
              </span>
            )}
            {/* Mobile close button */}
            <button onClick={onClose} className="md:hidden p-1 cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
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
        <nav className="flex-1 flex flex-col space-y-0.5 mb-4 overflow-y-auto">
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 px-3 mb-2 mt-2">Inbox Filters</div>
          {filterBtn('all', 'All Conversations')}
          {filterBtn('queue', 'Queue', <QueueBadge />)}
          {filterBtn('mine', 'Assigned to Me')}
          {filterBtn('resolved', 'Resolved')}
        </nav>

        {/* ── Footer / Navigation ────────────────────── */}
        <div className="pt-3 mt-3 space-y-1" style={{ borderTop: '1px solid var(--color-border)' }}>
          {state.agent?.role === 'superadmin' && (
            <button
              onClick={() => navTo('/dashboard/superadmin')}
              className="w-full flex items-center space-x-3 px-3 py-2 transition-all cursor-pointer"
              style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="text-sm">Superadmin</span>
            </button>
          )}
          {(state.agent?.role === 'admin' || state.agent?.role === 'superadmin') && (
            <>
              <button
                onClick={() => navTo('/dashboard/admin/sub-tenants')}
                className="w-full flex items-center space-x-3 px-3 py-2 transition-all cursor-pointer text-sm"
                style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span>Reseller (Sub-Tenants)</span>
              </button>
              <button
                onClick={() => navTo('/dashboard/admin/contacts')}
                className="w-full flex items-center space-x-3 px-3 py-2 transition-all cursor-pointer text-sm"
                style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>Contacts</span>
              </button>
              <button
                onClick={() => navTo('/dashboard/admin/templates')}
                className="w-full flex items-center space-x-3 px-3 py-2 transition-all cursor-pointer text-sm"
                style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
                <span>Templates</span>
              </button>
              <button
                onClick={() => navTo('/dashboard/admin/broadcasts')}
                className="w-full flex items-center space-x-3 px-3 py-2 transition-all cursor-pointer text-sm"
                style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
                <span>Broadcasts</span>
              </button>
              <button
                onClick={() => navTo('/dashboard/wallet')}
                className="w-full flex items-center space-x-3 px-3 py-2 transition-all cursor-pointer text-sm"
                style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <div className="flex-1 flex items-center justify-between">
                  <span>Wallet</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">
                    ${((state.agent?.tenant_wallet_balance || 0) / 100).toFixed(2)}
                  </span>
                </div>
              </button>
              <button
                onClick={() => navTo('/dashboard/admin')}
                className="w-full flex items-center space-x-3 px-3 py-2 transition-all cursor-pointer text-sm"
                style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Admin Settings</span>
              </button>
            </>
          )}
          <button
            onClick={() => navTo('/dashboard/profile')}
            className="w-full flex items-center space-x-3 px-3 py-2 transition-all cursor-pointer text-sm"
            style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>Profile</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
