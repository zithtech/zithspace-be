// src/db/onboardingSchema.ts
//
// Idempotent schema bootstrap for the Employee Onboarding module's own tables.
// Like the leave-v2 / attendance raw-SQL modules, the onboarding invite table is
// managed here (NOT in schema.prisma) and created at app boot via
// `CREATE TABLE IF NOT EXISTS`. Run from startServer() in src/app.ts.

import { onboardingPool } from "./onboardingPool";

export async function ensureOnboardingSchema(): Promise<void> {
  await onboardingPool.query(`
    CREATE TABLE IF NOT EXISTS employee_onboarding_invites (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    uuid NOT NULL,
      employee_id  uuid NOT NULL,
      token_hash   text NOT NULL,
      sections     text[] NOT NULL DEFAULT ARRAY['personal','bank','history']::text[],
      status       text NOT NULL DEFAULT 'invited',
      expires_at   timestamptz NOT NULL,
      created_by   uuid,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      submitted_at timestamptz,
      completed_at timestamptz
    );
  `);

  // token_hash is the public lookup key — globally unique.
  await onboardingPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_invites_token
      ON employee_onboarding_invites (token_hash);
  `);
  await onboardingPool.query(`
    CREATE INDEX IF NOT EXISTS ix_onboarding_invites_tenant
      ON employee_onboarding_invites (tenant_id);
  `);
  await onboardingPool.query(`
    CREATE INDEX IF NOT EXISTS ix_onboarding_invites_employee
      ON employee_onboarding_invites (employee_id);
  `);

  // ── Tenant catalog of "documents needed" from a previous employer ─────────
  // HR curates this list (offer letter, Form 16, payslips, …). The public
  // onboarding form renders it per Employment-History entry so the new hire can
  // upload each, and may also add their own ad-hoc types.
  await onboardingPool.query(`
    CREATE TABLE IF NOT EXISTS onboarding_document_types (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   uuid NOT NULL,
      name        text NOT NULL,
      description text,
      is_active   boolean NOT NULL DEFAULT true,
      created_by  uuid,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted_at  timestamptz
    );
  `);
  await onboardingPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_doc_types_tenant_name
      ON onboarding_document_types (tenant_id, lower(name))
      WHERE deleted_at IS NULL;
  `);
  await onboardingPool.query(`
    CREATE INDEX IF NOT EXISTS ix_onboarding_doc_types_tenant
      ON onboarding_document_types (tenant_id) WHERE deleted_at IS NULL;
  `);

  // Link uploaded previous-employer documents to the specific Employment-History
  // row. employee_documents is a Prisma-managed table; we add the column with a
  // raw, idempotent ALTER (this module is raw-SQL by design).
  await onboardingPool.query(`
    ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS experience_id uuid;
  `);
  await onboardingPool.query(`
    CREATE INDEX IF NOT EXISTS ix_employee_documents_experience
      ON employee_documents (experience_id);
  `);

  console.log("✅ Employee onboarding tables ensured (invites, document types)");
}
