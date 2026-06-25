// src/db/onboardingPool.ts
//
// Dedicated PostgreSQL connection pool for the Employee Onboarding module.
//
// WHY a separate pool (not Prisma):
//   The onboarding controllers are being migrated to pure raw SQL. They share
//   the SAME physical tables as the rest of the app (`employees`,
//   `employee_addresses`, `employee_work_details`, …) — these stay defined in
//   schema.prisma so other modules (leave-v2, attendance, payroll) keep working
//   unchanged. Only the *data access* in the onboarding controllers moves off
//   Prisma onto this pool. Mirrors src/db/attendancePool.ts and the Leave 2.0
//   module.
//
// THE CRITICAL INVARIANT — tenant isolation:
//   `withTenant()` is the ONLY sanctioned way to run a query here. It checks out
//   a single connection, opens a transaction, sets the tenant GUC as a
//   transaction-LOCAL setting (so it can never bleed into the next user of that
//   pooled connection), and runs every query on that same connection. The
//   `employees`/`employee_addresses` tables also carry a `tenant_id` column that
//   every query filters on explicitly — belt and suspenders, because raw SQL has
//   no ORM safety net. Child tables (addresses aside) are scoped through their
//   parent employee's id; callers verify the parent employee belongs to the
//   tenant before touching children.

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('[onboarding] DATABASE_URL is not set — cannot create pg pool');
}

// Managed Postgres providers require SSL. Detect from the connection string so
// local Postgres stays plaintext while hosted DBs negotiate TLS.
const needsSsl = /sslmode=require|amazonaws\.com|neon\.tech|supabase|render\.com|\.cloud/i.test(
  connectionString
);

export const onboardingPool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.ONBOARDING_PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'onboarding',
});

onboardingPool.on('error', (err) => {
  // Errors on idle clients must be handled or they crash the process.
  console.error('[onboarding] unexpected error on idle pool client:', err);
});

const TENANT_SETTING = 'app.current_tenant_id';

/**
 * A connection already scoped to a single tenant + transaction.
 * Controllers receive this and must NOT reach for `onboardingPool` directly.
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
 *  - `app.current_tenant_id` is set transaction-LOCAL, so it is discarded on
 *    COMMIT/ROLLBACK and never leaks to the next borrower of the connection.
 *  - The whole unit of work is atomic: throw anywhere and everything rolls back.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: TenantClient) => Promise<T>
): Promise<T> {
  if (!tenantId) {
    throw new Error('[onboarding] withTenant requires a non-empty tenantId');
  }

  const client: PoolClient = await onboardingPool.connect();
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
export async function closeOnboardingPool(): Promise<void> {
  await onboardingPool.end();
}
