import pool from "../config/dbpool";

export interface InvoiceTax {
  id: string;
  tenantId: string;
  invoiceId: string;
  taxName: string;
  taxRate: number;
  taxAmount: number;
  deletedAt?: Date;
  deletedBy?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInvoiceTaxData {
  tenantId: string;
  invoiceId: string;
  taxName: string;
  taxRate: number;
  taxAmount: number;
  createdBy: string;
}

export interface UpdateInvoiceTaxData {
  taxName?: string;
  taxRate?: number;
  taxAmount?: number;
  updatedBy: string;
}

/**
 * Convert database row (snake_case) to InvoiceTax interface (camelCase)
 */
function mapRowToInvoiceTax(row: any): InvoiceTax {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    invoiceId: row.invoice_id,
    taxName: row.tax_name,
    taxRate: parseFloat(row.tax_rate),
    taxAmount: parseFloat(row.tax_amount),
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new invoice tax
 */
export async function createInvoiceTax(data: CreateInvoiceTaxData): Promise<InvoiceTax> {
  const query = `
    INSERT INTO invoice_taxes (
      tenant_id, invoice_id, tax_name, tax_rate, tax_amount, created_by
    ) 
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  
  const values = [
    data.tenantId,
    data.invoiceId,
    data.taxName,
    data.taxRate,
    data.taxAmount,
    data.createdBy,
  ];

  const result = await pool.query(query, values);
  return mapRowToInvoiceTax(result.rows[0]);
}

/**
 * Get invoice tax by ID
 */
export async function getInvoiceTaxById(id: string, tenantId: string): Promise<InvoiceTax | null> {
  const query = `
    SELECT * FROM invoice_taxes 
    WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rows.length > 0 ? mapRowToInvoiceTax(result.rows[0]) : null;
}

/**
 * Get all taxes for an invoice
 */
export async function getInvoiceTaxes(invoiceId: string, tenantId: string): Promise<InvoiceTax[]> {
  const query = `
    SELECT * FROM invoice_taxes 
    WHERE invoice_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
    ORDER BY created_at ASC
  `;
  
  const result = await pool.query(query, [invoiceId, tenantId]);
  return result.rows.map(mapRowToInvoiceTax);
}

/**
 * Update invoice tax
 */
export async function updateInvoiceTax(
  id: string, 
  tenantId: string, 
  data: UpdateInvoiceTaxData
): Promise<InvoiceTax | null> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.taxName !== undefined) {
    setClause.push(`tax_name = $${paramIndex++}`);
    values.push(data.taxName);
  }
  if (data.taxRate !== undefined) {
    setClause.push(`tax_rate = $${paramIndex++}`);
    values.push(data.taxRate);
  }
  if (data.taxAmount !== undefined) {
    setClause.push(`tax_amount = $${paramIndex++}`);
    values.push(data.taxAmount);
  }

  setClause.push(`updated_by = $${paramIndex++}`);
  values.push(data.updatedBy);
  setClause.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE invoice_taxes 
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex} AND deleted_at IS NULL
    RETURNING *
  `;

  values.push(id, tenantId);

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToInvoiceTax(result.rows[0]) : null;
}

/**
 * Soft delete invoice tax
 */
export async function deleteInvoiceTax(id: string, tenantId: string, deletedBy: string): Promise<boolean> {
  const query = `
    UPDATE invoice_taxes 
    SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [deletedBy, id, tenantId]);
  return result.rowCount > 0;
}

/**
 * Hard delete invoice tax (permanent)
 */
export async function hardDeleteInvoiceTax(id: string, tenantId: string): Promise<boolean> {
  const query = `
    DELETE FROM invoice_taxes 
    WHERE id = $1 AND tenant_id = $2
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rowCount > 0;
}

/**
 * Delete all taxes for an invoice
 */
export async function deleteInvoiceTaxesByInvoiceId(invoiceId: string, tenantId: string): Promise<boolean> {
  const query = `
    UPDATE invoice_taxes 
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE invoice_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [invoiceId, tenantId]);
  return result.rowCount > 0;
}

/**
 * Hard delete all taxes for an invoice (permanent)
 */
export async function hardDeleteInvoiceTaxesByInvoiceId(invoiceId: string, tenantId: string): Promise<boolean> {
  const query = `
    DELETE FROM invoice_taxes 
    WHERE invoice_id = $1 AND tenant_id = $2
  `;
  
  const result = await pool.query(query, [invoiceId, tenantId]);
  return result.rowCount > 0;
}

/**
 * Get taxes summary for an invoice
 */
export async function getInvoiceTaxesSummary(invoiceId: string, tenantId: string): Promise<{
  totalTaxes: number;
  totalTaxAmount: number;
}> {
  const query = `
    SELECT 
      COUNT(*) as total_taxes,
      COALESCE(SUM(tax_amount), 0) as total_tax_amount
    FROM invoice_taxes 
    WHERE invoice_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `;

  const result = await pool.query(query, [invoiceId, tenantId]);
  const row = result.rows[0];

  return {
    totalTaxes: parseInt(row.total_taxes),
    totalTaxAmount: parseFloat(row.total_tax_amount),
  };
}

/**
 * Create multiple taxes for an invoice
 */
export async function createMultipleInvoiceTaxes(
  taxes: CreateInvoiceTaxData[]
): Promise<InvoiceTax[]> {
  const { v4: uuidv4 } = require('uuid');
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const createdTaxes: InvoiceTax[] = [];
    
    for (const tax of taxes) {
      const id = uuidv4();
      const query = `
        INSERT INTO invoice_taxes (
          id, tenant_id, invoice_id, tax_name, tax_rate, tax_amount, created_by
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const values = [
        id,
        tax.tenantId,
        tax.invoiceId,
        tax.taxName,
        tax.taxRate,
        tax.taxAmount,
        tax.createdBy,
      ];

      const result = await client.query(query, values);
      createdTaxes.push(mapRowToInvoiceTax(result.rows[0]));
    }
    
    await client.query('COMMIT');
    return createdTaxes;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update tax amounts for an invoice (recalculate)
 */
export async function updateInvoiceTaxAmounts(
  invoiceId: string, 
  tenantId: string, 
  taxes: { id: string; taxAmount: number }[]
): Promise<boolean> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const tax of taxes) {
      const query = `
        UPDATE invoice_taxes 
        SET tax_amount = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND invoice_id = $3 AND tenant_id = $4 AND deleted_at IS NULL
      `;
      
      await client.query(query, [tax.taxAmount, tax.id, invoiceId, tenantId]);
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
