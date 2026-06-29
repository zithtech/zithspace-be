// src/modules/performance-report/db/pool.ts
//
// Dedicated PostgreSQL connection pool for the Performance Report module.
//
// WHY a separate pool (not Prisma):
//   Performance Report is a pure raw-SQL module (per product directive). It owns
//   its own pg.Pool pointed at the same DATABASE_URL as the rest of the app, so
//   its data access is fully decoupled from Prisma. Mirrors src/modules/leave-v2
//   and src/db/onboardingPool.ts.
//
// THE CRITICAL INVARIANT — tenant isolation:
//   `withTenant()` is the ONLY sanctioned way to run a query in this module. It
//   checks out a single connection, opens a transaction, sets the tenant GUC as
//   a transaction-LOCAL setting (so it can never bleed into the next user of the
//   pooled connection), and runs all repo queries on that same connection.
//   Repositories ALSO filter `tenant_id = $1` explicitly — belt and suspenders,
//   because raw SQL has no ORM safety net.

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('[performance-report] DATABASE_URL is not set — cannot create pg pool');
}

// Managed Postgres providers require SSL. Detect from the connection string so
// local Postgres stays plaintext while hosted DBs negotiate TLS.
const needsSsl = /sslmode=require|amazonaws\.com|neon\.tech|supabase|render\.com|\.cloud/i.test(
  connectionString
);

export const perfReportPool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PRR_PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'performance-report',
});

perfReportPool.on('error', (err) => {
  // Errors on idle clients must be handled or they crash the process.
  console.error('[performance-report] unexpected error on idle pool client:', err);
});

const TENANT_SETTING = 'app.current_tenant_id';

/**
 * A connection already scoped to a single tenant + transaction.
 * Repositories receive this and must NOT reach for `perfReportPool` directly.
 */
export interface TenantClient {
  readonly tenantId: string;
  query<R extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<R>>;
}

/**
 * Run `fn` inside a tenant-scoped transaction.
 *
 * Guarantees:
 *  - All queries via the provided client run on ONE connection.
 *  - `app.current_tenant_id` is set transaction-LOCAL (the `true` 3rd arg), so
 *    it is automatically discarded on COMMIT/ROLLBACK and never leaks to the
 *    next borrower of this pooled connection.
 *  - The whole unit of work is atomic: throw anywhere and everything rolls back.
 *
 * Use this for EVERY data operation in the module — including pure reads.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: TenantClient) => Promise<T>
): Promise<T> {
  if (!tenantId) {
    throw new Error('[performance-report] withTenant requires a non-empty tenantId');
  }

  const client: PoolClient = await perfReportPool.connect();
  try {
    await client.query('BEGIN');
    // Transaction-local GUC: scoped to this tx only. This is what RLS reads.
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
export async function closePerfReportPool(): Promise<void> {
  await perfReportPool.end();
}
