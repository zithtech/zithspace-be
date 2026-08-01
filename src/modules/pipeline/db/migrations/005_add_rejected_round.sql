ALTER TABLE pipeline_candidates ADD COLUMN rejected_round_id uuid REFERENCES pipeline_interview_rounds(id) ON DELETE SET NULL;
