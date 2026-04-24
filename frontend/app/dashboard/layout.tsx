'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useWebSocket } from '@/lib/websocket';
import { authApi, setTenantId, conversationApi, adminApi, agentApi } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import InfoPanel from '@/components/InfoPanel';
import { useNotifications } from '@/hooks/useNotifications';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { state, dispatch, handleWSEvent } = useApp();
  const { notify } = useNotifications();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Stable callbacks — must not be inline arrows or WS reconnects on every render
  const onConnect = useCallback(() => {
    dispatch({ type: 'SET_WS_CONNECTED', connected: true });
    // Re-fetch conversations on every (re)connect to catch messages missed during disconnect
    conversationApi.list({}).then((convs: any) => {
      dispatch({ type: 'SET_CONVERSATIONS', conversations: convs.items || convs || [] });
    }).catch(() => {});
  }, [dispatch]);
  const onDisconnect = useCallback(() => dispatch({ type: 'SET_WS_CONNECTED', connected: false }), [dispatch]);

  // Wrap WS event handler to fire notifications on incoming customer messages
  const onWSEvent = useCallback((event: any) => {
    handleWSEvent(event);
    if (event.type === 'new_message' && event.message?.sender_type === 'customer') {
      const name = event.message.sender_name || 'Customer';
      const preview = (event.message.content || '').slice(0, 80);
      notify(name, preview);
    }
  }, [handleWSEvent, notify]);

  // Initialize WebSocket (ticket-based)
  const { sendTyping } = useWebSocket({
    enabled: !!state.agent,
    onEvent: onWSEvent,
    onConnect,
    onDisconnect,
  });

  useEffect(() => {
    setMounted(true);
    
    // 1. Session restoration (if agent is missing)
    if (!state.agent) {
      authApi.me().then((agent) => {
        setTenantId(agent.tenant_id ?? null);
        dispatch({ type: 'SET_AGENT', agent });
      }).catch(() => {
        router.push('/login');
      });
      return;
    }

    // 2. Data initialization (once agent is present)
    if (state.agent) {
      // Always sync the API module tenant ID
      setTenantId(state.agent.tenant_id ?? null);

      // Fetch lists if empty
      if (state.cannedResponses.length === 0) {
        adminApi.listCanned().then((canned) => {
          dispatch({ type: 'SET_CANNED', cannedResponses: canned });
        }).catch(() => {});
      }
      
      if (state.agents.length === 0) {
        agentApi.list().then((agents) => {
          dispatch({ type: 'SET_AGENTS', agents });
        }).catch(() => {});
      }
    }
  }, [state.agent, state.cannedResponses.length, state.agents.length, router, dispatch]);

  if (!mounted || !state.agent) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--color-bg)' }}>
        <div className="w-8 h-8 border-3 rounded-full animate-spin" style={{ borderColor: 'var(--color-border)', borderTopColor: 'var(--color-primary)' }}></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      {/* ── Mobile top bar ─────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 z-40 md:hidden flex items-center h-12 px-3 gap-3"
        style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
        <button onClick={() => setMobileOpen(true)} className="p-1.5 cursor-pointer" style={{ color: 'var(--color-text)' }}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>Support</span>
        {!state.wsConnected && (
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 animate-pulse" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)', borderRadius: 'var(--radius-sm)' }}>
            Reconnecting…
          </span>
        )}
      </div>

      {/* ── Mobile backdrop ────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar (desktop: controlled by isOpen, mobile: controlled by mobileOpen) ── */}
      <div className="hidden md:flex">
        <Sidebar isOpen={isSidebarOpen} toggle={() => setIsSidebarOpen(!isSidebarOpen)} />
      </div>
      <div className="md:hidden">
        <Sidebar isOpen={mobileOpen} toggle={() => setMobileOpen(!mobileOpen)} onClose={() => setMobileOpen(false)} />
      </div>

      {/* ── Main Chat Area ───────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 pt-12 md:pt-0 overflow-y-auto" style={{ background: 'var(--color-surface)' }}>
        {children}
      </main>

      {/* ── Info Panel — only on the main dashboard route ── */}
      {state.activeConversationId && pathname === '/dashboard' && (
        <aside className="w-[280px] hidden xl:flex flex-col" style={{ background: 'var(--color-bg)', borderLeft: '1px solid var(--color-border)' }}>
          <InfoPanel />
        </aside>
      )}
    </div>
  );
}
