-- Project Agreements — an agreement no longer has to belong to a project (007)
--
-- The original design assumed every document was raised AGAINST a project, so
-- project_id was NOT NULL. In practice plenty of paper is signed before a
-- project exists at all — an NDA, a master services agreement, a proposal that
-- is what wins the work. Forcing one of those onto an unrelated project to get
-- past a required field is worse than leaving the link empty.
--
-- project_name / project_code were already nullable snapshots, and the renderer
-- already drops a summary row with nothing in it, so a document with no project
-- simply prints without that row.

ALTER TABLE pa_agreements
  ALTER COLUMN project_id DROP NOT NULL;
