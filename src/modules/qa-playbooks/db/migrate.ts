// src/modules/qa-playbooks/db/migrate.ts
//
// Minimal forward-only SQL migration runner for QA Playbooks. Applies every
// *.sql file in ./migrations in lexical order exactly once, tracking applied
// files in qa_playbook_migrations. Each file runs in its own transaction.
//
// Run:  npx ts-node -r tsconfig-paths/register src/modules/qa-playbooks/db/migrate.ts
// or:   npm run playbooks:migrate

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { playbookPool, closePlaybookPool } from './pool';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await playbookPool.query(`
    CREATE TABLE IF NOT EXISTS qa_playbook_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedFilenames(): Promise<Set<string>> {
  const { rows } = await playbookPool.query<{ filename: string }>(
    'SELECT filename FROM qa_playbook_migrations'
  );
  return new Set(rows.map((r) => r.filename));
}

export async function runPlaybookMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedFilenames();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log('[qa-playbooks] migrations: nothing to apply, schema is up to date');
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await playbookPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO qa_playbook_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[qa-playbooks] applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[qa-playbooks] FAILED migration: ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`[qa-playbooks] migrations complete (${pending.length} applied)`);
}

// Allow direct execution as a script.
if (require.main === module) {
  runPlaybookMigrations()
    .then(() => closePlaybookPool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      closePlaybookPool().finally(() => process.exit(1));
    });
}
