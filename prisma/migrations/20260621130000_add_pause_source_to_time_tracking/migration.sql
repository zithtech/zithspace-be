-- AlterTable
ALTER TABLE "time_tracking_entries" ADD COLUMN     "pause_source" TEXT;
ALTER TABLE "time_tracking_entries" ADD COLUMN     "paused_at" TIMESTAMP(3);
