import pool from "../config/dbpool";
import { GeneralSetting } from "./generalSettings.model";
import { InvoiceSetting } from "./invoiceSettings.model";
import { PaymentSetting } from "./paymentSettings.model";

export interface SettingsProfile {
  id: string;
  tenantId: string;
  name: string;
  isActive?: boolean;
  generalId: string;
  invoiceId: string;
  paymentId: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  general?: GeneralSetting;
  invoice?: InvoiceSetting;
  payment?: PaymentSetting;
}

export interface CreateSettingsProfileData {
  tenantId: string;
  name: string;
  isActive?: boolean;
  generalId: string;
  invoiceId: string;
  paymentId: string;
  createdBy: string;
}

export interface UpdateSettingsProfileData {
  name?: string;
  isActive?: boolean;
  generalId?: string;
  invoiceId?: string;
  paymentId?: string;
  updatedBy: string;
}

export interface SettingsProfileWithRelations extends SettingsProfile {
  general: GeneralSetting;
  invoice: InvoiceSetting;
  payment: PaymentSetting;
}

/**
 * Convert database row (snake_case) to SettingsProfile interface (camelCase)
 */
function mapRowToSettingsProfile(row: any): SettingsProfile {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    isActive: row.is_active,
    generalId: row.general_id,
    invoiceId: row.invoice_id,
    paymentId: row.payment_id,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Handle both cases: when relations are already structured or when they need to be built from flat fields
    general: row.general || (row.general_id ? {
      id: row.general_id,
      tenantId: row.general_tenant_id,
      companyName: row.general_company_name,
      address: row.general_address,
      primaryColor: row.general_primary_color,
      currency: row.general_currency,
      dateFormat: row.general_date_format,
      companyLogo: row.general_company_logo,
      signature: row.general_signature,
      gstin: row.general_gstin,
      pan: row.general_pan,
      createdBy: row.general_created_by,
      updatedBy: row.general_updated_by,
      createdAt: row.general_created_at,
      updatedAt: row.general_updated_at,
    } : undefined),
    invoice: row.invoice || (row.invoice_id ? {
      id: row.invoice_id,
      tenantId: row.invoice_tenant_id,
      format: row.invoice_format,
      nextNumber: row.invoice_next_number,
      resetYearly: row.invoice_reset_yearly,
      lastResetYear: row.invoice_last_reset_year,
      padding: row.invoice_padding,
      createdBy: row.invoice_created_by,
      updatedBy: row.invoice_updated_by,
      createdAt: row.invoice_created_at,
      updatedAt: row.invoice_updated_at,
    } : undefined),
    payment: row.payment || (row.payment_id ? {
      id: row.payment_id,
      tenantId: row.payment_tenant_id,
      bankName: row.payment_bank_name,
      accountNumber: row.payment_account_number,
      ifscCode: row.payment_ifsc_code,
      branchName: row.payment_branch_name,
      qrCode: row.payment_qr_code,
      createdBy: row.payment_created_by,
      updatedBy: row.payment_updated_by,
      createdAt: row.payment_created_at,
      updatedAt: row.payment_updated_at,
      upiId: row.payment_upi_id,
      merchantName: row.payment_merchant_name,
      bankHandle: row.payment_bank_handle,
    } : undefined),
  };
}

/**
 * Create a new settings profile
 */
