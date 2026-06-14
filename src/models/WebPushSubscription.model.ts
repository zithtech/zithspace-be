import pool from '@/config/dbpool';

export interface WebPushSubscriptionData {
  id?: string;
  userId: string;
  endpoint: string;
  keysAuth: string;
  keysP256dh: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class WebPushSubscriptionModel {
  /**
   * Initializes the database table and index for push subscriptions.
   */
  static async initTable(): Promise<void> {
    const tableQuery = `
      CREATE TABLE IF NOT EXISTS web_push_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        keys_auth TEXT NOT NULL,
        keys_p256dh TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    const indexQuery = `
      CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_id 
      ON web_push_subscriptions(user_id);
    `;

    try {
      await pool.query(tableQuery);
      await pool.query(indexQuery);
      console.log('✅ WebPushSubscription database table initialized');
    } catch (error) {
      console.error('❌ Error initializing web_push_subscriptions table:', error);
      throw error;
    }
  }

  /**
   * Creates or updates a subscription (upsert on endpoint).
   */
  static async save(userId: string, endpoint: string, keysAuth: string, keysP256dh: string): Promise<any> {
    const query = `
      INSERT INTO web_push_subscriptions (user_id, endpoint, keys_auth, keys_p256dh, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (endpoint) 
      DO UPDATE SET 
        user_id = EXCLUDED.user_id,
        keys_auth = EXCLUDED.keys_auth,
        keys_p256dh = EXCLUDED.keys_p256dh,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [userId, endpoint, keysAuth, keysP256dh];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Finds subscriptions by a list of user IDs.
   */
  static async getSubscriptionsByUserIds(userIds: string[]): Promise<any[]> {
    if (!userIds || userIds.length === 0) return [];
    
    const query = `
      SELECT id, user_id as "userId", endpoint, keys_auth as "keysAuth", keys_p256dh as "keysP256dh"
      FROM web_push_subscriptions
      WHERE user_id = ANY($1);
    `;
    const result = await pool.query(query, [userIds]);
    return result.rows;
  }

  /**
   * Deletes a subscription by its endpoint (used when browser push service returns 410 Gone).
   */
  static async deleteByEndpoint(endpoint: string): Promise<boolean> {
    const query = `
      DELETE FROM web_push_subscriptions
      WHERE endpoint = $1;
    `;
    const result = await pool.query(query, [endpoint]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Resolves a list of emails to active user IDs.
   */
  static async findUserIdsByEmails(emails: string[]): Promise<string[]> {
    if (!emails || emails.length === 0) return [];
    
    // Normalize emails to lowercase for matching
    const normalizedEmails = emails.map(e => e.trim().toLowerCase());
    
    const query = `
      SELECT id 
      FROM users 
      WHERE is_active = true 
        AND (LOWER(work_email) = ANY($1) OR LOWER(personal_email) = ANY($1));
    `;
    
    const result = await pool.query(query, [normalizedEmails]);
    return result.rows.map(row => row.id);
  }
}
