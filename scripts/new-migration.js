#!/usr/bin/env node
/**
 * Usage: node scripts/new-migration.js <migration_name>
 *
 * Generates a migration by diffing the actual DB against schema.prisma,
 * strips FK constraints that can never be applied due to column type mismatches,
 * saves the result to prisma/migrations/<timestamp>_<name>/migration.sql,
 * then runs prisma migrate deploy + prisma generate.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const name = process.argv[2];
if (!name) {
  console.error('Usage: node scripts/new-migration.js <migration_name>');
  process.exit(1);
}

// FK constraints that can never be applied due to permanent column type mismatches (uuid vs text)
const SKIP_CONSTRAINTS = [
  'employee_work_details_position_id_fkey',
  'reimbursements_created_by_id_fkey',
];

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not found in .env');
  process.exit(1);
}

console.log('Generating migration diff...');
let sql;
try {
  sql = execSync(
    `npx prisma migrate diff --from-url "${dbUrl}" --to-schema-datamodel prisma/schema.prisma --script`,
    { encoding: 'utf8' }
  );
} catch (e) {
  console.error('prisma migrate diff failed:', e.message);
  process.exit(1);
}

if (!sql.trim()) {
  console.log('No changes detected. Schema and DB are already in sync.');
  process.exit(0);
}

// Strip incompatible FK constraint blocks (each block is 2 lines: comment + ALTER TABLE)
for (const constraint of SKIP_CONSTRAINTS) {
  const re = new RegExp(`-- AddForeignKey\\nALTER TABLE "[^"]+" ADD CONSTRAINT "${constraint}"[^\\n]+\\n`, 'g');
  const before = sql;
  sql = sql.replace(re, '');
  if (sql !== before) {
    console.log(`Skipped incompatible FK constraint: ${constraint}`);
  }
}

// Remove trailing blank lines left by removed blocks
sql = sql.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';

// Check if anything remains after stripping
const meaningful = sql.replace(/--[^\n]*/g, '').trim();
if (!meaningful) {
  console.log('Only incompatible FK constraints were pending. Nothing to migrate.');
  process.exit(0);
}

// Create timestamped migration folder
const timestamp = new Date().toISOString().replace(/[-T:]/g, '').slice(0, 14);
const migrationName = `${timestamp}_${name}`;
const migrationDir = path.join('prisma', 'migrations', migrationName);
fs.mkdirSync(migrationDir, { recursive: true });

const migrationFile = path.join(migrationDir, 'migration.sql');
fs.writeFileSync(migrationFile, sql, 'utf8');
console.log(`Migration saved: ${migrationFile}`);
console.log('');

console.log('Applying migration...');
try {
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
} catch (e) {
  console.error('migrate deploy failed. Run: npx prisma migrate resolve --rolled-back ' + migrationName);
  process.exit(1);
}

console.log('');
console.log('Regenerating Prisma client...');
execSync('npx prisma generate', { stdio: 'inherit' });

console.log('');
console.log(`Done! Migration "${migrationName}" applied successfully.`);