export async function createSettingsProfile(data: CreateSettingsProfileData): Promise<SettingsProfile> {
  const query = `
    INSERT INTO settings_profiles (
      tenant_id, 
      name, 
      is_active, 
      general_id, 
      invoice_id, 
      payment_id, 
      created_by
    ) 
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;
  
  const values = [
    data.tenantId,
    data.name,
    data.isActive !== undefined ? data.isActive : false,
    data.generalId,
    data.invoiceId,
    data.paymentId,
    data.createdBy
  ];

  const result = await pool.query(query, values);
  return mapRowToSettingsProfile(result.rows[0]);
}

/**
 * Get settings profile by ID with relations
 */
export async function getSettingsProfileById(id: string, tenantId: string): Promise<SettingsProfile | null> {
  const query = `
    SELECT 
      sp.*,
      gs.id as general_id,
      gs.tenant_id as general_tenant_id,
      gs.company_name as general_company_name,
      gs.address as general_address,
      gs.primary_color as general_primary_color,
      gs.currency as general_currency,
      gs.date_format as general_date_format,
      gs.company_logo as general_company_logo,
      gs.signature as general_signature,
      gs.gstin as general_gstin,
      gs.pan as general_pan,
      gs.created_by as general_created_by,
      gs.updated_by as general_updated_by,
      gs.created_at as general_created_at,
      gs.updated_at as general_updated_at,
      inv.id as invoice_id,
      inv.tenant_id as invoice_tenant_id,
      inv.format as invoice_format,
      inv.next_number as invoice_next_number,
      inv.reset_yearly as invoice_reset_yearly,
      inv.last_reset_year as invoice_last_reset_year,
      inv.padding as invoice_padding,
      inv.created_by as invoice_created_by,
      inv.updated_by as invoice_updated_by,
      inv.created_at as invoice_created_at,
      inv.updated_at as invoice_updated_at,
      ps.id as payment_id,
      ps.tenant_id as payment_tenant_id,
      ps.bank_name as payment_bank_name,
      ps.account_number as payment_account_number,
      ps.ifsc_code as payment_ifsc_code,
      ps.branch_name as payment_branch_name,
      ps.qr_code as payment_qr_code,
      ps.created_by as payment_created_by,
      ps.updated_by as payment_updated_by,
      ps.created_at as payment_created_at,
      ps.updated_at as payment_updated_at,
      ps.upi_id as payment_upi_id,
      ps.merchant_name as payment_merchant_name,
      ps.bank_handle as payment_bank_handle
    FROM settings_profiles sp
    LEFT JOIN general_settings gs ON sp.general_id = gs.id
    LEFT JOIN invoice_settings inv ON sp.invoice_id = inv.id
    LEFT JOIN payment_settings ps ON sp.payment_id = ps.id
    WHERE sp.id = $1 AND sp.tenant_id = $2
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  
  // Map the joined data to the expected structure
  const mappedRow = {
    ...row,
    general: row.general_id ? {
      id: row.general_id,
      tenantId: row.general_tenant_id,
      companyName: row.general_company_name,
      address: row.general_address,
      primaryColor: row.general_primary_color,
      currency: row.general_currency,
      dateFormat: row.general_date_format,
      companyLogo: row.general_company_logo,
      signature: row.general_signature,
      gstin: row.general_gstin,
      pan: row.general_pan,
      createdBy: row.general_created_by,
      updatedBy: row.general_updated_by,
      createdAt: row.general_created_at,
      updatedAt: row.general_updated_at,
    } : null,
    invoice: row.invoice_id ? {
      id: row.invoice_id,
      tenantId: row.invoice_tenant_id,
      format: row.invoice_format,
      nextNumber: row.invoice_next_number,
      resetYearly: row.invoice_reset_yearly,
      lastResetYear: row.invoice_last_reset_year,
      padding: row.invoice_padding,
      createdBy: row.invoice_created_by,
      updatedBy: row.invoice_updated_by,
      createdAt: row.invoice_created_at,
      updatedAt: row.invoice_updated_at,
    } : null,
    payment: row.payment_id ? {
      id: row.payment_id,
      tenantId: row.payment_tenant_id,
      bankName: row.payment_bank_name,
      accountNumber: row.payment_account_number,
      ifscCode: row.payment_ifsc_code,
      branchName: row.payment_branch_name,
      qrCode: row.payment_qr_code,
      createdBy: row.payment_created_by,
      updatedBy: row.payment_updated_by,
      createdAt: row.payment_created_at,
      updatedAt: row.payment_updated_at,
      upiId: row.payment_upi_id,
      merchantName: row.payment_merchant_name,
      bankHandle: row.payment_bank_handle,
    } : null,
  };

  return mapRowToSettingsProfile(mappedRow);
}

