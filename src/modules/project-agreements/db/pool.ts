// src/modules/project-agreements/db/pool.ts
//
// Dedicated PostgreSQL connection pool for Project Agreements.
//
// WHY a separate pool (not Prisma):
//   This module owns the `pa_*` tables outright. They live outside
//   schema.prisma and are managed exclusively by the forward-only migration
//   runner next to this file, the same way qa-playbooks, company-details and
//   payroll do it.
//
// THE CRITICAL INVARIANT — tenant isolation:
//   `withTenant()` is the ONLY sanctioned way to query here. It checks out a
//   connection, opens a transaction, sets `app.current_tenant_id`
//   transaction-LOCAL (so it cannot bleed into the next borrower of the pooled
//   connection) and runs every repository query on it. Repositories ALSO filter
//   on tenant explicitly — belt and suspenders, matching the RLS policies in
//   migration 001.
//
// NO GLOBAL ROWS. Unlike qa-playbooks there is no `tenant_id IS NULL` content
// here: an agreement template is a company's own legal wording, never shared.

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('[project-agreements] DATABASE_URL is not set — cannot create pg pool');
}

// Managed Postgres providers require SSL. Detect from the connection string so
// local Postgres stays plaintext while hosted DBs negotiate TLS.
const needsSsl = /sslmode=require|amazonaws\.com|neon\.tech|supabase|render\.com|\.cloud/i.test(
  connectionString
);

export const agreementPool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PROJECT_AGREEMENTS_PG_POOL_MAX ?? 4),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'project_agreements',
});

agreementPool.on('error', (err) => {
  // Errors on idle clients must be handled or they crash the process.
  console.error('[project-agreements] unexpected error on idle pool client:', err);
});

const TENANT_SETTING = 'app.current_tenant_id';

/**
 * A connection already scoped to a single tenant + transaction.
 * Repositories receive this and must NOT reach for `agreementPool` directly.
 */
export interface TenantClient {
  readonly tenantId: string;
  query<R extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<R>>;
}

/** Run `fn` inside a tenant-scoped transaction. Use for EVERY data operation. */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: TenantClient) => Promise<T>
): Promise<T> {
  if (!tenantId) {
    throw new Error('[project-agreements] withTenant requires a non-empty tenantId');
  }

  const client: PoolClient = await agreementPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', [TENANT_SETTING, tenantId]);

    const scoped: TenantClient = {
      tenantId,
      query: (text, params) => client.query(text, params),
    };

    const result = await fn(scoped);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure; surface the original error
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Close the pool (call from graceful shutdown). */
export async function closeAgreementPool(): Promise<void> {
  await agreementPool.end();
}
