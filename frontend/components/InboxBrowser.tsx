'use client';

import { useApp } from '@/context/AppContext';
import { Conversation } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { conversationApi } from '@/lib/api';

export default function InboxBrowser() {
  const { state, dispatch } = useApp();

  const conversations = Array.isArray(state.conversations) ? state.conversations : [];
  
  const filteredConversations = conversations.filter((c) => {
    if (state.filter === 'queue') return c.status === 'pending';
    if (state.filter === 'mine') return c.assigned_agent_id === state.agent?.id && c.status === 'active';
    if (state.filter === 'resolved') return c.status === 'resolved';
    return true;
  });

  const stats = {
    pending: conversations.filter(c => c.status === 'pending').length,
    active: conversations.filter(c => c.status === 'active').length,
    resolved: conversations.filter(c => c.status === 'resolved').length,
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
      {/* ── Stats Bar ─────────────────────────────── */}
      <div className="p-6 lg:p-8 pb-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatCard label="Waiting in Queue" value={stats.pending} color="var(--color-warning)" icon="⏳" />
          <StatCard label="Active Conversations" value={stats.active} color="var(--color-primary)" icon="💬" />
          <StatCard label="Resolved Today" value={stats.resolved} color="var(--color-accent-green)" icon="✅" />
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
              {state.filter === 'all' ? 'All Conversations' : 
               state.filter === 'queue' ? 'Pending Queue' :
               state.filter === 'mine' ? 'My Conversations' : 'Resolved'}
            </h2>
            <p className="text-sm opacity-60">Showing {filteredConversations.length} total</p>
          </div>
        </div>
      </div>

      {/* ── Grid ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 lg:p-8 pt-0">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white border-2 border-dashed rounded-xl" style={{ borderColor: 'var(--color-border)' }}>
             <p className="text-sm font-medium opacity-40">No conversations found in this filter.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {filteredConversations.map((conv) => (
              <ConversationCard key={conv.id} conversation={conv} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon }: any) {
  return (
    <div className="p-4 bg-white border shadow-sm transition-all hover:shadow-md" style={{ borderRadius: 'var(--radius-md)', borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-40">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="text-2xl font-black" style={{ color }}>{value}</div>
    </div>
  );
}

function ConversationCard({ conversation }: { conversation: Conversation }) {
  const { state, dispatch } = useApp();
  
  const handleAccept = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await conversationApi.accept(conversation.id);
      dispatch({ type: 'SET_ACTIVE_CONVERSATION', id: conversation.id });
    } catch (err) {
      console.error('Failed to accept:', err);
    }
  };

  const name = conversation.customer_name || 'Guest';
  const time = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })
    : 'New';

  return (
    <div 
      onClick={() => dispatch({ type: 'SET_ACTIVE_CONVERSATION', id: conversation.id })}
      className="group p-5 bg-white border shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 cursor-pointer flex flex-col h-full"
      style={{ borderRadius: 'var(--radius-lg)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white text-sm" style={{ background: 'var(--color-primary)' }}>
            {name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm truncate" style={{ color: 'var(--color-text)' }}>{name}</h3>
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] font-medium opacity-40 uppercase tracking-widest">{conversation.channel}</span>
              <span className="text-[10px] opacity-20">·</span>
              <span className="text-[10px] font-medium opacity-40">{time}</span>
            </div>
          </div>
        </div>
        <StatusBadge status={conversation.status} />
      </div>

      <div className="flex-1 mb-5">
        <p className="text-xs line-clamp-3 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {conversation.last_message || 'No messages yet.'}
        </p>
      </div>

      <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
        {conversation.status === 'pending' ? (
          <button 
            onClick={handleAccept}
            className="w-full py-2 text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95 cursor-pointer"
            style={{ background: 'var(--color-accent-green)', borderRadius: 'var(--radius-sm)' }}
          >
            Accept Chat
          </button>
        ) : (
          <button 
            className="w-full py-2 text-xs font-bold transition-all hover:bg-slate-50 cursor-pointer"
            style={{ color: 'var(--color-primary)', border: '1px solid var(--color-primary-light)', borderRadius: 'var(--radius-sm)' }}
          >
            Open Chat
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: any = {
    pending: { label: 'Waiting', bg: 'var(--color-warning-light)', text: 'var(--color-warning)' },
    active: { label: 'Active', bg: 'var(--color-primary-light)', text: 'var(--color-primary)' },
    resolved: { label: 'Resolved', bg: 'var(--color-surface-alt)', text: 'var(--color-text-muted)' },
  };
  const config = configs[status] || configs.pending;

  return (
    <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-full" style={{ background: config.bg, color: config.text }}>
      {config.label}
    </span>
  );
}
