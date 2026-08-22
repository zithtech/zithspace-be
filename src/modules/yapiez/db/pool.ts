// src/modules/yapiez/db/pool.ts
//
// Dedicated PostgreSQL connection pool for Yapiez.
//
// WHY a separate pool (not Prisma):
//   Yapiez owns the `yapiez_*` tables outright. They live outside
//   schema.prisma and are managed exclusively by this module's forward-only
//   migration runner, the same way company-details and payroll do it.
//
// THE CRITICAL INVARIANT — tenant isolation:
//   Multi-tenancy is enforced through Postgres RLS, which reads
//   `current_setting('app.current_tenant_id')`. Prisma sets that on its own
//   connection inside resolveTenant; a raw query on a *different* connection
//   has no such context. `withTenant()` is the ONLY sanctioned way to query
//   here: it checks out a connection, opens a transaction, sets the tenant GUC
//   transaction-LOCAL (so it cannot bleed into the next borrower of the pooled
//   connection) and runs every repo query on it. Repositories ALSO filter
//   `tenant_id = $1` explicitly — belt and suspenders.

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('[yapiez] DATABASE_URL is not set — cannot create pg pool');
}

// Managed Postgres providers require SSL. Detect from the connection string so
// local Postgres stays plaintext while hosted DBs negotiate TLS.
const needsSsl = /sslmode=require|amazonaws\.com|neon\.tech|supabase|render\.com|\.cloud/i.test(
  connectionString
);

export const yapiezPool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.YAPIEZ_PG_POOL_MAX ?? 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'yapiez',
});

yapiezPool.on('error', (err) => {
  // Errors on idle clients must be handled or they crash the process.
  console.error('[yapiez] unexpected error on idle pool client:', err);
});

const TENANT_SETTING = 'app.current_tenant_id';

/**
 * A connection already scoped to a single tenant + transaction.
 * Repositories receive this and must NOT reach for `yapiezPool` directly.
 */
export interface TenantClient {
  readonly tenantId: string;
  query<R extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<R>>;
}

/**
 * Run `fn` inside a tenant-scoped transaction. Use this for EVERY data
 * operation in the module — including pure reads.
 *
 * Note for the flow runner: a run can take tens of seconds, which is far too
 * long to hold a transaction open. The runner therefore performs many SHORT
 * withTenant() calls (one per persisted checkpoint) rather than wrapping the
 * whole execution in one — see services/flowRunner.ts.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: TenantClient) => Promise<T>
): Promise<T> {
  if (!tenantId) {
    throw new Error('[yapiez] withTenant requires a non-empty tenantId');
  }

  const client: PoolClient = await yapiezPool.connect();
  try {
    await client.query('BEGIN');
    // Transaction-local GUC: discarded on COMMIT/ROLLBACK. This is what RLS reads.
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
export async function closeYapiezPool(): Promise<void> {
  await yapiezPool.end();
}
