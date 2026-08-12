// src/modules/company-details/db/pool.ts
//
// Dedicated PostgreSQL connection pool for the Company Details module.
//
// WHY a separate pool (not Prisma):
//   Company Details replaces the old Prisma-managed `company_locations` table
//   with a pure raw-SQL module. Its tables (`cd_*`) live outside schema.prisma
//   and are managed exclusively by this module's migration runner.
//
// THE CRITICAL INVARIANT — tenant isolation:
//   The platform enforces multi-tenancy through Postgres RLS, which reads
//   `current_setting('app.current_tenant_id')`. Prisma sets that on its own
//   connection inside resolveTenant middleware; a raw query on a *different*
//   connection has no such context. `withTenant()` below is the ONLY sanctioned
//   way to run a query here: it checks out one connection, opens a transaction,
//   sets the tenant GUC transaction-LOCAL (so it can never bleed into the next
//   borrower of the pooled connection) and runs every repo query on it.
//   Repositories ALSO filter `tenant_id = $1` explicitly — belt and suspenders.

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('[company-details] DATABASE_URL is not set — cannot create pg pool');
}

// Managed Postgres providers require SSL. Detect from the connection string so
// local Postgres stays plaintext while hosted DBs negotiate TLS.
const needsSsl = /sslmode=require|amazonaws\.com|neon\.tech|supabase|render\.com|\.cloud/i.test(
  connectionString
);

export const cdPool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.CD_PG_POOL_MAX ?? 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'company-details',
});

cdPool.on('error', (err) => {
  // Errors on idle clients must be handled or they crash the process.
  console.error('[company-details] unexpected error on idle pool client:', err);
});

const TENANT_SETTING = 'app.current_tenant_id';

/**
 * A connection already scoped to a single tenant + transaction.
 * Repositories receive this and must NOT reach for `cdPool` directly.
 */
export interface TenantClient {
  readonly tenantId: string;
  query<R extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<R>>;
}

/**
 * Run `fn` inside a tenant-scoped transaction. Use this for EVERY data
 * operation in the module — including pure reads.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: TenantClient) => Promise<T>
): Promise<T> {
  if (!tenantId) {
    throw new Error('[company-details] withTenant requires a non-empty tenantId');
  }

  const client: PoolClient = await cdPool.connect();
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
export async function closeCompanyDetailsPool(): Promise<void> {
  await cdPool.end();
}
