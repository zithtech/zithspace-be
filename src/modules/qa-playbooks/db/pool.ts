// src/modules/qa-playbooks/db/pool.ts
//
// Dedicated PostgreSQL connection pool for QA Playbooks.
//
// WHY a separate pool (not Prisma):
//   QA Playbooks owns the `qa_playbook*` tables outright. They live outside
//   schema.prisma and are managed exclusively by this module's forward-only
//   migration runner, the same way yapiez, company-details and payroll do it.
//
// THE CRITICAL INVARIANT — tenant isolation:
//   `withTenant()` is the ONLY sanctioned way to query here: it checks out a
//   connection, opens a transaction, sets `app.current_tenant_id`
//   transaction-LOCAL (so it cannot bleed into the next borrower of the pooled
//   connection) and runs every repo query on it. Repositories ALSO filter on
//   tenant explicitly — belt and suspenders.
//
// ONE DELIBERATE ASYMMETRY vs yapiez:
//   Global playbooks are Testiez-maintained content with `tenant_id IS NULL`.
//   Every tenant reads them; nobody writes them but the boot-time content sync.
//   Repository reads therefore filter `(tenant_id = $1 OR tenant_id IS NULL)`,
//   while every write path pins `tenant_id = $1`.

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('[qa-playbooks] DATABASE_URL is not set — cannot create pg pool');
}

// Managed Postgres providers require SSL. Detect from the connection string so
// local Postgres stays plaintext while hosted DBs negotiate TLS.
const needsSsl = /sslmode=require|amazonaws\.com|neon\.tech|supabase|render\.com|\.cloud/i.test(
  connectionString
);

export const playbookPool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.QA_PLAYBOOKS_PG_POOL_MAX ?? 4),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'qa_playbooks',
});

playbookPool.on('error', (err) => {
  // Errors on idle clients must be handled or they crash the process.
  console.error('[qa-playbooks] unexpected error on idle pool client:', err);
});

const TENANT_SETTING = 'app.current_tenant_id';

/**
 * A connection already scoped to a single tenant + transaction.
 * Repositories receive this and must NOT reach for `playbookPool` directly.
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
    throw new Error('[qa-playbooks] withTenant requires a non-empty tenantId');
  }

  const client: PoolClient = await playbookPool.connect();
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
export async function closePlaybookPool(): Promise<void> {
  await playbookPool.end();
}
