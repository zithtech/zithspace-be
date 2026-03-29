-- CreateTable
CREATE TABLE "analytics" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_pkey" PRIMARY KEY ("id")
);
