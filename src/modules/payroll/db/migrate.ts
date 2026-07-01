// src/modules/payroll/db/migrate.ts
//
// Minimal forward-only SQL migration runner for the Payroll 2.0 module.
//
// Why hand-rolled (not prisma migrate): this module is pure raw SQL and its
// tables live outside schema.prisma. The runner applies every *.sql file in
// ./migrations in lexical order exactly once, tracking applied files in
// pay_migrations. Each file runs inside its own transaction.
//
// Payroll grows across many slices (settings → components → structures →
// statutory → pay runs …), so forward-only numbered migrations are the right
// fit — each new slice adds NNN_*.sql without touching what shipped before.
//
// Run:  npx ts-node -r tsconfig-paths/register src/modules/payroll/db/migrate.ts
// or:   npm run pay:migrate
// Also invoked automatically at app boot from startServer() in src/app.ts.

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { payrollPool, closePayrollPool } from './pool';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await payrollPool.query(`
    CREATE TABLE IF NOT EXISTS pay_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedFilenames(): Promise<Set<string>> {
  const { rows } = await payrollPool.query<{ filename: string }>('SELECT filename FROM pay_migrations');
  return new Set(rows.map((r) => r.filename));
}

export async function runPayrollMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedFilenames();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log('[payroll] migrations: nothing to apply, schema is up to date');
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await payrollPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO pay_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[payroll] applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[payroll] FAILED migration: ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`[payroll] migrations complete (${pending.length} applied)`);
}

// Allow direct execution as a script.
if (require.main === module) {
  runPayrollMigrations()
    .then(() => closePayrollPool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      closePayrollPool().finally(() => process.exit(1));
    });
}
