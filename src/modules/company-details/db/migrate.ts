// src/modules/company-details/db/migrate.ts
//
// Minimal forward-only SQL migration runner for the Company Details module.
// Applies every *.sql file in ./migrations in lexical order exactly once,
// tracking applied files in cd_migrations. Each file runs in its own tx.
//
// Run:  npx ts-node -r tsconfig-paths/register src/modules/company-details/db/migrate.ts
// or:   npm run cd:migrate

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { cdPool, closeCompanyDetailsPool } from './pool';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await cdPool.query(`
    CREATE TABLE IF NOT EXISTS cd_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedFilenames(): Promise<Set<string>> {
  const { rows } = await cdPool.query<{ filename: string }>('SELECT filename FROM cd_migrations');
  return new Set(rows.map((r) => r.filename));
}

export async function runCompanyDetailsMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedFilenames();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log('[company-details] migrations: nothing to apply, schema is up to date');
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await cdPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO cd_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[company-details] applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[company-details] FAILED migration: ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`[company-details] migrations complete (${pending.length} applied)`);
}

// Allow direct execution as a script.
if (require.main === module) {
  runCompanyDetailsMigrations()
    .then(() => closeCompanyDetailsPool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      closeCompanyDetailsPool().finally(() => process.exit(1));
    });
}
