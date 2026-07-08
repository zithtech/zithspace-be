import fs from "fs";
import path from "path";
import pool from "../config/dbpool";

async function run() {
  try {
    const sqlPath = path.join(
      __dirname,
      "../database/migrations/014_create_dashboard_settings.sql",
    );
    const sql = fs.readFileSync(sqlPath, "utf-8");
    console.log("Executing migration 014_create_dashboard_settings.sql...");
    await pool.query(sql);
    console.log("Migration successful.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    pool.end();
  }
}

run();
