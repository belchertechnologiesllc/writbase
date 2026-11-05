import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AgentKeyDetailEditor } from '@/components/agent-key-detail-editor';
import { ErrorBoundary } from '@/components/error-boundary';
import { PermissionEditor } from '@/components/permission-editor';
import { Badge } from '@/components/ui/badge';
import { getAgentKeyPermissions } from '@/lib/services/agent-keys';
import { createClient } from '@/lib/supabase/server';
import type { AgentKey } from '@/lib/types/database';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentKeyDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('agent_keys')
    .select(
      'id, name, role, key_prefix, is_active, approval_status, special_prompt, created_at, last_used_at, created_by',
    )
    .eq('id', id)
    .single();

  if (!data) {
    notFound();
  }

  const key = data as Pick<
    AgentKey,
    | 'id'
    | 'name'
    | 'role'
    | 'key_prefix'
    | 'is_active'
    | 'approval_status'
    | 'special_prompt'
    | 'created_at'
    | 'last_used_at'
    | 'created_by'
  >;

  const permissions = await getAgentKeyPermissions(supabase, id);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href="/agent-keys"
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          &larr; Agent Keys
        </Link>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold text-slate-900 dark:text-slate-100">
              {key.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">
                {key.key_prefix}...
              </code>
              <Badge color={key.role === 'manager' ? 'purple' : 'blue'}>{key.role}</Badge>
              {key.approval_status === 'pending' ? (
                <Badge color="yellow">Pending approval</Badge>
              ) : key.approval_status === 'rejected' ? (
                <Badge color="red">Rejected</Badge>
              ) : (
                <Badge color={key.is_active ? 'green' : 'red'}>
                  {key.is_active ? 'Active' : 'Inactive'}
                </Badge>
              )}
            </div>
            {key.approval_status === 'pending' && (
              <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                An agent created this key. Approve or reject it from the{' '}
                <Link href="/agent-keys" className="underline">
                  Agent Keys
                </Link>{' '}
                page, or switch it on below.
              </p>
            )}
            {key.approval_status === 'rejected' && (
              <p className="mt-3 text-sm text-red-700 dark:text-red-300">
                This key was rejected, so agents can&apos;t switch it on. Switching it on below
                approves it.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-slate-600 dark:text-slate-400">
          <div>
            <span className="font-medium">Created:</span>{' '}
            {new Date(key.created_at).toLocaleDateString()}
          </div>
          <div>
            <span className="font-medium">Last used:</span>{' '}
            {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Settings</h2>
        <ErrorBoundary>
          <AgentKeyDetailEditor
            keyId={key.id}
            initialName={key.name}
            initialPrompt={key.special_prompt ?? ''}
            initialActive={key.is_active}
          />
        </ErrorBoundary>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Permissions</h2>
        <ErrorBoundary>
          <PermissionEditor
            keyId={key.id}
            initialPermissions={permissions.map((p) => ({
              projectId: p.project_id,
              projectName: p.projects?.name ?? 'Unknown',
              departmentId: p.department_id,
              departmentName: p.departments?.name ?? null,
              canRead: p.can_read,
              canCreate: p.can_create,
              canUpdate: p.can_update,
              canAssign: p.can_assign,
              canComment: p.can_comment,
              canArchive: p.can_archive,
            }))}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
