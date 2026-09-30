// src/modules/mail-templates/db/migrate.ts
//
// Minimal forward-only SQL migration runner for the Mail Templates module.
// Applies every *.sql file in ./migrations in lexical order exactly once,
// tracking applied files in mt_migrations. Each file runs in its own tx.
//
// Run:  npx ts-node -r tsconfig-paths/register src/modules/mail-templates/db/migrate.ts
// or:   npm run mt:migrate

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { mtPool, closeMailTemplatePool } from './pool';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await mtPool.query(`
    CREATE TABLE IF NOT EXISTS mt_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedFilenames(): Promise<Set<string>> {
  const { rows } = await mtPool.query<{ filename: string }>('SELECT filename FROM mt_migrations');
  return new Set(rows.map((r) => r.filename));
}

export async function runMailTemplateMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedFilenames();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log('[mail-templates] migrations: nothing to apply, schema is up to date');
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await mtPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO mt_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[mail-templates] applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[mail-templates] FAILED migration: ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`[mail-templates] migrations complete (${pending.length} applied)`);
}

if (require.main === module) {
  runMailTemplateMigrations()
    .then(() => closeMailTemplatePool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      closeMailTemplatePool().finally(() => process.exit(1));
    });
}
