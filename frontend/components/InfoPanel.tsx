'use client';

import { useApp } from '@/context/AppContext';
import { format } from 'date-fns';

export default function InfoPanel() {
  const { state } = useApp();
  const conversation = state.conversations.find(c => c.id === state.activeConversationId);

  if (!conversation) return null;

  return (
    <div className="p-5 space-y-6 h-full overflow-y-auto">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto flex items-center justify-center text-2xl font-bold text-white mb-3" style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-lg)' }}>
          {conversation.customer_name?.charAt(0) || 'G'}
        </div>
        <h3 className="font-bold text-base" style={{ color: 'var(--color-text)' }}>{conversation.customer_name || 'Guest'}</h3>
        <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{conversation.customer_email || 'No email provided'}</p>
      </div>

      <div className="space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-widest px-1" style={{ color: 'var(--color-text-muted)' }}>Customer Details</div>
        <div className="p-3 space-y-3" style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
          <DetailItem label="Phone" value={conversation.customer_phone || 'N/A'} />
          <DetailItem label="Channel" value={conversation.channel === 'whatsapp' ? 'WhatsApp' : 'Web Widget'} />
          <DetailItem label="Started" value={format(new Date(conversation.created_at), 'MMM d, HH:mm')} />
          {conversation.source_page && <DetailItem label="Page" value={conversation.source_page.split('/').pop() || 'Home'} />}
        </div>
      </div>

      {conversation.transfer_note && (
        <div className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest px-1" style={{ color: 'var(--color-text-muted)' }}>Transfer Note</div>
          <div className="p-3 text-xs leading-relaxed italic" style={{
            background: 'var(--color-warning-light)',
            color: 'var(--color-warning)',
            borderRadius: 'var(--radius-sm)',
          }}>
            &ldquo;{conversation.transfer_note}&rdquo;
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col space-y-0.5">
      <span className="text-[10px] font-medium uppercase tracking-tighter" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span className="text-xs font-semibold truncate" style={{ color: 'var(--color-text)' }}>{value}</span>
    </div>
  );
}
