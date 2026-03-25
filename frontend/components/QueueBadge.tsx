'use client';

import { useApp } from '@/context/AppContext';

export default function QueueBadge() {
  const { state } = useApp();

  if (state.pendingCount === 0) return null;

  return (
    <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold leading-none text-white rounded-full pulse-blue" style={{ background: 'var(--color-primary)' }}>
      {state.pendingCount}
    </span>
  );
}
