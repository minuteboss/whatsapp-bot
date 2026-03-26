'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { conversationApi } from '@/lib/api';
import MessageBubble from './MessageBubble';
import ReplyBar from './ReplyBar';
import TransferModal from './TransferModal';

export default function ChatPanel() {
  const { state, dispatch } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  const conversation = state.conversations.find(c => c.id === state.activeConversationId);
  const assignedAgent = conversation?.assigned_agent_id
    ? state.agents.find(a => a.id === conversation.assigned_agent_id)
    : null;
  const typingInfo = state.activeConversationId ? state.typing[state.activeConversationId] : null;

  // Auto-clear typing after 4 seconds of no update
  useEffect(() => {
    if (!typingInfo || !state.activeConversationId) return;
    const id = setTimeout(() => {
      dispatch({ type: 'CLEAR_TYPING', conversationId: state.activeConversationId! });
    }, 4000);
    return () => clearTimeout(id);
  }, [typingInfo, state.activeConversationId, dispatch]);

  useEffect(() => {
    const fetchMessages = async () => {
      if (!state.activeConversationId || !state.agent) return;
      try {
        const data = await conversationApi.get(state.activeConversationId);
        dispatch({
          type: 'SET_MESSAGES',
          messages: data.messages,
          hasMore: data.has_more,
          nextCursor: data.next_cursor,
        });
      } catch (err) {
        console.error('Failed to fetch messages:', err);
      }
    };
    fetchMessages();
  }, [state.activeConversationId, state.agent, state.wsConnected, dispatch]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.messages, typingInfo]);

  // Close actions menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setIsActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLoadMore = async () => {
    if (!state.activeConversationId || !state.hasMoreMessages || !state.nextCursor) return;
    try {
      const data = await conversationApi.get(state.activeConversationId, 50, state.nextCursor);
      dispatch({ type: 'PREPEND_MESSAGES', messages: data.messages, hasMore: data.has_more, nextCursor: data.next_cursor });
    } catch (err) {
      console.error('Failed to load more messages:', err);
    }
  };

  const handleAction = async (action: 'accept' | 'resolve' | 'reopen') => {
    if (!state.activeConversationId) return;
    try {
      if (action === 'accept') await conversationApi.accept(state.activeConversationId);
      else if (action === 'resolve') await conversationApi.resolve(state.activeConversationId);
      else await conversationApi.reopen(state.activeConversationId);
      setIsActionsOpen(false);
    } catch (err) {
      console.error(`Failed to ${action}:`, err);
    }
  };

  if (!conversation) return null;

  return (
    <div className="flex-1 flex flex-col h-full relative animate-fade-in" style={{ background: 'var(--color-surface)' }}>
      {/* ── Header ─────────────────────────────────── */}
      <header className="h-16 px-5 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white text-sm" style={{ background: 'var(--color-primary)' }}>
            {conversation.customer_name?.charAt(0) || 'G'}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-sm truncate" style={{ color: 'var(--color-text)' }}>
              {conversation.customer_name || 'Guest Customer'}
            </h2>
            <div className="flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
                background: conversation.status === 'active' ? 'var(--color-accent-green)' : conversation.status === 'resolved' ? 'var(--color-text-muted)' : 'var(--color-warning)',
              }} />
              <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                {conversation.status === 'pending' ? 'Waiting' : conversation.channel}
              </span>
              {assignedAgent && (
                <>
                  <span style={{ color: 'var(--color-border)' }}>·</span>
                  <span className="text-[10px] font-medium truncate max-w-[100px]" style={{ color: 'var(--color-text-muted)' }}>
                    {assignedAgent.name}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          {conversation.status === 'pending' ? (
            <button
              onClick={() => handleAction('accept')}
              className="px-4 py-1.5 font-semibold text-white text-sm transition-all cursor-pointer"
              style={{ background: 'var(--color-accent-green)', borderRadius: 'var(--radius-sm)', boxShadow: '0 2px 8px rgba(22, 163, 74, 0.25)' }}
            >
              Accept Chat
            </button>
          ) : conversation.status === 'active' ? (
            <div className="relative" ref={actionsRef}>
              <button
                onClick={() => setIsActionsOpen(!isActionsOpen)}
                className="p-2 transition-all cursor-pointer" style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)' }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
              {isActionsOpen && (
                <div className="absolute right-0 mt-1 w-48 py-1 z-50" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' }}>
                  <button
                    onClick={() => handleAction('resolve')}
                    className="w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    ✓ Resolve Conversation
                  </button>
                  <button
                    onClick={() => { setShowTransfer(true); setIsActionsOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    ↗ Transfer to Agent
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 text-xs font-bold uppercase tracking-widest" style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)', borderRadius: 'var(--radius-sm)' }}>
                Resolved
              </span>
              <button
                onClick={() => handleAction('reopen')}
                className="px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer"
                style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}
              >
                Reopen
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Messages Area ────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-5 space-y-3 scroll-smooth"
        style={{ background: 'var(--color-bg)' }}
      >
        {state.hasMoreMessages && (
          <div className="flex justify-center py-2">
            <button
              onClick={handleLoadMore}
              className="text-xs font-medium px-4 py-1.5 transition-all cursor-pointer"
              style={{ color: 'var(--color-primary)', background: 'var(--color-primary-light)', borderRadius: 'var(--radius-sm)' }}
            >
              Load older messages
            </button>
          </div>
        )}
        {state.messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            showAvatar={idx === 0 || state.messages[idx - 1].sender_type !== msg.sender_type}
          />
        ))}
        {state.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full opacity-50">
            <svg className="w-10 h-10 mb-2" fill="none" stroke="var(--color-text-muted)" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Starting new session...</p>
          </div>
        )}

        {/* Typing indicator */}
        {typingInfo && (
          <div className="flex items-end space-x-2 animate-fade-in">
            <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'var(--color-text-muted)' }}>
              {typingInfo.name.charAt(0)}
            </div>
            <div className="px-4 py-3 flex items-center space-x-1" style={{ borderRadius: '16px 16px 16px 4px', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-text-muted)', animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-text-muted)', animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-text-muted)', animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Reply Bar ────────────────────────────────── */}
      {conversation.status === 'active' && <ReplyBar />}

      {/* ── Modals ──────────────────────────────────── */}
      {showTransfer && <TransferModal onClose={() => setShowTransfer(false)} />}
    </div>
  );
}
