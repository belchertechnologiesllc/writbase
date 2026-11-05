-- Track where each agent key stands with human approval.
-- Before this, a key waiting for approval was just "inactive" and looked the
-- same as a deactivated one, so the dashboard couldn't show an approval queue.
--
--   not_required  created by a human, or approval wasn't required
--   pending       an agent created it and a human hasn't decided yet
--   approved      a human approved it (or switched it on by hand)
--   rejected      a human rejected it
--
-- Only a human decision moves a key out of pending or rejected.

ALTER TABLE agent_keys
  ADD COLUMN approval_status text NOT NULL DEFAULT 'not_required'
  CONSTRAINT agent_keys_approval_status_valid
    CHECK (approval_status IN ('not_required', 'pending', 'approved', 'rejected'));

-- A pending or rejected key can never be active. This also stops a manager
-- agent from switching on a key a human hasn't approved, or has rejected.
ALTER TABLE agent_keys
  ADD CONSTRAINT agent_keys_unapproved_not_active
  CHECK (approval_status NOT IN ('pending', 'rejected') OR is_active = false);

-- Backfill: an inactive key that was created pending approval is still
-- pending unless a person acted on it afterwards (dashboard or CLI, which
-- logs as 'system'). Agent-side renames, prompt changes and rotations
-- don't count as an approval decision.
UPDATE agent_keys k
SET approval_status = 'pending'
WHERE k.is_active = false
  AND EXISTS (
    SELECT 1
    FROM event_log p
    WHERE p.target_type = 'agent_key'
      AND p.target_id = k.id
      AND p.event_type = 'agent_key.pending_approval'
      AND NOT EXISTS (
        SELECT 1
        FROM event_log h
        WHERE h.target_type = 'agent_key'
          AND h.target_id = k.id
          AND h.actor_type <> 'agent'
          AND h.created_at > p.created_at
      )
  );

-- Speeds up the pending-approval count shown in the sidebar.
CREATE INDEX agent_keys_pending_approval_idx
  ON agent_keys (workspace_id)
  WHERE approval_status = 'pending';