/**
 * Get all settings profiles for a tenant with pagination and filtering
 */
export async function getSettingsProfiles(
  tenantId: string,
  options: {
    page?: number;
    limit?: number;
    isActive?: boolean | 'all';
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{ profiles: SettingsProfile[]; total: number }> {
  const {
    page = 1,
    limit = 20,
    isActive = 'all',
    search,
    sortBy = 'created_at',
    sortOrder = 'desc'
  } = options;

  const whereConditions: string[] = ['sp.tenant_id = $1'];
  const values: any[] = [tenantId];
  let paramIndex = 2;

  if (isActive !== 'all') {
    whereConditions.push(`sp.is_active = $${paramIndex++}`);
    values.push(isActive === true);
  }

  if (search) {
    whereConditions.push(`sp.name ILIKE $${paramIndex++}`);
    values.push(`%${search}%`);
  }

  // Map camelCase field names to snake_case database column names
  const columnMapping: { [key: string]: string } = {
    'createdAt': 'created_at',
    'updatedAt': 'updated_at',
    'name': 'name',
    'isActive': 'is_active'
  };
  
  const dbColumnName = columnMapping[sortBy] || sortBy;
  const orderByClause = `ORDER BY sp.${dbColumnName} ${sortOrder.toUpperCase()}`;
  const offset = (page - 1) * limit;

  const query = `
    SELECT 
      sp.*,
      gs.id as general_id,
      gs.tenant_id as general_tenant_id,
      gs.company_name as general_company_name,
      gs.address as general_address,
      gs.primary_color as general_primary_color,
      gs.currency as general_currency,
      gs.date_format as general_date_format,
      gs.company_logo as general_company_logo,
      gs.signature as general_signature,
      gs.gstin as general_gstin,
      gs.pan as general_pan,
      gs.created_by as general_created_by,
      gs.updated_by as general_updated_by,
      gs.created_at as general_created_at,
      gs.updated_at as general_updated_at,
      inv.id as invoice_id,
      inv.tenant_id as invoice_tenant_id,
      inv.format as invoice_format,
      inv.next_number as invoice_next_number,
      inv.reset_yearly as invoice_reset_yearly,
      inv.last_reset_year as invoice_last_reset_year,
      inv.padding as invoice_padding,
      inv.created_by as invoice_created_by,
      inv.updated_by as invoice_updated_by,
      inv.created_at as invoice_created_at,
      inv.updated_at as invoice_updated_at,
      ps.id as payment_id,
      ps.tenant_id as payment_tenant_id,
      ps.bank_name as payment_bank_name,
      ps.account_number as payment_account_number,
      ps.ifsc_code as payment_ifsc_code,
      ps.branch_name as payment_branch_name,
      ps.qr_code as payment_qr_code,
      ps.created_by as payment_created_by,
      ps.updated_by as payment_updated_by,
      ps.created_at as payment_created_at,
      ps.updated_at as payment_updated_at,
      ps.upi_id as payment_upi_id,
      ps.merchant_name as payment_merchant_name,
      ps.bank_handle as payment_bank_handle
    FROM settings_profiles sp
    LEFT JOIN general_settings gs ON sp.general_id = gs.id
    LEFT JOIN invoice_settings inv ON sp.invoice_id = inv.id
    LEFT JOIN payment_settings ps ON sp.payment_id = ps.id
    WHERE ${whereConditions.join(' AND ')}
    ${orderByClause}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM settings_profiles sp
    WHERE ${whereConditions.join(' AND ')}
  `;

  values.push(limit, offset);

  const [profilesResult, countResult] = await Promise.all([
    pool.query(query, values),
    pool.query(countQuery, values.slice(0, -2))
  ]);

  const profiles = profilesResult.rows.map(row => {
    return mapRowToSettingsProfile(row);
  });

  return {
    profiles,
    total: parseInt(countResult.rows[0].total)
  };
}

/**
 * Update settings profile
 */
export async function updateSettingsProfile(
  id: string,
  tenantId: string,
  data: UpdateSettingsProfileData
): Promise<SettingsProfile | null> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    setClause.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.isActive !== undefined) {
    setClause.push(`is_active = $${paramIndex++}`);
    values.push(data.isActive);
  }
  if (data.generalId !== undefined) {
    setClause.push(`general_id = $${paramIndex++}`);
    values.push(data.generalId);
  }
  if (data.invoiceId !== undefined) {
    setClause.push(`invoice_id = $${paramIndex++}`);
    values.push(data.invoiceId);
  }
  if (data.paymentId !== undefined) {
    setClause.push(`payment_id = $${paramIndex++}`);
    values.push(data.paymentId);
  }

  setClause.push(`updated_by = $${paramIndex++}`);
  values.push(data.updatedBy);
  setClause.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE settings_profiles 
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
    RETURNING *
  `;

  values.push(id, tenantId);

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToSettingsProfile(result.rows[0]) : null;
}

/**
 * Delete settings profile
 */
export async function deleteSettingsProfile(id: string, tenantId: string): Promise<boolean> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // First, get the profile to retrieve the related IDs
    const profileQuery = `
      SELECT general_id, invoice_id, payment_id 
      FROM settings_profiles 
      WHERE id = $1 AND tenant_id = $2
    `;
    
    const profileResult = await client.query(profileQuery, [id, tenantId]);
    
    if (profileResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    
    const { general_id, invoice_id, payment_id } = profileResult.rows[0];
    
    // Delete the profile record FIRST (to remove the foreign key references)
    const deleteProfileQuery = `
      DELETE FROM settings_profiles 
      WHERE id = $1 AND tenant_id = $2
    `;
    
    const deleteResult = await client.query(deleteProfileQuery, [id, tenantId]);
    
    if (deleteResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    
    // Now delete the related settings records (safe since profile is deleted)
    if (general_id) {
      await client.query('DELETE FROM general_settings WHERE id = $1', [general_id]);
    }
    
    if (invoice_id) {
      await client.query('DELETE FROM invoice_settings WHERE id = $1', [invoice_id]);
    }
    
    if (payment_id) {
      await client.query('DELETE FROM payment_settings WHERE id = $1', [payment_id]);
    }
    
    await client.query('COMMIT');
    
    return true;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get active settings profile for a tenant (single - for backward compatibility)
 */
export async function getActiveSettingsProfile(tenantId: string): Promise<SettingsProfile | null> {
  const query = `
    SELECT 
      sp.*,
      gs.id as general_id,
      gs.tenant_id as general_tenant_id,
      gs.company_name as general_company_name,
      gs.address as general_address,
      gs.primary_color as general_primary_color,
      gs.currency as general_currency,
      gs.date_format as general_date_format,
      gs.company_logo as general_company_logo,
      gs.signature as general_signature,
      gs.gstin as general_gstin,
      gs.pan as general_pan,
      gs.created_by as general_created_by,
      gs.updated_by as general_updated_by,
      gs.created_at as general_created_at,
      gs.updated_at as general_updated_at,
      inv.id as invoice_id,
      inv.tenant_id as invoice_tenant_id,
      inv.format as invoice_format,
      inv.next_number as invoice_next_number,
      inv.reset_yearly as invoice_reset_yearly,
      inv.last_reset_year as invoice_last_reset_year,
      inv.padding as invoice_padding,
      inv.created_by as invoice_created_by,
      inv.updated_by as invoice_updated_by,
      inv.created_at as invoice_created_at,
      inv.updated_at as invoice_updated_at,
      ps.id as payment_id,
      ps.tenant_id as payment_tenant_id,
      ps.bank_name as payment_bank_name,
      ps.account_number as payment_account_number,
      ps.ifsc_code as payment_ifsc_code,
      ps.branch_name as payment_branch_name,
      ps.qr_code as payment_qr_code,
      ps.created_by as payment_created_by,
      ps.updated_by as payment_updated_by,
      ps.created_at as payment_created_at,
      ps.updated_at as payment_updated_at,
      ps.upi_id as payment_upi_id,
      ps.merchant_name as payment_merchant_name,
      ps.bank_handle as payment_bank_handle
    FROM settings_profiles sp
    LEFT JOIN general_settings gs ON sp.general_id = gs.id
    LEFT JOIN invoice_settings inv ON sp.invoice_id = inv.id
    LEFT JOIN payment_settings ps ON sp.payment_id = ps.id
    WHERE sp.tenant_id = $1 AND sp.is_active = true
    LIMIT 1
  `;
  
  const result = await pool.query(query, [tenantId]);
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  
  const mappedRow = {
    ...row,
    general: row.general_id ? {
      id: row.general_id,
      tenantId: row.general_tenant_id,
      companyName: row.general_company_name,
      address: row.general_address,
      primaryColor: row.general_primary_color,
      currency: row.general_currency,
      dateFormat: row.general_date_format,
      companyLogo: row.general_company_logo,
      signature: row.general_signature,
      gstin: row.general_gstin,
      pan: row.general_pan,
      createdBy: row.general_created_by,
      updatedBy: row.general_updated_by,
      createdAt: row.general_created_at,
      updatedAt: row.general_updated_at,
    } : null,
    invoice: row.invoice_id ? {
      id: row.invoice_id,
      tenantId: row.invoice_tenant_id,
      format: row.invoice_format,
      nextNumber: row.invoice_next_number,
      resetYearly: row.invoice_reset_yearly,
      lastResetYear: row.invoice_last_reset_year,
      padding: row.invoice_padding,
      createdBy: row.invoice_created_by,
      updatedBy: row.invoice_updated_by,
      createdAt: row.invoice_created_at,
      updatedAt: row.invoice_updated_at,
    } : null,
    payment: row.payment_id ? {
      id: row.payment_id,
      tenantId: row.payment_tenant_id,
      bankName: row.payment_bank_name,
      accountNumber: row.payment_account_number,
      ifscCode: row.payment_ifsc_code,
      branchName: row.payment_branch_name,
      qrCode: row.payment_qr_code,
      createdBy: row.payment_created_by,
      updatedBy: row.payment_updated_by,
      createdAt: row.payment_created_at,
      updatedAt: row.payment_updated_at,
      upiId: row.payment_upi_id,
      merchantName: row.payment_merchant_name,
      bankHandle: row.payment_bank_handle,
    } : null,
  };

  return mapRowToSettingsProfile(mappedRow);
}

/**
 * Get ALL active settings profiles for a tenant
 */
export async function getAllActiveSettingsProfiles(tenantId: string): Promise<SettingsProfile[]> {
  const query = `
    SELECT 
      sp.*,
      gs.id as general_id,
      gs.tenant_id as general_tenant_id,
      gs.company_name as general_company_name,
      gs.address as general_address,
      gs.primary_color as general_primary_color,
      gs.currency as general_currency,
      gs.date_format as general_date_format,
      gs.company_logo as general_company_logo,
      gs.signature as general_signature,
      gs.gstin as general_gstin,
      gs.pan as general_pan,
      gs.created_by as general_created_by,
      gs.updated_by as general_updated_by,
      gs.created_at as general_created_at,
      gs.updated_at as general_updated_at,
      inv.id as invoice_id,
      inv.tenant_id as invoice_tenant_id,
      inv.format as invoice_format,
      inv.next_number as invoice_next_number,
      inv.reset_yearly as invoice_reset_yearly,
      inv.last_reset_year as invoice_last_reset_year,
      inv.padding as invoice_padding,
      inv.created_by as invoice_created_by,
      inv.updated_by as invoice_updated_by,
      inv.created_at as invoice_created_at,
      inv.updated_at as invoice_updated_at,
      ps.id as payment_id,
      ps.tenant_id as payment_tenant_id,
      ps.bank_name as payment_bank_name,
      ps.account_number as payment_account_number,
      ps.ifsc_code as payment_ifsc_code,
      ps.branch_name as payment_branch_name,
      ps.qr_code as payment_qr_code,
      ps.created_by as payment_created_by,
      ps.updated_by as payment_updated_by,
      ps.created_at as payment_created_at,
      ps.updated_at as payment_updated_at,
      ps.upi_id as payment_upi_id,
      ps.merchant_name as payment_merchant_name,
      ps.bank_handle as payment_bank_handle
    FROM settings_profiles sp
    LEFT JOIN general_settings gs ON sp.general_id = gs.id
    LEFT JOIN invoice_settings inv ON sp.invoice_id = inv.id
    LEFT JOIN payment_settings ps ON sp.payment_id = ps.id
    WHERE sp.tenant_id = $1 AND sp.is_active = true
    ORDER BY sp.created_at DESC
  `;
  
  const result = await pool.query(query, [tenantId]);
  
  return result.rows.map(row => {
    const mappedRow = {
      ...row,
      general: row.general_id ? {
        id: row.general_id,
        tenantId: row.general_tenant_id,
        companyName: row.general_company_name,
        address: row.general_address,
        primaryColor: row.general_primary_color,
        currency: row.general_currency,
        dateFormat: row.general_date_format,
        companyLogo: row.general_company_logo,
        signature: row.general_signature,
        gstin: row.general_gstin,
        pan: row.general_pan,
        createdBy: row.general_created_by,
        updatedBy: row.general_updated_by,
        createdAt: row.general_created_at,
        updatedAt: row.general_updated_at,
      } : null,
      invoice: row.invoice_id ? {
        id: row.invoice_id,
        tenantId: row.invoice_tenant_id,
        format: row.invoice_format,
        nextNumber: row.invoice_next_number,
        resetYearly: row.invoice_reset_yearly,
        lastResetYear: row.invoice_last_reset_year,
        padding: row.invoice_padding,
        createdBy: row.invoice_created_by,
        updatedBy: row.invoice_updated_by,
        createdAt: row.invoice_created_at,
        updatedAt: row.invoice_updated_at,
      } : null,
      payment: row.payment_id ? {
        id: row.payment_id,
        tenantId: row.payment_tenant_id,
        bankName: row.payment_bank_name,
        accountNumber: row.payment_account_number,
        ifscCode: row.payment_ifsc_code,
        branchName: row.payment_branch_name,
        qrCode: row.payment_qr_code,
        createdBy: row.payment_created_by,
        updatedBy: row.payment_updated_by,
        createdAt: row.payment_created_at,
        updatedAt: row.payment_updated_at,
        upiId: row.payment_upi_id,
        merchantName: row.payment_merchant_name,
        bankHandle: row.payment_bank_handle,
      } : null,
    };

    return mapRowToSettingsProfile(mappedRow);
  });
}

/**
 * Set a profile as active (deactivates all other profiles for the tenant)
 */
export async function setActiveProfile(id: string, tenantId: string): Promise<boolean> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Deactivate all other profiles for this tenant
    await client.query(
      'UPDATE settings_profiles SET is_active = false WHERE tenant_id = $1 AND id != $2',
      [tenantId, id]
    );
    
    // Activate the specified profile
    const result = await client.query(
      'UPDATE settings_profiles SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    
    await client.query('COMMIT');
    return result.rowCount > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
