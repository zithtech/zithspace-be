import pool from "../config/dbpool";

export interface PaymentSetting {
  id: string;
  tenantId: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  qrCode?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  upiId?: string | null;
  merchantName?: string | null;
  bankHandle?: string | null;
}

export interface CreatePaymentSettingData {
  tenantId: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  qrCode?: string;
  createdBy: string;
  upiId?: string | null;
  merchantName?: string | null;
  bankHandle?: string | null;
}

export interface UpdatePaymentSettingData {
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branchName?: string;
  qrCode?: string;
  updatedBy: string;
  upiId?: string | null;
  merchantName?: string | null;
  bankHandle?: string | null;
}

/**
 * Convert database row (snake_case) to PaymentSetting interface (camelCase)
 */
function mapRowToPaymentSetting(row: any): PaymentSetting {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    bankName: row.bank_name,
    accountNumber: row.account_number,
    ifscCode: row.ifsc_code,
    branchName: row.branch_name,
    qrCode: row.qr_code,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    upiId: row.upi_id,
    merchantName: row.merchant_name,
    bankHandle: row.bank_handle,
  };
}

/**
 * Create a new payment setting
 */
export async function createPaymentSetting(data: CreatePaymentSettingData): Promise<PaymentSetting> {
  const query = `
    INSERT INTO payment_settings (
      tenant_id, 
      bank_name, 
      account_number, 
      ifsc_code, 
      branch_name, 
      qr_code, 
      created_by,
      upi_id,
      merchant_name,
      bank_handle
    ) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;
  
  const values = [
    data.tenantId,
    data.bankName,
    data.accountNumber,
    data.ifscCode,
    data.branchName,
    data.qrCode || null,
    data.createdBy,
    data.upiId || null,
    data.merchantName || null,
    data.bankHandle || null
  ];

  const result = await pool.query(query, values);
  return mapRowToPaymentSetting(result.rows[0]);
}

/**
 * Get payment setting by ID
 */
export async function getPaymentSettingById(id: string, tenantId: string): Promise<PaymentSetting | null> {
  const query = `
    SELECT * FROM payment_settings 
    WHERE id = $1 AND tenant_id = $2
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rows.length > 0 ? mapRowToPaymentSetting(result.rows[0]) : null;
}

/**
 * Get payment setting by tenant ID
 */
export async function getPaymentSettingByTenantId(tenantId: string): Promise<PaymentSetting | null> {
  const query = `
    SELECT * FROM payment_settings 
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `;
  
  const result = await pool.query(query, [tenantId]);
  return result.rows.length > 0 ? mapRowToPaymentSetting(result.rows[0]) : null;
}

/**
 * Update payment setting
 */
export async function updatePaymentSetting(
  id: string, 
  tenantId: string, 
  data: UpdatePaymentSettingData
): Promise<PaymentSetting | null> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.bankName !== undefined) {
    setClause.push(`bank_name = $${paramIndex++}`);
    values.push(data.bankName);
  }
  if (data.accountNumber !== undefined) {
    setClause.push(`account_number = $${paramIndex++}`);
    values.push(data.accountNumber);
  }
  if (data.ifscCode !== undefined) {
    setClause.push(`ifsc_code = $${paramIndex++}`);
    values.push(data.ifscCode);
  }
  if (data.branchName !== undefined) {
    setClause.push(`branch_name = $${paramIndex++}`);
    values.push(data.branchName);
  }
  if (data.qrCode !== undefined) {
    setClause.push(`qr_code = $${paramIndex++}`);
    values.push(data.qrCode);
  }
  if (data.upiId !== undefined) {
    setClause.push(`upi_id = $${paramIndex++}`);
    values.push(data.upiId);
  }
  if (data.merchantName !== undefined) {
    setClause.push(`merchant_name = $${paramIndex++}`);
    values.push(data.merchantName);
  }
  if (data.bankHandle !== undefined) {
    setClause.push(`bank_handle = $${paramIndex++}`);
    values.push(data.bankHandle);
  }

  setClause.push(`updated_by = $${paramIndex++}`);
  values.push(data.updatedBy);
  setClause.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE payment_settings 
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
    RETURNING *
  `;

  values.push(id, tenantId);

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToPaymentSetting(result.rows[0]) : null;
}

/**
 * Delete payment setting
 */
export async function deletePaymentSetting(id: string, tenantId: string): Promise<boolean> {
  const query = `
    DELETE FROM payment_settings 
    WHERE id = $1 AND tenant_id = $2
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rowCount > 0;
}

/**
 * Get all payment settings for a tenant
 */
export async function getPaymentSettingsByTenant(tenantId: string): Promise<PaymentSetting[]> {
  const query = `
    SELECT * FROM payment_settings 
    WHERE tenant_id = $1
    ORDER BY created_at DESC
  `;
  
  const result = await pool.query(query, [tenantId]);
  return result.rows.map(mapRowToPaymentSetting);
}
