import pool from '../config/dbpool';

let tableReady = false;

export class DeletedMemberModel {
  /**
   * Ensures the deleted_members table exists. Safe to call multiple times —
   * after the first successful creation, subsequent calls are no-ops.
   */
  static async ensureTable(): Promise<void> {
    if (tableReady) return;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS deleted_members (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          is_permanent BOOLEAN DEFAULT false
        );
      `);
      tableReady = true;
      console.log('✅ deleted_members lookup table initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing deleted_members lookup table:', error);
      throw error;
    }
  }
}
