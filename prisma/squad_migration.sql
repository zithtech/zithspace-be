-- Manual migration for Squad and SquadMember tables
-- Run this in your PostgreSQL database to fix the "table does not exist" error

-- ==========================================
-- SQUAD TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS "squad" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "squad_name" VARCHAR(100) NOT NULL,
    "squad_code" VARCHAR(50) NOT NULL,
    "squad_status" BOOLEAN DEFAULT true NOT NULL,
    "is_archived" BOOLEAN DEFAULT false NOT NULL,
    "is_deleted" BOOLEAN DEFAULT false NOT NULL,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID,
    
    CONSTRAINT fk_squad_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_squad_created_by FOREIGN KEY (created_by_id) REFERENCES users(id),
    CONSTRAINT fk_squad_updated_by FOREIGN KEY (updated_by_id) REFERENCES users(id)
);

-- ==========================================
-- SQUAD_MEMBERS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS "squad_members" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "squad_id" UUID NOT NULL,
    "squad_member_id" UUID NOT NULL,
    "member_type" VARCHAR(50) NOT NULL,
    "status" BOOLEAN DEFAULT true NOT NULL,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID,
    
    CONSTRAINT fk_squad_members_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_squad_members_squad FOREIGN KEY (squad_id) REFERENCES squad(id) ON DELETE CASCADE,
    CONSTRAINT fk_squad_members_member FOREIGN KEY (squad_member_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_squad_members_created_by FOREIGN KEY (created_by_id) REFERENCES users(id),
    CONSTRAINT fk_squad_members_updated_by FOREIGN KEY (updated_by_id) REFERENCES users(id)
);

-- Create index for faster tenant-based lookups
CREATE INDEX IF NOT EXISTS "idx_squad_tenant" ON "squad"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_squad_members_squad" ON "squad_members"("squad_id");
