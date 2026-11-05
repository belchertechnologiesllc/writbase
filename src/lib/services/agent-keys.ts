import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentKey, AgentPermission } from '@/lib/types/database';
import type { AgentRole } from '@/lib/types/enums';
import { logEvent } from './event-log';

export async function hashSecret(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const KEY_COLUMNS =
  'id, name, role, key_prefix, is_active, approval_status, special_prompt, created_at, last_used_at, created_by, project_id, department_id';

async function generateKey(
  keyId: string,
): Promise<{ fullKey: string; prefix: string; hash: string }> {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const secret = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hash = await hashSecret(secret);
  const prefix = secret.slice(0, 8);
  const fullKey = `wb_${keyId}_${secret}`;
  return { fullKey, prefix, hash };
}

export async function listAgentKeys(
  supabase: SupabaseClient,
): Promise<Omit<AgentKey, 'key_hash'>[]> {
  const { data, error } = await supabase
    .from('agent_keys')
    .select(KEY_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Omit<AgentKey, 'key_hash'>[];
}

export async function createAgentKey(
  supabase: SupabaseClient,
  params: {
    name: string;
    role?: AgentRole;
    specialPrompt?: string | null;
    createdBy: string;
    workspaceId: string;
    projectId?: string | null;
    departmentId?: string | null;
  },
): Promise<{ key: Omit<AgentKey, 'key_hash'>; fullKey: string }> {
  const keyId = crypto.randomUUID();
  const { fullKey, prefix, hash } = await generateKey(keyId);

  const { data, error } = await supabase
    .from('agent_keys')
    .insert({
      id: keyId,
      name: params.name,
      role: params.role ?? 'worker',
      key_hash: hash,
      key_prefix: prefix,
      special_prompt: params.specialPrompt ?? null,
      created_by: params.createdBy,
      workspace_id: params.workspaceId,
      project_id: params.projectId ?? null,
      department_id: params.departmentId ?? null,
    })
    .select(KEY_COLUMNS)
    .single();

  if (error) throw error;
  const key = data as Omit<AgentKey, 'key_hash'>;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: key.id,
    eventType: 'agent_key.created',
    actorType: 'human',
    actorId: params.createdBy,
    actorLabel: 'admin',
    source: 'ui',
    workspaceId: params.workspaceId,
  });

  return { key, fullKey };
}

export async function updateAgentKey(
  supabase: SupabaseClient,
  params: {
    id: string;
    name?: string;
    specialPrompt?: string | null;
    isActive?: boolean;
    projectId?: string | null;
    departmentId?: string | null;
    actorId: string;
    workspaceId: string;
  },
): Promise<Omit<AgentKey, 'key_hash'>> {
  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.specialPrompt !== undefined) updates.special_prompt = params.specialPrompt;
  if (params.isActive !== undefined) {
    updates.is_active = params.isActive;
    // A human switching a key on is an approval. Switching it off is not a
    // decision, so a pending or rejected key keeps its status.
    if (params.isActive) updates.approval_status = 'approved';
  }
  if (params.projectId !== undefined) {
    updates.project_id = params.projectId;
    // Clearing project must also clear department (DB CHECK constraint)
    if (params.projectId === null) updates.department_id = null;
  }
  if (params.departmentId !== undefined) updates.department_id = params.departmentId;

  const { data, error } = await supabase
    .from('agent_keys')
    .update(updates)
    .eq('id', params.id)
    .select(KEY_COLUMNS)
    .single();

  if (error) throw error;
  const updated = data as Omit<AgentKey, 'key_hash'>;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: params.id,
    eventType: 'agent_key.updated',
    actorType: 'human',
    actorId: params.actorId,
    actorLabel: 'admin',
    source: 'ui',
    workspaceId: params.workspaceId,
  });

  return updated;
}

export class KeyNotPendingError extends Error {
  constructor() {
    super('This key is no longer waiting for approval.');
    this.name = 'KeyNotPendingError';
  }
}

