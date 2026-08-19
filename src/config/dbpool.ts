import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create a new pool using the connection string from environment variables
// This pool was added to support raw PostgreSQL queries specifically for the Leads module
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,               // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased from 2s → 10s to prevent spurious timeouts
});

// Add error handler to the pool
pool.on('error', (err) => {
  // Log but do NOT exit – a single idle client drop should not kill the server
  console.error('Unexpected error on idle PostgreSQL client', err);
});

export default pool;
