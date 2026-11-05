'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { decideAgentKeyApprovalAction } from '@/app/(dashboard)/actions/agent-key-actions';
import { AgentKeyForm } from '@/components/agent-key-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { AGENT_KEYS_CHANGED_EVENT } from '@/lib/hooks/use-pending-key-count';
import type { AgentKey } from '@/lib/types/database';
import { apiGet } from '@/lib/utils/api-client';
import { formatRelativeTime } from '@/lib/utils/format';

type KeyRow = Omit<AgentKey, 'key_hash'>;

function StatusBadge({ keyRow }: { keyRow: KeyRow }) {
  if (keyRow.pending_approval) return <Badge color="yellow">Pending</Badge>;
  return (
    <Badge color={keyRow.is_active ? 'green' : 'red'}>
      {keyRow.is_active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

function PendingApprovals({
  keys,
  busyId,
  onDecide,
}: {
  keys: KeyRow[];
  busyId: string | null;
  onDecide: (key: KeyRow, decision: 'approve' | 'reject') => void;
}) {
  return (
    <section
      aria-labelledby="pending-approvals-heading"
      className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30"
    >
      <h2
        id="pending-approvals-heading"
        className="text-base font-semibold text-amber-900 dark:text-amber-200"
      >
        Waiting for approval ({keys.length})
      </h2>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
        An agent created these keys. They can&apos;t be used until you approve them.
      </p>

      <ul className="mt-4 space-y-3">
        {keys.map((k) => {
          const busy = busyId === k.id;
          return (
            <li
              key={k.id}
              className="flex flex-col gap-3 rounded-md border border-amber-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-slate-900"
            >
              <div className="min-w-0">
                <p
                  className="truncate font-medium text-slate-900 dark:text-slate-100"
                  title={k.name}
                >
                  {k.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Badge color={k.role === 'manager' ? 'purple' : 'blue'}>{k.role}</Badge>
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800">
                    {k.key_prefix}...
                  </code>
                  <span>Requested {formatRelativeTime(k.created_at)}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  disabled={busy}
                  onClick={() => {
                    onDecide(k, 'approve');
                  }}
                  aria-label={`Approve ${k.name}`}
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    onDecide(k, 'reject');
                  }}
                  aria-label={`Reject ${k.name}`}
                >
                  Reject
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AgentKeyList() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiGet<KeyRow[]>('/api/agent-keys');
      setKeys(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  async function handleDecide(key: KeyRow, decision: 'approve' | 'reject') {
    if (
      decision === 'reject' &&
      !window.confirm(`Reject "${key.name}"? The key will stay switched off.`)
    ) {
      return;
    }

    setBusyId(key.id);
    try {
      const result = await decideAgentKeyApprovalAction(key.id, decision);
      if (result.success) {
        toast.success(decision === 'approve' ? `Approved ${key.name}` : `Rejected ${key.name}`);
      } else {
        toast.error(result.error ?? 'Something went wrong');
      }
      await fetchKeys();
      window.dispatchEvent(new CustomEvent(AGENT_KEYS_CHANGED_EVENT));
    } finally {
      setBusyId(null);
    }
  }

  const pendingKeys = keys.filter((k) => k.pending_approval);

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Agent Keys</h1>
        <Button
          onClick={() => {
            setShowCreate(true);
          }}
        >
          Create Key
        </Button>
      </div>

      <div className="mt-6">
        {loading && keys.length === 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
              <div className="h-3 w-24 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
              <div className="h-3 w-16 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
              <div className="h-3 w-16 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
            </div>
            <div className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <div className="h-4 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
                  <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
            <p className="mb-3 text-sm text-red-700 dark:text-red-400">{error}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                void fetchKeys();
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && keys.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            No agent keys yet. Create one to get started.
          </div>
        )}

        {!error && pendingKeys.length > 0 && (
          <PendingApprovals keys={pendingKeys} busyId={busyId} onDecide={handleDecide} />
        )}

        {!error && keys.length > 0 && (
          // Scrolls sideways instead of clipping when the screen is too narrow.
          <div className="relative overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-3 sm:px-4">Name</th>
                  <th className="hidden px-4 py-3 xl:table-cell">Key Prefix</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Role</th>
                  <th className="px-3 py-3 sm:px-4">Status</th>
                  <th className="hidden px-4 py-3 xl:table-cell">Last Used</th>
                  <th className="px-3 py-3 sm:px-4">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="max-w-[9rem] px-3 py-3 sm:px-4 font-medium text-slate-900 sm:max-w-[14rem] xl:max-w-[24rem] dark:text-slate-100">
                      <span className="block truncate" title={k.name}>
                        {k.name}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 xl:table-cell">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">
                        {k.key_prefix}...
                      </code>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <Badge color={k.role === 'manager' ? 'purple' : 'blue'}>{k.role}</Badge>
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      <StatusBadge keyRow={k} />
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-slate-500 xl:table-cell dark:text-slate-400">
                      {k.last_used_at ? formatRelativeTime(k.last_used_at) : 'Never'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right sm:px-4">
                      <Link
                        href={`/agent-keys/${k.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
        }}
        title="Create Agent Key"
      >
        <AgentKeyForm
          onClose={() => {
            setShowCreate(false);
          }}
          onSuccess={() => {
            void fetchKeys();
            window.dispatchEvent(new CustomEvent(AGENT_KEYS_CHANGED_EVENT));
          }}
        />
      </Modal>
    </>
  );
}
