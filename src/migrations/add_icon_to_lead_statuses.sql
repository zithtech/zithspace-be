-- Pipeline statuses get an optional icon handle (e.g. 'flag', 'trophy').
-- The FE renders it via a small status-specific icon registry — the column
-- just stores the string key.

ALTER TABLE lead_statuses
    ADD COLUMN IF NOT EXISTS icon VARCHAR(40);
