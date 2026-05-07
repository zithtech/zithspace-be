-- Add a monotonic version counter to documents for optimistic concurrency control.
-- Existing rows start at 1; every update bumps it.
ALTER TABLE "documents" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
