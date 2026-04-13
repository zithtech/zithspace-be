import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create a new pool using the connection string from environment variables
// This pool was added to support raw PostgreSQL queries specifically for the Leads module
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Add error handler to the pool
pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
    process.exit(-1);
});

export default pool;