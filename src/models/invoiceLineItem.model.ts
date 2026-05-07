import pool from "../config/dbpool";

export interface InvoiceLineItem {
  id: string;
  tenantId: string;
  invoiceId: string;
  itemName: string;
  description?: string;
  quantity: number;
  rate: number;
  taxRate: number;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  deletedBy?: string;
  rowNumber?: number;
  projectId?: string;
  hours?: number;
  subtotal?: number;
  taxAmount?: number;
  total?: number;
  extraFields?: any;
}

export interface CreateInvoiceLineItemData {
  tenantId: string;
  invoiceId: string;
  itemName: string;
  description?: string;
  quantity?: number;
  rate?: number;
  taxRate?: number;
  createdBy: string;
  rowNumber?: number;
  projectId?: string;
  hours?: number;
  subtotal?: number;
  taxAmount?: number;
  total?: number;
  extraFields?: any;
}

export interface UpdateInvoiceLineItemData {
  itemName?: string;
  description?: string;
  quantity?: number;
  rate?: number;
  taxRate?: number;
  updatedBy: string;
  rowNumber?: number;
  projectId?: string;
  hours?: number;
  subtotal?: number;
  taxAmount?: number;
  total?: number;
  extraFields?: any;
}

/**
 * Convert database row (snake_case) to InvoiceLineItem interface (camelCase)
 */
function mapRowToInvoiceLineItem(row: any): InvoiceLineItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    invoiceId: row.invoice_id,
    itemName: row.item_name,
    description: row.description,
    quantity: parseFloat(row.quantity),
    rate: parseFloat(row.rate),
    taxRate: parseFloat(row.tax_rate),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    rowNumber: row.row_number,
    projectId: row.project_id,
    hours: row.hours ? parseFloat(row.hours) : undefined,
    subtotal: row.subtotal ? parseFloat(row.subtotal) : undefined,
    taxAmount: row.tax_amount ? parseFloat(row.tax_amount) : undefined,
    total: row.total ? parseFloat(row.total) : undefined,
    extraFields: row.extra_fields,
  };
}

/**
 * Create a new invoice line item
 */
export async function createInvoiceLineItem(data: CreateInvoiceLineItemData): Promise<InvoiceLineItem> {
  const query = `
    INSERT INTO invoice_line_items (
      tenant_id, invoice_id, item_name, description, quantity, rate, tax_rate,
      created_by, row_number, project_id, hours, subtotal, tax_amount, total, extra_fields, deleted_at
    ) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NULL)
    RETURNING *
  `;
  
  const values = [
    data.tenantId,
    data.invoiceId,
    data.itemName,
    data.description || null,
    data.quantity || 1,
    data.rate || 0,
    data.taxRate || 0,
    data.createdBy,
    data.rowNumber || null,
    data.projectId || null,
    data.hours || null,
    data.subtotal || null,
    data.taxAmount || null,
    data.total || null,
    data.extraFields ? JSON.stringify(data.extraFields) : null,
  ];

  const result = await pool.query(query, values);
  return mapRowToInvoiceLineItem(result.rows[0]);
}

/**
 * Get invoice line item by ID
 */
export async function getInvoiceLineItemById(id: string, tenantId: string): Promise<InvoiceLineItem | null> {
  const query = `
    SELECT * FROM invoice_line_items 
    WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rows.length > 0 ? mapRowToInvoiceLineItem(result.rows[0]) : null;
}

/**
 * Get all line items for an invoice
 */
export async function getInvoiceLineItems(invoiceId: string, tenantId: string): Promise<InvoiceLineItem[]> {
  const query = `
    SELECT * FROM invoice_line_items 
    WHERE invoice_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
    ORDER BY row_number ASC, created_at ASC
  `;
  
  const result = await pool.query(query, [invoiceId, tenantId]);
  return result.rows.map(mapRowToInvoiceLineItem);
}

/**
 * Update invoice line item
 */
export async function updateInvoiceLineItem(
  id: string, 
  tenantId: string, 
  data: UpdateInvoiceLineItemData
): Promise<InvoiceLineItem | null> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.itemName !== undefined) {
    setClause.push(`item_name = $${paramIndex++}`);
    values.push(data.itemName);
  }
  if (data.description !== undefined) {
    setClause.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }
  if (data.quantity !== undefined) {
    setClause.push(`quantity = $${paramIndex++}`);
    values.push(data.quantity);
  }
  if (data.rate !== undefined) {
    setClause.push(`rate = $${paramIndex++}`);
    values.push(data.rate);
  }
  if (data.taxRate !== undefined) {
    setClause.push(`tax_rate = $${paramIndex++}`);
    values.push(data.taxRate);
  }
  if (data.rowNumber !== undefined) {
    setClause.push(`row_number = $${paramIndex++}`);
    values.push(data.rowNumber);
  }
  if (data.projectId !== undefined) {
    setClause.push(`project_id = $${paramIndex++}`);
    values.push(data.projectId);
  }
  if (data.hours !== undefined) {
    setClause.push(`hours = $${paramIndex++}`);
    values.push(data.hours);
  }
  if (data.subtotal !== undefined) {
    setClause.push(`subtotal = $${paramIndex++}`);
    values.push(data.subtotal);
  }
  if (data.taxAmount !== undefined) {
    setClause.push(`tax_amount = $${paramIndex++}`);
    values.push(data.taxAmount);
  }
  if (data.total !== undefined) {
    setClause.push(`total = $${paramIndex++}`);
    values.push(data.total);
  }
  if (data.extraFields !== undefined) {
    setClause.push(`extra_fields = $${paramIndex++}`);
    values.push(data.extraFields ? JSON.stringify(data.extraFields) : null);
  }

  setClause.push(`updated_by = $${paramIndex++}`);
  values.push(data.updatedBy);
  setClause.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE invoice_line_items 
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex} AND deleted_at IS NULL
    RETURNING *
  `;

  values.push(id, tenantId);

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToInvoiceLineItem(result.rows[0]) : null;
}

