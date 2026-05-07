-- Per-user "stars" / favorites for document hubs.
-- One row per (user, hub). Unique constraint prevents duplicate stars.
CREATE TABLE IF NOT EXISTS "document_hub_stars" (
    "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_id"     UUID        NOT NULL,
    "hub_id"      UUID        NOT NULL,
    "tenant_id"   UUID        NOT NULL,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "document_hub_stars_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_hub_stars_user_hub_unique" UNIQUE ("user_id", "hub_id")
);

CREATE INDEX IF NOT EXISTS "document_hub_stars_user_idx"
    ON "document_hub_stars" ("user_id");
CREATE INDEX IF NOT EXISTS "document_hub_stars_hub_idx"
    ON "document_hub_stars" ("hub_id");
CREATE INDEX IF NOT EXISTS "document_hub_stars_tenant_idx"
    ON "document_hub_stars" ("tenant_id");
