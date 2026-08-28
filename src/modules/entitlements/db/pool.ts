// src/modules/entitlements/db/pool.ts
//
// Dedicated PostgreSQL connection pool for the Entitlements module.
//
// WHY a separate pool (not Prisma):
//   `ent_tenant_entitlements` lives outside schema.prisma — the same
//   arrangement the company-details, leave-v2 and payroll modules use.
//
//   Unlike those, this module has NO migration runner. The table is created by
//   running db/ddl/tenant_entitlements.sql by hand in psql or a SQL IDE.
//   Nothing in the app's startup path will create it.
//
// THE CRITICAL INVARIANT — tenant isolation:
//   The platform enforces multi-tenancy through Postgres RLS, which reads
//   `current_setting('app.current_tenant_id')`. A raw query on a pooled
//   connection has no such context unless we set it. `withTenant()` below is
//   the ONLY sanctioned way to read entitlements: it checks out a connection,
//   opens a transaction, sets the tenant GUC transaction-LOCAL (so it can never
//   bleed into the next borrower) and runs the query on it. Queries ALSO filter
//   `tenant_id = $1` explicitly — belt and suspenders.
//
// POOL SIZE:
//   Entitlement reads are tiny and served from an in-process cache on the hot
//   path (see entitlements.service.ts), so this pool stays deliberately small.

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('[entitlements] DATABASE_URL is not set — cannot create pg pool');
}

// Managed Postgres providers require SSL. Detect from the connection string so
// local Postgres stays plaintext while hosted DBs negotiate TLS.
const needsSsl = /sslmode=require|amazonaws\.com|neon\.tech|supabase|render\.com|\.cloud/i.test(
  connectionString
);

export const entPool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.ENT_PG_POOL_MAX ?? 3),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'entitlements',
});

entPool.on('error', (err) => {
  // Errors on idle clients must be handled or they crash the process.
  console.error('[entitlements] unexpected error on idle pool client:', err);
});

const TENANT_SETTING = 'app.current_tenant_id';

/**
 * A connection already scoped to a single tenant + transaction.
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
    throw new Error('[entitlements] withTenant requires a non-empty tenantId');
  }

  const client: PoolClient = await entPool.connect();
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
export async function closeEntitlementsPool(): Promise<void> {
  await entPool.end();
}
