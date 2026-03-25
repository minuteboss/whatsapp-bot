'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { conversationApi } from '@/lib/api';
import ChatPanel from '@/components/ChatPanel';

export default function DashboardPage() {
  const { state, dispatch } = useApp();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchConversations = async () => {
      if (!state.agent) return;

      try {
        const conversations = await conversationApi.list({});
        dispatch({ type: 'SET_CONVERSATIONS', conversations });
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
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div className="w-20 h-20 flex items-center justify-center mb-5" style={{ background: 'var(--color-primary-50)', borderRadius: 'var(--radius-lg)' }}>
          <svg className="w-10 h-10" fill="none" stroke="var(--color-primary)" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold mb-1.5" style={{ color: 'var(--color-text)' }}>Select a conversation</h2>
        <p className="text-sm max-w-xs" style={{ color: 'var(--color-text-muted)' }}>
          Choose a chat from the sidebar to start responding to customers.
        </p>
      </div>
    );
  }

  return <ChatPanel />;
}
