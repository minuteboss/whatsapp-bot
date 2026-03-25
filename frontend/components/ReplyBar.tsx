'use client';

import { useState, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { conversationApi } from '@/lib/api';
import CannedDropdown from './CannedDropdown';

export default function ReplyBar() {
  const { state, dispatch } = useApp();
  const [content, setContent] = useState('');
  const [showCanned, setShowCanned] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const conversation = state.conversations.find(c => c.id === state.activeConversationId);
  const isWhatsApp = conversation?.channel === 'whatsapp';
  const isAgentWAConnected = state.agent?.wa_connected;

  const handleSend = async () => {
    if (!content.trim() || !state.activeConversationId || isSending) return;

    const currentContent = content;
    setContent('');
    setIsSending(true);

    try {
      const msg = await conversationApi.sendMessage(state.activeConversationId, currentContent);
      // Immediately add to state — don't wait for WS broadcast
      dispatch({ type: 'ADD_MESSAGE', message: msg });
    } catch (err) {
      console.error('Failed to send message:', err);
      setContent(currentContent); // restore on failure
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === '/' && content === '') {
      setShowCanned(true);
    } else if (content.length > 0 && !content.startsWith('/')) {
      setShowCanned(false);
    }
  };

  const insertCanned = (text: string) => {
    setContent(text);
    setShowCanned(false);
    inputRef.current?.focus();
  };

  return (
    <div className="p-4" style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}>
      <div className="relative max-w-5xl mx-auto">
        {showCanned && (
          <div className="absolute bottom-full mb-2 left-0 w-full z-50">
            <CannedDropdown onSelect={insertCanned} onClose={() => setShowCanned(false)} />
          </div>
        )}

        <div className="flex items-end space-x-3 p-2 transition-all" style={{
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
        }}>
          <textarea
            ref={inputRef}
            rows={1}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (use / for shortcuts)"
            className="flex-1 bg-transparent border-none text-sm py-2 px-3 focus:outline-none resize-none min-h-[36px] max-h-[160px]"
            style={{ color: 'var(--color-text)' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${target.scrollHeight}px`;
            }}
          />

          <button
            onClick={handleSend}
            disabled={!content.trim() || isSending}
            className="p-2 transition-all cursor-pointer"
            style={{
              borderRadius: 'var(--radius-sm)',
              background: content.trim() && !isSending ? 'var(--color-primary)' : 'var(--color-surface-alt)',
              color: content.trim() && !isSending ? 'white' : 'var(--color-text-muted)',
              boxShadow: content.trim() && !isSending ? '0 2px 8px rgba(37, 99, 235, 0.25)' : 'none',
            }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between px-2">
          {isWhatsApp ? (
            <div className="flex items-center space-x-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: isAgentWAConnected ? '#25D366' : 'var(--color-text-muted)' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: isAgentWAConnected ? '#25D366' : 'var(--color-text-muted)' }}>
                {isAgentWAConnected
                  ? `Personal WhatsApp (${state.agent?.wa_phone_number})`
                  : 'Company WhatsApp'}
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-primary)' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
                Web Chat Widget
              </span>
            </div>
          )}
          <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Type / for canned responses</span>
        </div>
      </div>
    </div>
  );
}
