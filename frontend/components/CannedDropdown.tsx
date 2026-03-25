'use client';

import { useApp } from '@/context/AppContext';

export default function CannedDropdown({
  onSelect,
  onClose
}: {
  onSelect: (text: string) => void;
  onClose: () => void;
}) {
  const { state } = useApp();
  const canned = state.cannedResponses;

  return (
    <div className="animate-slide-up max-h-[300px] overflow-y-auto" style={{
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-lg)',
      border: '1px solid var(--color-border)',
    }}>
      <div className="p-3 flex items-center justify-between sticky top-0" style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Canned Responses</span>
        <button onClick={onClose} className="cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="py-1">
        {canned.length > 0 ? (
          canned.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item.content)}
              className="w-full text-left px-4 py-3 transition-colors cursor-pointer"
              style={{ borderBottom: '1px solid var(--color-border-light)' }}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-bold uppercase tracking-tighter" style={{ color: 'var(--color-primary)' }}>
                  {item.shortcut}
                </span>
                <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>{item.title}</span>
              </div>
              <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{item.content}</p>
            </button>
          ))
        ) : (
          <div className="p-6 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
            No canned responses found. Go to Admin to add some.
          </div>
        )}
      </div>
    </div>
  );
}
