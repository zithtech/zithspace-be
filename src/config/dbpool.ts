import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create a new pool using the connection string from environment variables
// This pool was added to support raw PostgreSQL queries specifically for the Leads module
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,               // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased from 2s → 10s to prevent spurious timeouts
});

// Add error handler to the pool
pool.on('error', (err) => {
  // Log but do NOT exit – a single idle client drop should not kill the server
  console.error('Unexpected error on idle PostgreSQL client', err);
});

// ─────────────────────────────────────────────────────────────────────────────
// Tenant-scoped access (RLS foundation)
//
// The plain `pool.query(...)` default export sets NO tenant context — it is safe
// only for tables WITHOUT row-level security, and every such query must filter
// `tenant_id` by hand. As core tables migrate onto Postgres RLS (see the
// `hotspot` module for the reference pattern), their reads/writes must run
// through `withTenant()` below instead, so the database itself enforces the
// tenant boundary.
//
// `withTenant()` checks out ONE connection, opens a transaction, sets
// `app.current_tenant_id` as a transaction-LOCAL setting (the `true` 3rd arg, so
// it is discarded on COMMIT/ROLLBACK and can never bleed into the next borrower
// of the pooled connection), and runs every query in `fn` on that same
// connection. RLS policies read that GUC via `current_setting`. Repositories
// SHOULD still filter `tenant_id = $1` explicitly — belt and suspenders, because
// raw SQL has no ORM safety net.
// ─────────────────────────────────────────────────────────────────────────────

const TENANT_SETTING = 'app.current_tenant_id';

/** A connection already scoped to one tenant + transaction. */
export interface TenantClient {
  readonly tenantId: string;
  query<R extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<R>>;
}

/**
 * Run `fn` inside a tenant-scoped transaction.
 *
 * Guarantees: all queries via the provided client run on ONE connection;
 * `app.current_tenant_id` is set transaction-local; the whole unit of work is
 * atomic (throw anywhere and everything rolls back). Use for EVERY data
 * operation on an RLS-protected table — including pure reads.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: TenantClient) => Promise<T>
): Promise<T> {
  if (!tenantId) {
    throw new Error('[dbpool] withTenant requires a non-empty tenantId');
  }

  const client: PoolClient = await pool.connect();
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

export default pool;
