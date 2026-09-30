// src/modules/mail-templates/db/pool.ts
//
// Dedicated PostgreSQL connection pool for the Mail Templates module.
//
// WHY a separate pool (not Prisma):
//   `mt_mail_templates` lives outside schema.prisma and is managed exclusively
//   by this module's migration runner, matching the other raw-SQL modules
//   (company-details, opening-management, project-agreements).
//
// THE CRITICAL INVARIANT — tenant isolation:
//   Multi-tenancy is enforced by Postgres RLS reading
//   `current_setting('app.current_tenant_id')`. A raw query on a pooled
//   connection has no such context unless we set it, so `withTenant()` below is
//   the ONLY sanctioned way to run a query here: one connection, one
//   transaction, the tenant GUC set transaction-LOCAL so it can never bleed
//   into the next borrower. Repositories ALSO filter `tenant_id = $1`
//   explicitly — the tables this module READS (client_contacts_v2, users) carry
//   no RLS policy at all, so that filter is not belt-and-braces there, it is
//   the only thing separating tenants.

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('[mail-templates] DATABASE_URL is not set — cannot create pg pool');
}

// Managed Postgres providers require SSL. Detect from the connection string so
// local Postgres stays plaintext while hosted DBs negotiate TLS.
const needsSsl = /sslmode=require|amazonaws\.com|neon\.tech|supabase|render\.com|\.cloud/i.test(
  connectionString
);

export const mtPool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.MT_PG_POOL_MAX ?? 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'mail-templates',
});

mtPool.on('error', (err) => {
  // Errors on idle clients must be handled or they crash the process.
  console.error('[mail-templates] unexpected error on idle pool client:', err);
});

const TENANT_SETTING = 'app.current_tenant_id';

/**
 * A connection already scoped to a single tenant + transaction.
 * Repositories receive this and must NOT reach for `mtPool` directly.
 */
export interface TenantClient {
  readonly tenantId: string;
  query<R extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<R>>;
}

export async function withTenant<T>(
  tenantId: string,
  fn: (client: TenantClient) => Promise<T>
): Promise<T> {
  if (!tenantId) {
    throw new Error('[mail-templates] withTenant requires a non-empty tenantId');
  }

  const client: PoolClient = await mtPool.connect();
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
      // ignore rollback failure — the original error is the interesting one
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closeMailTemplatePool(): Promise<void> {
  await mtPool.end();
}
