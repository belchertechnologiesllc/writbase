-- Track agent keys that are waiting for human approval.
-- Before this, a pending key was just "inactive" and looked the same as a
-- deactivated one, so the dashboard couldn't show an approval queue.

ALTER TABLE agent_keys
  ADD COLUMN pending_approval boolean NOT NULL DEFAULT false;

-- A key waiting for approval can never be active. This also stops a manager
-- agent from creating a pending key and then switching it on itself.
ALTER TABLE agent_keys
  ADD CONSTRAINT agent_keys_pending_not_active
  CHECK (NOT (pending_approval AND is_active));

-- Backfill: inactive keys whose most recent admin event is the
-- "pending approval" event were never approved or rejected.
UPDATE agent_keys k
SET pending_approval = true
WHERE k.is_active = false
  AND (
    SELECT e.event_type
    FROM event_log e
    WHERE e.target_type = 'agent_key'
      AND e.target_id = k.id
    ORDER BY e.created_at DESC
    LIMIT 1
  ) = 'agent_key.pending_approval';

-- Speeds up the pending-approval count shown in the sidebar.
CREATE INDEX agent_keys_pending_approval_idx
  ON agent_keys (workspace_id)
  WHERE pending_approval;
