-- Track who actually created a lead. Until now the FE was falling back to
-- the currently-signed-in user, which made every legacy row look like it
-- was created by whoever was viewing the page.
--
-- users.id is TEXT in this schema, so the FK column matches.

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_created_by
    ON leads (tenant_id, created_by)
    WHERE created_by IS NOT NULL;

-- Backfill: use the first lead activity log entry of action='CREATED_LEAD'
-- as a best-effort source for who created each row. lead_activity_logs.performed_by
-- is UUID and users.id is TEXT containing UUID strings, so cast to text.
-- Only fills NULLs so we don't stomp anything written by future inserts.
UPDATE leads l
   SET created_by = a.performed_by::text
  FROM (
    SELECT DISTINCT ON (lead_id) lead_id, performed_by
      FROM lead_activity_logs
     WHERE action = 'CREATED_LEAD'
       AND performed_by IS NOT NULL
     ORDER BY lead_id, created_at ASC
  ) a
 WHERE l.id = a.lead_id
   AND l.created_by IS NULL;