/**
 * Soft delete invoice line item
 */
export async function deleteInvoiceLineItem(id: string, tenantId: string, deletedBy: string): Promise<boolean> {
  const query = `
    UPDATE invoice_line_items 
    SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [deletedBy, id, tenantId]);
  return result.rowCount > 0;
}

/**
 * Hard delete invoice line item (permanent)
 */
export async function hardDeleteInvoiceLineItem(id: string, tenantId: string): Promise<boolean> {
  const query = `
    DELETE FROM invoice_line_items 
    WHERE id = $1 AND tenant_id = $2
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rowCount > 0;
}

/**
 * Delete all line items for an invoice
 */
export async function deleteInvoiceLineItemsByInvoiceId(invoiceId: string, tenantId: string): Promise<boolean> {
  const query = `
    UPDATE invoice_line_items 
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE invoice_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [invoiceId, tenantId]);
  return result.rowCount > 0;
}

/**
 * Hard delete all line items for an invoice (permanent)
 */
export async function hardDeleteInvoiceLineItemsByInvoiceId(invoiceId: string, tenantId: string): Promise<boolean> {
  const query = `
    DELETE FROM invoice_line_items 
    WHERE invoice_id = $1 AND tenant_id = $2
  `;
  
  const result = await pool.query(query, [invoiceId, tenantId]);
  return result.rowCount > 0;
}

/**
 * Update line item row numbers for an invoice
 */
export async function updateLineItemRowNumbers(
  invoiceId: string, 
  tenantId: string, 
  updates: { id: string; rowNumber: number }[]
): Promise<boolean> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const update of updates) {
      const query = `
        UPDATE invoice_line_items 
        SET row_number = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND invoice_id = $3 AND tenant_id = $4 AND deleted_at IS NULL
      `;
      
      await client.query(query, [update.rowNumber, update.id, invoiceId, tenantId]);
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
 * Get line items summary for an invoice
 */
export async function getInvoiceLineItemsSummary(invoiceId: string, tenantId: string): Promise<{
  totalItems: number;
  totalQuantity: number;
  subtotal: number;
  taxTotal: number;
  total: number;
}> {
  const query = `
    SELECT 
      COUNT(*) as total_items,
      COALESCE(SUM(quantity), 0) as total_quantity,
      COALESCE(SUM(subtotal), 0) as subtotal,
      COALESCE(SUM(tax_amount), 0) as tax_total,
      COALESCE(SUM(total), 0) as total
    FROM invoice_line_items 
    WHERE invoice_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `;

  const result = await pool.query(query, [invoiceId, tenantId]);
  const row = result.rows[0];

  return {
    totalItems: parseInt(row.total_items),
    totalQuantity: parseFloat(row.total_quantity),
    subtotal: parseFloat(row.subtotal),
    taxTotal: parseFloat(row.tax_total),
    total: parseFloat(row.total),
  };
}

/**
 * Create multiple line items for an invoice
 */
export async function createMultipleInvoiceLineItems(
  items: CreateInvoiceLineItemData[]
): Promise<InvoiceLineItem[]> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const createdItems: InvoiceLineItem[] = [];
    
    for (const item of items) {
      const id = require('crypto').randomUUID();
      const query = `
        INSERT INTO invoice_line_items (
          id, tenant_id, invoice_id, item_name, description, quantity, rate, tax_rate,
          created_by, row_number, project_id, hours, subtotal, tax_amount, total, extra_fields, deleted_at
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NULL)
        RETURNING *
      `;
      
      const values = [
        id,
        item.tenantId,
        item.invoiceId,
        item.itemName,
        item.description || null,
        item.quantity || 1,
        item.rate || 0,
        item.taxRate || 0,
        item.createdBy,
        item.rowNumber || null,
        item.projectId || null,
        item.hours || null,
        item.subtotal || null,
        item.taxAmount || null,
        item.total || null,
        item.extraFields ? JSON.stringify(item.extraFields) : null,
      ];

      const result = await client.query(query, values);
      createdItems.push(mapRowToInvoiceLineItem(result.rows[0]));
    }
    
    await client.query('COMMIT');
    return createdItems;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
