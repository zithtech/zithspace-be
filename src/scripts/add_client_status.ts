import pool from "../config/dbpool";

async function addClientStatus() {
  console.log("Connecting to database...");
  try {
    const query = `
      ALTER TABLE invoices 
      ADD COLUMN IF NOT EXISTS client_status VARCHAR(50) DEFAULT 'UNPAID';
    `;
    console.log("Running query:", query);
    await pool.query(query);
    console.log("Migration successful. Added client_status column to invoices table.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    pool.end();
  }
}

addClientStatus();
