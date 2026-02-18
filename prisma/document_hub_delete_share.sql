-- =========================
-- Alter: document_hub
-- =========================
ALTER TABLE "document_hub"
ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;


-- =========================
-- Alter: documents
-- =========================
ALTER TABLE "documents"
ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT,
ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private',
ADD COLUMN "share_token" TEXT,
ADD COLUMN "shared_by_id" TEXT,
ADD COLUMN "shared_at" TIMESTAMP(3);


-- =========================
-- Alter: documenttree
-- =========================
ALTER TABLE "documenttree"
ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;


-- =========================
-- Foreign Keys
-- =========================
ALTER TABLE "document_hub"
ADD CONSTRAINT "document_hub_deleted_by_id_fkey"
FOREIGN KEY ("deleted_by_id")
REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


ALTER TABLE "documents"
ADD CONSTRAINT "documents_deleted_by_id_fkey"
FOREIGN KEY ("deleted_by_id")
REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


ALTER TABLE "documents"
ADD CONSTRAINT "documents_shared_by_id_fkey"
FOREIGN KEY ("shared_by_id")
REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


ALTER TABLE "documenttree"
ADD CONSTRAINT "documenttree_deleted_by_id_fkey"
FOREIGN KEY ("deleted_by_id")
REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
