// One-off: apply the client-portal module-settings migration via the project's
// pg client. Idempotent — uses CREATE TABLE / INDEX IF NOT EXISTS only.
//
// Usage:
//   node scripts/run-portal-module-settings-migration.js

const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { Client } = require("pg");

const SQL_PATH = path.resolve(
  __dirname,
  "..",
  "src",
  "migrations",
  "phase4_client_portal_module_settings.sql",
);

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql = fs.readFileSync(SQL_PATH, "utf8");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    console.log(`→ applying ${path.basename(SQL_PATH)}`);
    await client.query(sql);
    console.log("✓ migration applied");

    const check = await client.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'client_portal_module_settings'`,
    );
    console.log("✓ tables present:");
    for (const row of check.rows) console.log("   -", row.table_name);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("✗ migration failed:", err.message);
  process.exit(1);
});
