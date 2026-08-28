// src/modules/yapiez/db/migrate.ts
//
// Minimal forward-only SQL migration runner for Yapiez. Applies every *.sql
// file in ./migrations in lexical order exactly once, tracking applied files
// in yapiez_migrations. Each file runs in its own transaction.
//
// Run:  npx ts-node -r tsconfig-paths/register src/modules/yapiez/db/migrate.ts
// or:   npm run yapiez:migrate

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { yapiezPool, closeYapiezPool } from './pool';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await yapiezPool.query(`
    CREATE TABLE IF NOT EXISTS yapiez_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedFilenames(): Promise<Set<string>> {
  const { rows } = await yapiezPool.query<{ filename: string }>(
    'SELECT filename FROM yapiez_migrations'
  );
  return new Set(rows.map((r) => r.filename));
}

export async function runYapiezMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedFilenames();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log('[yapiez] migrations: nothing to apply, schema is up to date');
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await yapiezPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO yapiez_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[yapiez] applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[yapiez] FAILED migration: ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`[yapiez] migrations complete (${pending.length} applied)`);
}

// Allow direct execution as a script.
if (require.main === module) {
  runYapiezMigrations()
    .then(() => closeYapiezPool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      closeYapiezPool().finally(() => process.exit(1));
    });
}
