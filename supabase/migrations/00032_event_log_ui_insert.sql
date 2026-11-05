-- Let signed-in dashboard users write their own audit log entries.
--
-- event_log only had a SELECT policy, so every dashboard action that logs an
-- admin event (create/update/rotate keys, permissions, projects, departments,
-- approve/reject) made its change, then failed to log it and reported an
-- error. Admin log failures are treated as fatal by the app.
--
-- Scope is narrow: only human/ui events, only in the user's own workspaces,
-- and only under their own user id, so nobody can forge agent or system
-- entries or write into another workspace.

CREATE POLICY ws_insert_event_log_human ON event_log
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT get_user_workspace_ids())
    AND actor_type = 'human'
    AND source = 'ui'
    AND actor_id = auth.uid()::text
  );
