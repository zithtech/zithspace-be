// One-off: apply the lead_source_kind + company-block migration.
// Idempotent — uses ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
//
// Usage:
//   node scripts/run-lead-source-kind-migration.js

const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { Client } = require("pg");

const SQL_PATH = path.resolve(
  __dirname,
  "..",
  "src",
  "migrations",
  "add_lead_source_kind_and_company_fields.sql",
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
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'leads'
          AND column_name IN (
            'lead_source_kind','company','company_domain',
            'company_size','inquiry_message','website_source'
          )
        ORDER BY column_name`,
    );
    console.log("✓ columns present:");
    for (const row of check.rows) {
      console.log(`   - ${row.column_name} (${row.data_type})`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("✗ migration failed:", err.message);
  process.exit(1);
});
