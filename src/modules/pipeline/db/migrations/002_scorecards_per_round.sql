-- src/modules/pipeline/db/migrations/002_scorecards_per_round.sql

-- Drop the dependent table first
DROP TABLE IF EXISTS pipeline_evaluations;

-- Drop the old criteria table
DROP TABLE IF EXISTS pipeline_scorecard_criteria;

-- Recreate criteria tied to round_id instead of config_id
CREATE TABLE pipeline_scorecard_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  round_id uuid NOT NULL REFERENCES pipeline_interview_rounds(id) ON DELETE CASCADE,
  criteria_name varchar NOT NULL,
  weight_percentage numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Recreate evaluations
CREATE TABLE pipeline_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  interview_id uuid NOT NULL REFERENCES pipeline_interviews(id) ON DELETE CASCADE,
  criteria_id uuid NOT NULL REFERENCES pipeline_scorecard_criteria(id) ON DELETE CASCADE,
  interviewer_id uuid NOT NULL,
  score numeric NOT NULL, -- 1-10 or 1-5 or 1-100
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);
