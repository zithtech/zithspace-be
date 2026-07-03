// src/modules/reimbursement-v2/db/migrate.ts
//
// Minimal forward-only SQL migration runner for the Reimbursement 2.0 module.
//
// Why hand-rolled (not prisma migrate): this module is pure raw SQL and its
// tables live outside schema.prisma. The runner applies every *.sql file in
// ./migrations in lexical order exactly once, tracking applied files in
// rb2_migrations. Each file runs inside its own transaction.
//
// Run:  npx ts-node -r tsconfig-paths/register src/modules/reimbursement-v2/db/migrate.ts
// or:   npm run rb2:migrate

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { rb2Pool, closeReimbursementV2Pool } from './pool';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await rb2Pool.query(`
    CREATE TABLE IF NOT EXISTS rb2_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedFilenames(): Promise<Set<string>> {
  const { rows } = await rb2Pool.query<{ filename: string }>('SELECT filename FROM rb2_migrations');
  return new Set(rows.map((r) => r.filename));
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedFilenames();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log('[reimbursement-v2] migrations: nothing to apply, schema is up to date');
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await rb2Pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO rb2_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[reimbursement-v2] applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[reimbursement-v2] FAILED migration: ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`[reimbursement-v2] migrations complete (${pending.length} applied)`);
}

// Allow direct execution as a script.
if (require.main === module) {
  runMigrations()
    .then(() => closeReimbursementV2Pool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      closeReimbursementV2Pool().finally(() => process.exit(1));
    });
}
