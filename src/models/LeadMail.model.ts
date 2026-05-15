import pool from "../config/dbpool";

export interface LeadMail {
  id: string;
  tenantId: string;
  leadId: string;
  sentBy: string;
  recipientEmail: string;
  subject: string;
  body: string;
  attachments?: any;
  sentAt: Date;
}

export interface CreateLeadMailData {
  tenantId: string;
  leadId: string;
  sentBy: string;
  recipientEmail: string;
  subject: string;
  body: string;
  attachments?: any;
}

function mapRowToLeadMail(row: any): LeadMail {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    sentBy: row.sent_by,
    recipientEmail: row.recipient_email,
    subject: row.subject,
    body: row.body,
    attachments: row.attachments,
    sentAt: row.sent_at,
  };
}

export class LeadMailModel {
  /**
   * Create a new lead mail entry
   */
  static async create(data: CreateLeadMailData): Promise<LeadMail> {
    const query = `
      INSERT INTO lead_mails (
        tenant_id, lead_id, sent_by, recipient_email, subject, body, attachments
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const values = [
      data.tenantId,
      data.leadId,
      data.sentBy,
      data.recipientEmail,
      data.subject,
      data.body,
      data.attachments ? JSON.stringify(data.attachments) : JSON.stringify([]),
    ];

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        const result = await client.query(query, values);
        
        // Also update the lead's is_mail_sent status
        await client.query(
          `UPDATE leads SET is_mail_sent = TRUE WHERE id = $1 AND tenant_id = $2`,
          [data.leadId, data.tenantId]
        );
        
        await client.query('COMMIT');
        return mapRowToLeadMail(result.rows[0]);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error('DATABASE ERROR in LeadMailModel.create:', error.message);
      throw error;
    }
  }

  /**
   * Get all mails for a specific lead
   */
  static async findByLeadId(leadId: string, tenantId: string): Promise<LeadMail[]> {
    const query = `
      SELECT * FROM lead_mails 
      WHERE lead_id = $1 AND tenant_id = $2
      ORDER BY sent_at DESC
    `;
    const result = await pool.query(query, [leadId, tenantId]);
    return result.rows.map(mapRowToLeadMail);
  }

  /**
   * Get the last sent mail for a specific lead
   */
  static async getLastMailByLeadId(leadId: string, tenantId: string): Promise<LeadMail | null> {
    const query = `
      SELECT * FROM lead_mails 
      WHERE lead_id = $1 AND tenant_id = $2
      ORDER BY sent_at DESC
      LIMIT 1
    `;
    const result = await pool.query(query, [leadId, tenantId]);
    return result.rows.length > 0 ? mapRowToLeadMail(result.rows[0]) : null;
  }
}