/**
 * Approve or reject a key that an agent created while human approval was
 * required. Only keys still marked pending are changed, so a stale page
 * can't flip a key someone else already decided on. A rejected key stays
 * rejected: agents can't switch it on, only a human can.
 */
export async function decideAgentKeyApproval(
  supabase: SupabaseClient,
  params: { id: string; decision: 'approve' | 'reject'; actorId: string; workspaceId: string },
): Promise<Omit<AgentKey, 'key_hash'>> {
  const approve = params.decision === 'approve';

  const { data, error } = await supabase
    .from('agent_keys')
    .update({ approval_status: approve ? 'approved' : 'rejected', is_active: approve })
    .eq('id', params.id)
    .eq('approval_status', 'pending')
    .select(KEY_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new KeyNotPendingError();
  const key = data as Omit<AgentKey, 'key_hash'>;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: params.id,
    eventType: approve ? 'agent_key.approved' : 'agent_key.rejected',
    actorType: 'human',
    actorId: params.actorId,
    actorLabel: 'admin',
    source: 'ui',
    workspaceId: params.workspaceId,
  });

  return key;
}

export async function rotateAgentKey(
  supabase: SupabaseClient,
  params: { id: string; actorId: string; workspaceId: string },
): Promise<{ key: Omit<AgentKey, 'key_hash'>; fullKey: string }> {
  const { fullKey, prefix, hash } = await generateKey(params.id);

  const { data, error } = await supabase
    .from('agent_keys')
    .update({ key_hash: hash, key_prefix: prefix })
    .eq('id', params.id)
    .select(KEY_COLUMNS)
    .single();

  if (error) throw error;
  const key = data as Omit<AgentKey, 'key_hash'>;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: params.id,
    eventType: 'agent_key.rotated',
    actorType: 'human',
    actorId: params.actorId,
    actorLabel: 'admin',
    source: 'ui',
    workspaceId: params.workspaceId,
  });

  return { key, fullKey };
}

export async function getAgentKeyPermissions(
  supabase: SupabaseClient,
  keyId: string,
): Promise<
  (AgentPermission & { projects?: { name: string }; departments?: { name: string } | null })[]
> {
  const { data, error } = await supabase
    .from('agent_permissions')
    .select('*, projects(name), departments(name)')
    .eq('agent_key_id', keyId);

  if (error) throw error;
  type PermissionWithRelations = AgentPermission & {
    projects?: { name: string };
    departments?: { name: string } | null;
  };
  return data as PermissionWithRelations[];
}

export async function updateAgentKeyPermissions(
  supabase: SupabaseClient,
  params: {
    keyId: string;
    permissions: Array<{
      projectId: string;
      departmentId?: string | null;
      canRead: boolean;
      canCreate: boolean;
      canUpdate: boolean;
      canAssign: boolean;
      canComment: boolean;
      canArchive: boolean;
    }>;
    actorId: string;
    workspaceId: string;
  },
): Promise<void> {
  // Block permission grants on inactive keys (pending approval or deactivated)
  const { data: targetKey } = await supabase
    .from('agent_keys')
    .select('is_active')
    .eq('id', params.keyId)
    .single();

  if (targetKey && !targetKey.is_active && params.permissions.length > 0) {
    throw new Error('Cannot update permissions on an inactive key. Activate the key first.');
  }

  const rows = params.permissions.map((p) => ({
    project_id: p.projectId,
    department_id: p.departmentId ?? null,
    can_read: p.canRead,
    can_create: p.canCreate,
    can_update: p.canUpdate,
    can_assign: p.canAssign,
    can_comment: p.canComment,
    can_archive: p.canArchive,
  }));

  const { error: rpcError } = await supabase.rpc('update_agent_permissions', {
    p_key_id: params.keyId,
    p_rows: rows,
  });

  if (rpcError) throw rpcError;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: params.keyId,
    eventType: 'agent_key.permissions_updated',
    newValue: params.permissions,
    actorType: 'human',
    actorId: params.actorId,
    actorLabel: 'admin',
    source: 'ui',
    workspaceId: params.workspaceId,
  });
}
