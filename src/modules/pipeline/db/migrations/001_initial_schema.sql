-- src/modules/pipeline/db/migrations/001_initial_schema.sql

CREATE TABLE IF NOT EXISTS pipeline_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  role varchar NOT NULL,
  name varchar NOT NULL,
  mobile varchar,
  email varchar,
  total_experience numeric,
  current_ctc numeric,
  expected_ctc numeric,
  resume_url varchar,
  status varchar NOT NULL DEFAULT 'New', -- New, Interviewing, Offered, Rejected
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, mobile)
);

CREATE TABLE IF NOT EXISTS pipeline_interview_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  role varchar NOT NULL,
  min_experience numeric,
  max_experience numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_interview_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  config_id uuid NOT NULL REFERENCES pipeline_interview_configs(id) ON DELETE CASCADE,
  round_number int NOT NULL,
  round_name varchar NOT NULL,
  round_type varchar NOT NULL,
  is_start_round boolean NOT NULL DEFAULT false,
  is_final_round boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_scorecard_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  config_id uuid NOT NULL REFERENCES pipeline_interview_configs(id) ON DELETE CASCADE,
  criteria_name varchar NOT NULL,
  weight_percentage numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  candidate_id uuid NOT NULL REFERENCES pipeline_candidates(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES pipeline_interview_rounds(id) ON DELETE CASCADE,
  scheduled_date date,
  scheduled_time time,
  duration_minutes int,
  mode varchar, -- Online, Offline
  location_or_link varchar,
  notes text,
  time_zone varchar,
  status varchar NOT NULL DEFAULT 'Scheduled', -- Scheduled, Completed, Cancelled
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_interviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  interview_id uuid NOT NULL REFERENCES pipeline_interviews(id) ON DELETE CASCADE,
  interviewer_id uuid NOT NULL, -- FK to users table but keeping it loosely coupled
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  interview_id uuid NOT NULL REFERENCES pipeline_interviews(id) ON DELETE CASCADE,
  criteria_id uuid NOT NULL REFERENCES pipeline_scorecard_criteria(id) ON DELETE CASCADE,
  interviewer_id uuid NOT NULL,
  score numeric NOT NULL, -- 1-10 or 1-5
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  candidate_id uuid NOT NULL REFERENCES pipeline_candidates(id) ON DELETE CASCADE,
  salary numeric NOT NULL,
  status varchar NOT NULL DEFAULT 'Draft', -- Draft, Pending Approval, Approved, Sent, Accepted, Rejected
  document_url varchar,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  candidate_id uuid NOT NULL REFERENCES pipeline_candidates(id) ON DELETE CASCADE,
  subject varchar,
  body text,
  status varchar NOT NULL DEFAULT 'Sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  sender_id uuid
);

CREATE TABLE IF NOT EXISTS pipeline_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  candidate_id uuid NOT NULL REFERENCES pipeline_candidates(id) ON DELETE CASCADE,
  user_id uuid, -- User who performed the action
  action_type varchar NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
