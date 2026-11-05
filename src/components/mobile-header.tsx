'use client';

import { useEffect, useState } from 'react';
import { PENDING_KEY_COUNT_EVENT } from '@/lib/hooks/use-pending-key-count';

export function MobileHeader({ workspaceName }: { workspaceName?: string }) {
  // The sidebar fetches the count and broadcasts it; reuse it here.
  const [pendingKeyCount, setPendingKeyCount] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => {
      setPendingKeyCount((e as CustomEvent<number>).detail);
    };
    window.addEventListener(PENDING_KEY_COUNT_EVENT, handler);
    return () => {
      window.removeEventListener(PENDING_KEY_COUNT_EVENT, handler);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 bg-slate-900 px-4 py-3 text-white md:hidden">
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
        className="relative flex h-10 w-10 items-center justify-center rounded-md hover:bg-slate-800"
        aria-label={
          pendingKeyCount > 0
            ? `Open menu (${pendingKeyCount} key${pendingKeyCount === 1 ? '' : 's'} waiting for approval)`
            : 'Open menu'
        }
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
        {pendingKeyCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-slate-900" />
        )}
      </button>
      <span className="truncate text-sm font-medium">{workspaceName ?? 'WritBase'}</span>
    </header>
  );
}
