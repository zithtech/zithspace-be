// src/modules/pipeline/db/migrate.ts
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { pipelinePool, closePipelinePool } from './pool';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pipelinePool.query(`
    CREATE TABLE IF NOT EXISTS pipeline_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedFilenames(): Promise<Set<string>> {
  const { rows } = await pipelinePool.query<{ filename: string }>('SELECT filename FROM pipeline_migrations');
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
    console.log('[pipeline] migrations: nothing to apply, schema is up to date');
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pipelinePool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO pipeline_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[pipeline] applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[pipeline] FAILED migration: ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`[pipeline] migrations complete (${pending.length} applied)`);
}

if (require.main === module) {
  runMigrations()
    .then(() => closePipelinePool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      closePipelinePool().finally(() => process.exit(1));
    });
}
