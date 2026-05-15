import pool from "../config/dbpool";

export interface LeadActivityLog {
  id: string;
  tenantId: string;
  leadId: string;
  action: string;
  performedBy: string;
  metadata?: any;
  createdAt: Date;
}

export interface CreateLeadActivityLogData {
  tenantId: string;
  leadId: string;
  action: string;
  performedBy: string;
  metadata?: any;
}

function mapRowToLeadActivityLog(row: any): LeadActivityLog {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    action: row.action,
    performedBy: row.performed_by,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export class LeadActivityLogModel {
  /**
   * Create a new lead activity log entry
   */
  static async create(data: CreateLeadActivityLogData): Promise<LeadActivityLog> {
    const query = `
      INSERT INTO lead_activity_logs (
        tenant_id, lead_id, action, performed_by, metadata
      ) 
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [
      data.tenantId,
      data.leadId,
      data.action,
      data.performedBy,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ];

    try {
      const result = await pool.query(query, values);
      return mapRowToLeadActivityLog(result.rows[0]);
    } catch (error: any) {
      console.error('DATABASE ERROR in LeadActivityLogModel.create:', error.message);
      throw error;
    }
  }

  /**
   * Get activity logs with user information for a specific lead
   */
  static async getLogsWithUserInfo(leadId: string, tenantId: string): Promise<Array<LeadActivityLog & { performedByUser?: { id: string; name: string; email: string } }>> {
    const query = `
      SELECT 
        al.*,
        u.id as user_id,
        u.name as user_name,
        u.work_email as user_email
      FROM lead_activity_logs al
      LEFT JOIN users u ON u.id::uuid = al.performed_by
      WHERE al.lead_id = $1 AND al.tenant_id = $2
      ORDER BY al.created_at DESC
    `;

    const result = await pool.query(query, [leadId, tenantId]);
    
    return result.rows.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      leadId: row.lead_id,
      action: row.action,
      performedBy: row.performed_by,
      metadata: row.metadata,
      createdAt: row.created_at,
      performedByUser: row.user_id ? {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email,
      } : undefined,
    }));
  }
}
