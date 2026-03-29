-- Convert uuid columns to text to match referenced table id types
-- Safe operation: every uuid value is a valid text string
ALTER TABLE "employee_work_details" ALTER COLUMN "position_id" TYPE TEXT USING "position_id"::TEXT;
ALTER TABLE "reimbursements" ALTER COLUMN "created_by_id" TYPE TEXT USING "created_by_id"::TEXT;
