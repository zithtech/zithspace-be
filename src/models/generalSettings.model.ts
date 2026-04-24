import pool from "../config/dbpool";

export enum Currency {
  USD = "USD",
  EUR = "EUR",
  GBP = "GBP",
  INR = "INR",
  AUD = "AUD",
  CAD = "CAD",
  JPY = "JPY",
  CNY = "CNY",
}

export enum DateFormat {
  DD_MM_YYYY = "DD/MM/YYYY",
  MM_DD_YYYY = "MM/DD/YYYY",
  YYYY_MM_DD = "YYYY-MM-DD",
  DD_MM_YY = "DD/MM/YY",
  MM_DD_YY = "MM/DD/YY",
  YY_MM_DD = "YY-MM-DD",
}

export interface GeneralSetting {
  id: string;
  tenantId: string;
  companyName: string;
  address: any; // JSON type
  primaryColor: string;
  currency: Currency;
  dateFormat: DateFormat;
  companyLogo?: string;
  signature?: string;
  gstin?: string;
  pan?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGeneralSettingData {
  tenantId: string;
  companyName: string;
  address: any;
  primaryColor: string;
  currency: Currency;
  dateFormat: DateFormat;
  companyLogo?: string;
  signature?: string;
  gstin?: string;
  pan?: string;
  createdBy: string;
}

export interface UpdateGeneralSettingData {
  companyName?: string;
  address?: any;
  primaryColor?: string;
  currency?: Currency;
  dateFormat?: DateFormat;
  companyLogo?: string;
  signature?: string;
  gstin?: string;
  pan?: string;
  updatedBy: string;
}

/**
 * Convert database row (snake_case) to GeneralSetting interface (camelCase)
 */
function mapRowToGeneralSetting(row: any): GeneralSetting {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    companyName: row.company_name,
    address: row.address,
    primaryColor: row.primary_color,
    currency: row.currency,
    dateFormat: row.date_format,
    companyLogo: row.company_logo,
    signature: row.signature,
    gstin: row.gstin,
    pan: row.pan,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new general setting
 */
export async function createGeneralSetting(data: CreateGeneralSettingData): Promise<GeneralSetting> {
  const query = `
    INSERT INTO general_settings (
      tenant_id, 
      company_name, 
      address, 
      primary_color, 
      currency, 
      date_format, 
      company_logo, 
      signature, 
      gstin, 
      pan, 
      created_by
    ) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;
  
  const values = [
    data.tenantId,
    data.companyName,
    JSON.stringify(data.address),
    data.primaryColor,
    data.currency,
    data.dateFormat,
    data.companyLogo || null,
    data.signature || null,
    data.gstin || null,
    data.pan || null,
    data.createdBy
  ];

  const result = await pool.query(query, values);
  return mapRowToGeneralSetting(result.rows[0]);
}

/**
 * Get general setting by ID
 */
export async function getGeneralSettingById(id: string, tenantId: string): Promise<GeneralSetting | null> {
  const query = `
    SELECT * FROM general_settings 
    WHERE id = $1 AND tenant_id = $2
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rows.length > 0 ? mapRowToGeneralSetting(result.rows[0]) : null;
}

/**
 * Get general setting by tenant ID
 */
export async function getGeneralSettingByTenantId(tenantId: string): Promise<GeneralSetting | null> {
  const query = `
    SELECT * FROM general_settings 
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `;
  
  const result = await pool.query(query, [tenantId]);
  return result.rows.length > 0 ? mapRowToGeneralSetting(result.rows[0]) : null;
}

/**
 * Update general setting
 */
export async function updateGeneralSetting(
  id: string, 
  tenantId: string, 
  data: UpdateGeneralSettingData
): Promise<GeneralSetting | null> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.companyName !== undefined) {
    setClause.push(`company_name = $${paramIndex++}`);
    values.push(data.companyName);
  }
  if (data.address !== undefined) {
    setClause.push(`address = $${paramIndex++}`);
    values.push(JSON.stringify(data.address));
  }
  if (data.primaryColor !== undefined) {
    setClause.push(`primary_color = $${paramIndex++}`);
    values.push(data.primaryColor);
  }
  if (data.currency !== undefined) {
    setClause.push(`currency = $${paramIndex++}`);
    values.push(data.currency);
  }
  if (data.dateFormat !== undefined) {
    setClause.push(`date_format = $${paramIndex++}`);
    values.push(data.dateFormat);
  }
  if (data.companyLogo !== undefined) {
    setClause.push(`company_logo = $${paramIndex++}`);
    values.push(data.companyLogo);
  }
  if (data.signature !== undefined) {
    setClause.push(`signature = $${paramIndex++}`);
    values.push(data.signature);
  }
  if (data.gstin !== undefined) {
    setClause.push(`gstin = $${paramIndex++}`);
    values.push(data.gstin);
  }
  if (data.pan !== undefined) {
    setClause.push(`pan = $${paramIndex++}`);
    values.push(data.pan);
  }

  setClause.push(`updated_by = $${paramIndex++}`);
  values.push(data.updatedBy);
  setClause.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE general_settings 
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
    RETURNING *
  `;

  values.push(id, tenantId);

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToGeneralSetting(result.rows[0]) : null;
}

/**
 * Delete general setting
 */
export async function deleteGeneralSetting(id: string, tenantId: string): Promise<boolean> {
  const query = `
    DELETE FROM general_settings 
    WHERE id = $1 AND tenant_id = $2
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rowCount > 0;
}

/**
 * Get all general settings for a tenant
 */
export async function getGeneralSettingsByTenant(tenantId: string): Promise<GeneralSetting[]> {
  const query = `
    SELECT * FROM general_settings 
    WHERE tenant_id = $1
    ORDER BY created_at DESC
  `;
  
  const result = await pool.query(query, [tenantId]);
  return result.rows.map(mapRowToGeneralSetting);
}
