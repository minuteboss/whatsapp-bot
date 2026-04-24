'use client';

import { useApp } from '@/context/AppContext';
import { Conversation } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { useRouter, usePathname } from 'next/navigation';

export default function ConversationList() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  const conversations = Array.isArray(state.conversations) ? state.conversations : [];
  
  const filteredConversations = conversations.filter((c) => {
    if (state.filter === 'queue') return c.status === 'pending';
    if (state.filter === 'mine') return c.assigned_agent_id === state.agent?.id && c.status === 'active';
    if (state.filter === 'resolved') return c.status === 'resolved';
    return true;
  });

  if (filteredConversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48">
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No conversations found</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 py-1">
      {filteredConversations.map((conv) => (
        <ConversationItem
          key={conv.id}
          conversation={conv}
          isActive={state.activeConversationId === conv.id}
          onClick={() => {
            dispatch({ type: 'SET_ACTIVE_CONVERSATION', id: conv.id });
            if (pathname !== '/dashboard') router.push('/dashboard');
          }}
        />
      ))}
    </div>
  );
}

function ConversationItem({
  conversation,
  isActive,
  onClick,
}: {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}) {
  const name = conversation.customer_name || 'Guest';
  const lastMsg = conversation.last_message || 'No messages yet';
  const time = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })
    : 'New';

  return (
    <button
      onClick={onClick}
      className="w-full flex flex-col p-3 text-left transition-all cursor-pointer"
      style={{
        borderRadius: 'var(--radius-sm)',
        background: isActive ? 'var(--color-primary-light)' : 'transparent',
        border: isActive ? '1px solid rgba(37, 99, 235, 0.2)' : '1px solid transparent',
      }}
    >
      <div className="flex justify-between items-start mb-0.5">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-sm truncate max-w-[140px]" style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text)' }}>
            {name}
          </span>
          {conversation.channel === 'whatsapp' && (
            <svg className="w-3.5 h-3.5" fill="#25D366" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 1.891.524 3.66 1.434 5.168L2 22l4.981-1.325A9.957 9.957 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" />
            </svg>
          )}
        </div>
        <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
          {time}
        </span>
      </div>
      <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
        {lastMsg}
      </p>

      {conversation.status === 'pending' && (
        <div className="mt-1.5 flex">
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full" style={{
            background: 'var(--color-warning-light)',
            color: 'var(--color-warning)',
          }}>
            New Request
          </span>
        </div>
      )}
    </button>
  );
}
