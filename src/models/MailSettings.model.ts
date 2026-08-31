import pool from "../config/dbpool";
import crypto from 'crypto';


export interface MailSettings {
  id: string;
  tenant_id: string;
  provider: string;
  email: string;
  is_verified: boolean;
  verified_at?: Date;
  verification_token?: string;
  verification_sent_at?: Date;
  verification_expires_at?: Date;
  is_default_invoice_mail: boolean;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  enable_ssl: boolean;
  integration_id?: string;
  metadata?: any;
  created_by: string;
  updated_by?: string;
  created_at: Date;
  updated_at: Date;
}

export class MailSettingsModel {
  static async getByTenantId(tenantId: string, userId?: string): Promise<MailSettings[]> {
    let query = `
      SELECT * FROM mail_settings 
      WHERE tenant_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    let values = [tenantId];
    if (userId) {
      query = `
        SELECT * FROM mail_settings 
        WHERE tenant_id = $1 AND created_by = $2 AND deleted_at IS NULL
        ORDER BY created_at DESC
      `;
      values.push(userId);
    }
    const result = await pool.query(query, values);
    return result.rows;
  }

  static async getById(id: string, tenantId: string): Promise<MailSettings | null> {
    const query = `
      SELECT * FROM mail_settings 
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
    `;
    const result = await pool.query(query, [id, tenantId]);
    return result.rows[0] || null;
  }

  static async getByEmail(email: string, tenantId: string, userId?: string): Promise<MailSettings | null> {
    const query = `
      SELECT * FROM mail_settings 
      WHERE email = $1 AND tenant_id = $2 AND deleted_at IS NULL
    `;
    const result = await pool.query(query, [email, tenantId]);
    return result.rows[0] || null;
  }

  static async upsert(data: Partial<MailSettings> & { tenant_id: string; email: string; created_by: string }): Promise<MailSettings> {
    const existing = await this.getByEmail(data.email, data.tenant_id, data.created_by);

    if (existing) {
      const setClause: string[] = [];
      const values: any[] = [];
      let i = 1;

      Object.entries(data).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'tenant_id' && key !== 'email' && value !== undefined) {
          setClause.push(`${key} = $${i++}`);
          values.push(value);
        }
      });

      setClause.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(existing.id);

      const query = `
        UPDATE mail_settings 
        SET ${setClause.join(', ')} 
        WHERE id = $${i} 
        RETURNING *
      `;
      const result = await pool.query(query, values);
      return result.rows[0];
    } else {
      const id = crypto.randomUUID();
      const keys = ['id', ...Object.keys(data)];
      const placeholders = keys.map((_, idx) => `$${idx + 1}`);
      const values = [id, ...Object.values(data)];

      const query = `
        INSERT INTO mail_settings (${keys.join(', ')}) 
        VALUES (${placeholders.join(', ')}) 
        RETURNING *
      `;
      const result = await pool.query(query, values);
      return result.rows[0];
    }
  }

  static async markAsVerified(id: string, tenantId: string): Promise<void> {
    try {
      const query = `
        UPDATE mail_settings 
        SET is_verified = TRUE, 
            verified_at = CURRENT_TIMESTAMP, 
            verification_token = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND tenant_id = $2
      `;
      await pool.query(query, [id, tenantId]);
    } catch (e: any) {
      console.error("[MailSettingsModel] markAsVerified error:", e);
      // Fallback for missing verified_at column or NOT NULL constraint on verification_token
      const queryFallback = `
        UPDATE mail_settings 
        SET is_verified = TRUE, 
            verification_token = '',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND tenant_id = $2
      `;
      await pool.query(queryFallback, [id, tenantId]);
    }
  }

  static async setAsDefault(id: string, tenantId: string, userId?: string): Promise<void> {
    // Transaction to unset others and set this one
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (userId) {
        await client.query(
          'UPDATE mail_settings SET is_default_invoice_mail = FALSE WHERE tenant_id = $1 AND created_by = $2',
          [tenantId, userId]
        );
        await client.query(
          'UPDATE mail_settings SET is_default_invoice_mail = TRUE WHERE id = $1 AND tenant_id = $2 AND created_by = $3',
          [id, tenantId, userId]
        );
      } else {
        await client.query(
          'UPDATE mail_settings SET is_default_invoice_mail = FALSE WHERE tenant_id = $1',
          [tenantId]
        );
        await client.query(
          'UPDATE mail_settings SET is_default_invoice_mail = TRUE WHERE id = $1 AND tenant_id = $2',
          [id, tenantId]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async getByToken(token: string): Promise<MailSettings | null> {
    try {
      const query = `
        SELECT * FROM mail_settings 
        WHERE verification_token = $1 AND CAST(verification_expires_at AS timestamp) > CURRENT_TIMESTAMP AND deleted_at IS NULL
      `;
      const result = await pool.query(query, [token]);
      return result.rows[0] || null;
    } catch (e: any) {
      console.error("[MailSettingsModel] getByToken error:", e);
      // Fallback: check expiration in Node instead of Postgres if CAST fails or deleted_at causes issue
      try {
        const query = `
          SELECT * FROM mail_settings 
          WHERE verification_token = $1
        `;
        const result = await pool.query(query, [token]);
        const row = result.rows[0];
        if (row && row.verification_expires_at) {
          const expiresAt = new Date(row.verification_expires_at);
          if (expiresAt > new Date()) {
            return row;
          }
        }
        return null;
      } catch (innerError) {
        console.error("[MailSettingsModel] getByToken fallback error:", innerError);
        throw innerError;
      }
    }
  }

  static async getDefaultVerified(tenantId: string, userId?: string): Promise<MailSettings | null> {
    let query = `
      SELECT * FROM mail_settings 
      WHERE tenant_id = $1 AND is_verified = TRUE AND is_default_invoice_mail = TRUE AND deleted_at IS NULL
    `;
    let values = [tenantId];
    if (userId) {
      query = `
        SELECT * FROM mail_settings 
        WHERE tenant_id = $1 AND created_by = $2 AND is_verified = TRUE AND is_default_invoice_mail = TRUE AND deleted_at IS NULL
      `;
      values.push(userId);
    }
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }
}


// comments added in mailsettings for build
