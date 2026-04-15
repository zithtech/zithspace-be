import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Raw Database Pool for direct SQL queries
 * Fulfills requirement for "No Prisma/Models" in specific modules
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Log pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

export const dbPool = {
  /**
   * Execute a raw query
   */
  query: (text: string, params: any[] = []) => pool.query(text, params),
  
  /**
   * Execute a query and return rows
   */
  rows: async <T = any>(text: string, params: any[] = []): Promise<T[]> => {
    const res = await pool.query(text, params);
    return res.rows;
  },

  /**
   * Execute a query and return a single row
   */
  one: async <T = any>(text: string, params: any[] = []): Promise<T | null> => {
    const res = await pool.query(text, params);
    return res.rows[0] || null;
  },

  /**
   * Get a client from the pool for transactions
   */
  getClient: () => pool.connect(),
};

export default dbPool;
