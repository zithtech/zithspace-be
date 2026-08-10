// src/modules/hotspot/db/migrate.ts
//
// Minimal forward-only SQL migration runner for the Hotspot module.
//
// Why hand-rolled (not prisma migrate): this module is pure raw SQL and its
// tables live outside schema.prisma. The runner applies every *.sql file in
// ./migrations in lexical order exactly once, tracking applied files in
// hs_migrations. Each file runs inside its own transaction.
//
// Run:  npx ts-node -r tsconfig-paths/register src/modules/hotspot/db/migrate.ts

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { hsPool, closeHotspotPool } from './pool';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await hsPool.query(`
    CREATE TABLE IF NOT EXISTS hs_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedFilenames(): Promise<Set<string>> {
  const { rows } = await hsPool.query<{ filename: string }>('SELECT filename FROM hs_migrations');
  return new Set(rows.map((r) => r.filename));
}

export async function runHotspotMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedFilenames();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log('[hotspot] migrations: nothing to apply, schema is up to date');
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await hsPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO hs_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[hotspot] applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[hotspot] FAILED migration: ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`[hotspot] migrations complete (${pending.length} applied)`);
}

// Allow direct execution as a script.
if (require.main === module) {
  runHotspotMigrations()
    .then(() => closeHotspotPool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      closeHotspotPool().finally(() => process.exit(1));
    });
}
