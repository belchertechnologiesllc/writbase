'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { AgentKey } from '@/lib/types/database';
import { apiGet } from '@/lib/utils/api-client';

/** Fired after a key is approved, rejected or changed so badges refresh. */
export const AGENT_KEYS_CHANGED_EVENT = 'agent-keys-changed';

/** Fired with the latest count so other components (like the mobile header) can show it. */
export const PENDING_KEY_COUNT_EVENT = 'pending-key-count';

/**
 * Counts agent keys waiting for human approval. Refreshes on navigation,
 * when the window regains focus, and when the key list changes.
 */
export function usePendingKeyCount(): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const keys = await apiGet<Pick<AgentKey, 'pending_approval'>[]>('/api/agent-keys');
      const next = (keys ?? []).filter((k) => k.pending_approval).length;
      setCount(next);
      window.dispatchEvent(new CustomEvent(PENDING_KEY_COUNT_EVENT, { detail: next }));
    } catch {
      // The badge is a hint; a failed count shouldn't interrupt the page.
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is listed on purpose so the count refreshes on every navigation
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState in async fetch callbacks is intentional
    void refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    const handler = () => {
      void refresh();
    };
    window.addEventListener(AGENT_KEYS_CHANGED_EVENT, handler);
    window.addEventListener('focus', handler);
    return () => {
      window.removeEventListener(AGENT_KEYS_CHANGED_EVENT, handler);
      window.removeEventListener('focus', handler);
    };
  }, [refresh]);

  return count;
}
