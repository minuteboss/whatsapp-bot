'use client';

import { Message } from '@/lib/types';
import { format } from 'date-fns';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function MessageBubble({
  message,
  showAvatar
}: {
  message: Message;
  showAvatar: boolean;
}) {
  const isAgent = message.sender_type === 'agent';
  const isSystem = message.sender_type === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <span className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{
          background: 'var(--color-surface)',
          color: 'var(--color-text-muted)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
        }}>
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'} group animate-fade-in`}>
      <div className={`flex items-end space-x-2 max-w-[75%] ${isAgent ? 'flex-row-reverse space-x-reverse' : ''}`}>
        <div className={`w-6 h-6 rounded-full flex-shrink-0 mb-1 flex items-center justify-center text-[10px] font-bold text-white ${showAvatar ? 'opacity-100' : 'opacity-0'}`}
          style={{ background: isAgent ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
        >
          {isAgent ? 'A' : (message.sender_name?.charAt(0) || 'C')}
        </div>

        <div className="flex flex-col">
          <div className="px-4 py-2.5 text-sm" style={{
            borderRadius: isAgent ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            background: isAgent ? 'var(--color-primary)' : 'var(--color-surface)',
            color: isAgent ? 'white' : 'var(--color-text)',
            border: isAgent ? 'none' : '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
            {/* Media preview */}
            {message.media_url && (
              <div className="mt-2">
                <img
                  src={`${API_URL}${message.media_url}`}
                  alt="Media"
                  className="max-w-full rounded-lg"
                  style={{ maxHeight: '200px', objectFit: 'cover' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}
          </div>

          <div className={`flex items-center mt-1 space-x-1.5 ${isAgent ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              {format(new Date(message.created_at), 'HH:mm')}
            </span>

            {isAgent && message.wa_message_id && (
              <div className="flex items-center">
                {message.delivery_status === 'sent' && (
                  <svg className="w-3 h-3" fill="none" stroke="var(--color-text-muted)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {message.delivery_status === 'delivered' && (
                  <div className="flex relative -space-x-1.5">
                    <svg className="w-3 h-3" fill="none" stroke="var(--color-text-muted)" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    <svg className="w-3 h-3" fill="none" stroke="var(--color-text-muted)" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {message.delivery_status === 'read' && (
                  <div className="flex relative -space-x-1.5">
                    <svg className="w-3 h-3" fill="none" stroke="var(--color-primary)" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    <svg className="w-3 h-3" fill="none" stroke="var(--color-primary)" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {message.delivery_status === 'failed' && (
                  <span className="text-[10px] font-bold" style={{ color: 'var(--color-danger)' }}>Failed</span>
                )}
              </div>
            )}

            {isAgent && message.wa_sent_from === 'agent_personal' && (
              <span className="text-[10px] font-bold uppercase tracking-tighter" style={{ color: '#25D366' }}>WA</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
