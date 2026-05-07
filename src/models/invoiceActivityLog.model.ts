import pool from "../config/dbpool";

export interface InvoiceActivityLog {
  id: string;
  invoiceId: string;
  action: string;
  performedBy: string;
  metadata?: any;
  createdAt: Date;
}

export interface CreateInvoiceActivityLogData {
  invoiceId: string;
  action: string;
  performedBy: string;
  metadata?: any;
}

/**
 * Convert database row (snake_case) to InvoiceActivityLog interface (camelCase)
 */
function mapRowToInvoiceActivityLog(row: any): InvoiceActivityLog {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    action: row.action,
    performedBy: row.performed_by,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

/**
 * Create a new invoice activity log entry
 */
export async function createInvoiceActivityLog(data: CreateInvoiceActivityLogData): Promise<InvoiceActivityLog> {
  const query = `
    INSERT INTO invoice_activity_logs (
      invoice_id, action, performed_by, metadata
    ) 
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  
  const values = [
    data.invoiceId,
    data.action,
    data.performedBy,
    data.metadata ? JSON.stringify(data.metadata) : null,
  ];

  const result = await pool.query(query, values);
  return mapRowToInvoiceActivityLog(result.rows[0]);
}

/**
 * Get activity log by ID
 */
export async function getInvoiceActivityLogById(id: string): Promise<InvoiceActivityLog | null> {
  const query = `
    SELECT * FROM invoice_activity_logs 
    WHERE id = $1
  `;
  
  const result = await pool.query(query, [id]);
  return result.rows.length > 0 ? mapRowToInvoiceActivityLog(result.rows[0]) : null;
}

/**
 * Get all activity logs for an invoice
 */
export async function getInvoiceActivityLogs(
  invoiceId: string, 
  options: {
    limit?: number;
    offset?: number;
  } = {}
): Promise<InvoiceActivityLog[]> {
  const { limit = 50, offset = 0 } = options;
  
  const query = `
    SELECT * FROM invoice_activity_logs 
    WHERE invoice_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;
  
  const result = await pool.query(query, [invoiceId, limit, offset]);
  return result.rows.map(mapRowToInvoiceActivityLog);
}

/**
 * Get recent activity logs for an invoice
 */
export async function getRecentInvoiceActivityLogs(invoiceId: string, limit: number = 10): Promise<InvoiceActivityLog[]> {
  const query = `
    SELECT * FROM invoice_activity_logs 
    WHERE invoice_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `;
  
  const result = await pool.query(query, [invoiceId, limit]);
  return result.rows.map(mapRowToInvoiceActivityLog);
}

/**
 * Delete activity log entries for an invoice
 */
export async function deleteInvoiceActivityLogsByInvoiceId(invoiceId: string): Promise<boolean> {
  const query = `
    DELETE FROM invoice_activity_logs 
    WHERE invoice_id = $1
  `;
  
  const result = await pool.query(query, [invoiceId]);
  return result.rowCount > 0;
}

/**
 * Get activity log count for an invoice
 */
export async function getInvoiceActivityLogCount(invoiceId: string): Promise<number> {
  const query = `
    SELECT COUNT(*) as count
    FROM invoice_activity_logs 
    WHERE invoice_id = $1
  `;

  const result = await pool.query(query, [invoiceId]);
  return parseInt(result.rows[0].count);
}

/**
 * Log common invoice actions with standard metadata
 */
export async function logInvoiceAction(
  invoiceId: string,
  action: 'CREATED' | 'UPDATED' | 'SENT' | 'PAID' | 'CANCELLED' | 'DELETED' | 'VIEWED' | 'OVERDUE' | 'REFUNDED',
  performedBy: string,
  metadata?: any
): Promise<InvoiceActivityLog> {
  return createInvoiceActivityLog({
    invoiceId,
    action,
    performedBy,
    metadata,
  });
}

/**
 * Get activity logs with user information
 */
export async function getInvoiceActivityLogsWithUserInfo(
  invoiceId: string,
  options: {
    limit?: number;
    offset?: number;
  } = {}
): Promise<Array<InvoiceActivityLog & { performedByUser?: { id: string; name: string; email: string } }>> {
  const { limit = 50, offset = 0 } = options;
  
  const query = `
    SELECT 
      al.*,
      u.id as user_id,
      u.name as user_name,
      u.email as user_email
    FROM invoice_activity_logs al
    LEFT JOIN users u ON al.performed_by = u.id
    WHERE al.invoice_id = $1
    ORDER BY al.created_at DESC
    LIMIT $2 OFFSET $3
  `;
  
  const result = await pool.query(query, [invoiceId, limit, offset]);
  
  return result.rows.map(row => ({
    id: row.id,
    invoiceId: row.invoice_id,
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
