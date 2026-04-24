'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { conversationApi } from '@/lib/api';
import ChatPanel from '@/components/ChatPanel';
import InboxBrowser from '@/components/InboxBrowser';

export default function DashboardPage() {
  const { state, dispatch } = useApp();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchConversations = async () => {
      if (!state.agent) return;

      try {
        const data: any = await conversationApi.list({});
        dispatch({ type: 'SET_CONVERSATIONS', conversations: data.items || [] });
      } catch (err) {
        console.error('Failed to fetch conversations:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConversations();
  }, [state.agent, state.wsConnected, dispatch]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-3 rounded-full animate-spin" style={{ borderColor: 'var(--color-border)', borderTopColor: 'var(--color-primary)' }}></div>
      </div>
    );
  }

  if (!state.activeConversationId) {
    return <InboxBrowser />;
  }

  return <ChatPanel />;
}
