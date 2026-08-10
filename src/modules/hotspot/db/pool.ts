// src/modules/hotspot/db/pool.ts
//
// Dedicated PostgreSQL connection pool for the Hotspot module.
//
// WHY a separate pool (not Prisma):
//   Hotspot is a pure raw-SQL module. It owns its own pg.Pool pointed at the
//   same DATABASE_URL as the rest of the app, so its data access is fully
//   decoupled from Prisma. It owns its own `hs_*` tables and never touches a
//   Prisma-managed one for writes.
//
// THE CRITICAL INVARIANT — tenant isolation:
//   The platform enforces multi-tenancy through Postgres RLS, which reads
//   `current_setting('app.current_tenant_id')`. Prisma sets that on its own
//   connection inside resolveTenant middleware. A raw query on a *different*
//   connection has NO such context — so it would either be blocked by RLS or, if
//   RLS is bypassed, leak every tenant's rows.
//
//   `withTenant()` below is the ONLY sanctioned way to run a query in this
//   module. It checks out a single connection, opens a transaction, sets the
//   tenant GUC as a transaction-LOCAL setting (so it can never bleed into the
//   next user of that pooled connection), and runs all repo queries on that same
//   connection. Repositories ALSO filter `tenant_id = $1` explicitly — belt and
//   suspenders, because raw SQL has no ORM safety net.

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('[hotspot] DATABASE_URL is not set — cannot create pg pool');
}

// Managed Postgres providers require SSL. Detect from the connection string so
// local Postgres stays plaintext while hosted DBs negotiate TLS.
const needsSsl = /sslmode=require|amazonaws\.com|neon\.tech|supabase|render\.com|\.cloud/i.test(
  connectionString
);

export const hsPool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.HS_PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'hotspot',
});

hsPool.on('error', (err) => {
  // Errors on idle clients must be handled or they crash the process.
  console.error('[hotspot] unexpected error on idle pool client:', err);
});

const TENANT_SETTING = 'app.current_tenant_id';

/**
 * A connection already scoped to a single tenant + transaction.
 * Repositories receive this and must NOT reach for `hsPool` directly.
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
    throw new Error('[hotspot] withTenant requires a non-empty tenantId');
  }

  const client: PoolClient = await hsPool.connect();
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
export async function closeHotspotPool(): Promise<void> {
  await hsPool.end();
}
