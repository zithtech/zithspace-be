// One-off: apply the client documents → project linkage migration.
// Idempotent — uses ADD COLUMN / CREATE INDEX IF NOT EXISTS only.
//
// Usage:
//   node scripts/run-documents-project-link-migration.js

const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { Client } = require("pg");

const SQL_PATH = path.resolve(
  __dirname,
  "..",
  "src",
  "migrations",
  "phase3_client_documents_project_link.sql",
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
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'client_documents_v2'
          AND column_name = 'project_id'`,
    );
    if (check.rows.length > 0) {
      console.log("✓ client_documents_v2.project_id present");
    } else {
      console.warn("⚠ project_id column not found — check migration output");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("✗ migration failed:", err.message);
  process.exit(1);
});
