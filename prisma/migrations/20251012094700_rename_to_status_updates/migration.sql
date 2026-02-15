/*
  Warnings:

  - You are about to drop the `daily_updates` table. If the table is not empty, all the data it contains will be lost.

*/


-- CreateTable
CREATE TABLE "status_updates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "project_updates" JSONB NOT NULL DEFAULT '[]',
    "mood" TEXT,
    "total_hours_worked" DECIMAL(5,2),
    "general_notes" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "status_updates_tenant_id_date_idx" ON "status_updates"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "status_updates_user_id_date_idx" ON "status_updates"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "status_updates_user_id_date_tenant_id_key" ON "status_updates"("user_id", "date", "tenant_id");

-- AddForeignKey
ALTER TABLE "status_updates" ADD CONSTRAINT "status_updates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_updates" ADD CONSTRAINT "status_updates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
