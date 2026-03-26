'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useWebSocket } from '@/lib/websocket';
import { authApi, setTenantId, conversationApi, adminApi } from '@/lib/api';
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
  const [mounted, setMounted] = useState(false);

  // Stable callbacks — must not be inline arrows or WS reconnects on every render
  const onConnect = useCallback(() => {
    dispatch({ type: 'SET_WS_CONNECTED', connected: true });
    // Re-fetch conversations on every (re)connect to catch messages missed during disconnect
    conversationApi.list({}).then((convs) => {
      dispatch({ type: 'SET_CONVERSATIONS', conversations: convs });
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
    // Try to restore session from cookie
    if (!state.agent) {
      authApi.me().then((agent) => {
        setTenantId(agent.tenant_id ?? null);
        dispatch({ type: 'SET_AGENT', agent });
        adminApi.listCanned().then((canned) => {
          dispatch({ type: 'SET_CANNED', cannedResponses: canned });
        }).catch(() => {});
      }).catch(() => {
        router.push('/login');
      });
    }
  }, [state.agent, router, dispatch]);

  if (!mounted || !state.agent) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--color-bg)' }}>
        <div className="w-8 h-8 border-3 rounded-full animate-spin" style={{ borderColor: 'var(--color-border)', borderTopColor: 'var(--color-primary)' }}></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      {/* ── Sidebar ─────────────────────────────────── */}
      <Sidebar isOpen={isSidebarOpen} toggle={() => setIsSidebarOpen(!isSidebarOpen)} />

      {/* ── Main Chat Area ───────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--color-surface)' }}>
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
