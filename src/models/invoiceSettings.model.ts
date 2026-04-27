import pool from "../config/dbpool";

export interface InvoiceSetting {
  id: string;
  tenantId: string;
  format: string;
  nextNumber: number;
  resetYearly: boolean;
  lastResetYear: number;
  padding: number;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInvoiceSettingData {
  tenantId: string;
  format?: string;
  nextNumber?: number;
  resetYearly?: boolean;
  lastResetYear?: number;
  padding?: number;
  createdBy: string;
}

export interface UpdateInvoiceSettingData {
  format?: string;
  nextNumber?: number;
  resetYearly?: boolean;
  lastResetYear?: number;
  padding?: number;
  updatedBy: string;
}

/**
 * Convert database row (snake_case) to InvoiceSetting interface (camelCase)
 */
function mapRowToInvoiceSetting(row: any): InvoiceSetting {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    format: row.format,
    nextNumber: row.next_number,
    resetYearly: row.reset_yearly,
    lastResetYear: row.last_reset_year,
    padding: row.padding,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new invoice setting
 */
export async function createInvoiceSetting(data: CreateInvoiceSettingData): Promise<InvoiceSetting> {
  const query = `
    INSERT INTO invoice_settings (
      tenant_id, 
      format, 
      next_number, 
      reset_yearly, 
      last_reset_year, 
      padding, 
      created_by
    ) 
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;
  
  const values = [
    data.tenantId,
    data.format || "INV-{YYYY}-{###}",
    data.nextNumber || 1,
    data.resetYearly !== undefined ? data.resetYearly : true,
    data.lastResetYear || new Date().getFullYear(),
    data.padding || 4,
    data.createdBy
  ];

  const result = await pool.query(query, values);
  return mapRowToInvoiceSetting(result.rows[0]);
}

/**
 * Get invoice setting by ID
 */
export async function getInvoiceSettingById(id: string, tenantId: string): Promise<InvoiceSetting | null> {
  const query = `
    SELECT * FROM invoice_settings 
    WHERE id = $1 AND tenant_id = $2
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rows.length > 0 ? mapRowToInvoiceSetting(result.rows[0]) : null;
}

/**
 * Get invoice setting by tenant ID
 */
export async function getInvoiceSettingByTenantId(tenantId: string): Promise<InvoiceSetting | null> {
  const query = `
    SELECT * FROM invoice_settings 
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `;
  
  const result = await pool.query(query, [tenantId]);
  return result.rows.length > 0 ? mapRowToInvoiceSetting(result.rows[0]) : null;
}

/**
 * Update invoice setting
 */
export async function updateInvoiceSetting(
  id: string, 
  tenantId: string, 
  data: UpdateInvoiceSettingData
): Promise<InvoiceSetting | null> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.format !== undefined) {
    setClause.push(`format = $${paramIndex++}`);
    values.push(data.format);
  }
  if (data.nextNumber !== undefined) {
    setClause.push(`next_number = $${paramIndex++}`);
    values.push(data.nextNumber);
  }
  if (data.resetYearly !== undefined) {
    setClause.push(`reset_yearly = $${paramIndex++}`);
    values.push(data.resetYearly);
  }
  if (data.lastResetYear !== undefined) {
    setClause.push(`last_reset_year = $${paramIndex++}`);
    values.push(data.lastResetYear);
  }
  if (data.padding !== undefined) {
    setClause.push(`padding = $${paramIndex++}`);
    values.push(data.padding);
  }

  setClause.push(`updated_by = $${paramIndex++}`);
  values.push(data.updatedBy);
  setClause.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE invoice_settings 
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
    RETURNING *
  `;

  values.push(id, tenantId);

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToInvoiceSetting(result.rows[0]) : null;
}

/**
 * Delete invoice setting
 */
export async function deleteInvoiceSetting(id: string, tenantId: string): Promise<boolean> {
  const query = `
    DELETE FROM invoice_settings 
    WHERE id = $1 AND tenant_id = $2
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rowCount > 0;
}

/**
 * Get all invoice settings for a tenant
 */
export async function getInvoiceSettingsByTenant(tenantId: string): Promise<InvoiceSetting[]> {
  const query = `
    SELECT * FROM invoice_settings 
    WHERE tenant_id = $1
    ORDER BY created_at DESC
  `;
  
  const result = await pool.query(query, [tenantId]);
  return result.rows.map(mapRowToInvoiceSetting);
}

/**
 * Increment next number for invoice setting
 */
export async function incrementNextNumber(id: string, tenantId: string): Promise<InvoiceSetting | null> {
  const query = `
    UPDATE invoice_settings 
    SET next_number = next_number + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rows.length > 0 ? mapRowToInvoiceSetting(result.rows[0]) : null;
}

/**
 * Reset next number if yearly reset is enabled
 */
export async function resetNextNumberIfNeeded(id: string, tenantId: string): Promise<InvoiceSetting | null> {
  const currentYear = new Date().getFullYear();
  const query = `
    UPDATE invoice_settings 
    SET next_number = CASE 
        WHEN reset_yearly = true AND last_reset_year < $1 
        THEN 1 
        ELSE next_number 
      END,
      last_reset_year = CASE 
        WHEN reset_yearly = true AND last_reset_year < $1 
        THEN $1 
        ELSE last_reset_year 
      END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND tenant_id = $3
    RETURNING *
  `;
  
  const result = await pool.query(query, [currentYear, id, tenantId]);
  return result.rows.length > 0 ? mapRowToInvoiceSetting(result.rows[0]) : null;
}
