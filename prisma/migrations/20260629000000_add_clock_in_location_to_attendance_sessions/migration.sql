-- Capture the geolocation where each work session was started (clock-in / resume).
-- All columns are nullable: location is best-effort and never blocks attendance.
ALTER TABLE "attendance_sessions"
  ADD COLUMN "clock_in_latitude"  DOUBLE PRECISION,
  ADD COLUMN "clock_in_longitude" DOUBLE PRECISION,
  ADD COLUMN "clock_in_accuracy"  DOUBLE PRECISION,
  ADD COLUMN "clock_in_address"   TEXT;
