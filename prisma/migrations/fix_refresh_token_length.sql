-- Fix refresh_tokens.token column to support longer JWT tokens
-- Change from VARCHAR(500) to TEXT to accommodate JWT tokens of any length

ALTER TABLE refresh_tokens 
ALTER COLUMN token TYPE TEXT;

-- The unique constraint and index will be preserved automatically
