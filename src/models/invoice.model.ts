import pool from "../config/dbpool";

export enum InvoiceType {
  STANDARD = "STANDARD",
  RECURRING = "RECURRING",
  CREDIT = "CREDIT",
  DEBIT = "DEBIT",
}

export enum RecurringFrequency {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
  QUARTERLY = "QUARTERLY",
  YEARLY = "YEARLY",
}

export enum InvoiceStatus {
  DRAFT = "DRAFT",
  SENT = "SENT",
  VIEWED = "VIEWED",
  PAID = "PAID",
  PARTIALLY_PAID = "PARTIALLY_PAID",
  OVERDUE = "OVERDUE",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
}

export interface Invoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  customerId: string;
  customerSnapshot?: any;
  invoiceDate: Date;
  dueDate: Date;
  invoiceType: InvoiceType;
  currency: string;
  recurringFrequency?: RecurringFrequency;
  taxInclusive: boolean;
  subtotal: number;
  taxTotal: number;
  paidAmount: number;
  balanceDue: number;
  notes?: string;
  terms?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  settingsProfileId?: string;
  sentAt?: Date;
  paidAt?: Date;
  cancelledAt?: Date;
  pdfUrl?: string;
  status: InvoiceStatus;
  description?: string;
  firstPaymentDate?: Date;
  lastPaymentDate?: Date;
  fullyPaidDate?: Date;
  deletedAt?: Date;
  deletedBy?: string;
  discountTotal: number;
  grandTotal?: number;
  projectId?: string;
  templateId?: string;
  metadata?: any;
}

export interface CreateInvoiceData {
  tenantId: string;
  invoiceNumber: string;
  customerId: string;
  customerSnapshot?: any;
  invoiceDate: Date;
  dueDate: Date;
  invoiceType?: InvoiceType;
  currency: string;
  recurringFrequency?: RecurringFrequency;
  taxInclusive?: boolean;
  subtotal: number;
  taxTotal: number;
  paidAmount?: number;
  balanceDue: number;
  notes?: string;
  terms?: string;
  createdBy: string;
  settingsProfileId?: string;
  pdfUrl?: string;
  status?: InvoiceStatus;
  description?: string;
  discountTotal?: number;
  grandTotal?: number;
  projectId?: string;
  templateId?: string;
  metadata?: any;
}

export interface UpdateInvoiceData {
  invoiceNumber?: string;
  customerId?: string;
  customerSnapshot?: any;
  invoiceDate?: Date;
  dueDate?: Date;
  invoiceType?: InvoiceType;
  currency?: string;
  recurringFrequency?: RecurringFrequency;
  taxInclusive?: boolean;
  subtotal?: number;
  taxTotal?: number;
  paidAmount?: number;
  balanceDue?: number;
  notes?: string;
  terms?: string;
  updatedBy: string;
  settingsProfileId?: string;
  pdfUrl?: string;
  status?: InvoiceStatus;
  description?: string;
  discountTotal?: number;
  grandTotal?: number;
  projectId?: string;
  templateId?: string;
  metadata?: any;
}

/**
 * Convert database row (snake_case) to Invoice interface (camelCase)
 */
function mapRowToInvoice(row: any): Invoice {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    invoiceNumber: row.invoice_number,
    customerId: row.customer_id,
    customerSnapshot: row.customer_snapshot,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    invoiceType: row.invoice_type,
    currency: row.currency,
    recurringFrequency: row.recurring_frequency,
    taxInclusive: row.tax_inclusive,
    subtotal: parseFloat(row.subtotal),
    taxTotal: parseFloat(row.tax_total),
    paidAmount: parseFloat(row.paid_amount),
    balanceDue: parseFloat(row.balance_due),
    notes: row.notes,
    terms: row.terms,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    settingsProfileId: row.settings_profile_id,
    sentAt: row.sent_at,
    paidAt: row.paid_at,
    cancelledAt: row.cancelled_at,
    pdfUrl: row.pdf_url,
    status: row.status,
    description: row.description,
    firstPaymentDate: row.first_payment_date,
    lastPaymentDate: row.last_payment_date,
    fullyPaidDate: row.fully_paid_date,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    discountTotal: parseFloat(row.discount_total),
    grandTotal: row.grand_total ? parseFloat(row.grand_total) : undefined,
    projectId: row.project_id,
    templateId: row.template_id,
    metadata: row.metadata,
  };
}

/**
 * Create a new invoice
 */
export async function createInvoice(data: CreateInvoiceData): Promise<Invoice> {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  
  const query = `
    INSERT INTO invoices (
      id, tenant_id, invoice_number, customer_id, customer_snapshot, invoice_date, due_date,
      invoice_type, currency, recurring_frequency, tax_inclusive, subtotal, tax_total,
      paid_amount, balance_due, notes, terms, created_by, settings_profile_id,
      pdf_url, status, description, discount_total, grand_total, project_id,
      template_id, metadata
    ) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
    RETURNING *
  `;
  
  const values = [
    id,
    data.tenantId,
    data.invoiceNumber,
    data.customerId,
    data.customerSnapshot ? JSON.stringify(data.customerSnapshot) : null,
    data.invoiceDate,
    data.dueDate,
    data.invoiceType || InvoiceType.STANDARD,
    data.currency,
    data.recurringFrequency || null,
    data.taxInclusive !== undefined ? data.taxInclusive : false,
    data.subtotal,
    data.taxTotal,
    data.paidAmount || 0,
    data.balanceDue,
    data.notes || null,
    data.terms || null,
    data.createdBy,
    data.settingsProfileId || null,
    data.pdfUrl || null,
    data.status || InvoiceStatus.DRAFT,
    data.description || null,
    data.discountTotal || 0,
    data.grandTotal || null,
    data.projectId || null,
    data.templateId || null,
    data.metadata ? JSON.stringify(data.metadata) : null,
  ];

  const result = await pool.query(query, values);
  return mapRowToInvoice(result.rows[0]);
}

/**
 * Get invoice by ID
 */
export async function getInvoiceById(id: string, tenantId: string): Promise<Invoice | null> {
  const query = `
    SELECT * FROM invoices 
    WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rows.length > 0 ? mapRowToInvoice(result.rows[0]) : null;
}

/**
 * Get invoice by invoice number
 */
export async function getInvoiceByNumber(invoiceNumber: string, tenantId: string): Promise<Invoice | null> {
  const query = `
    SELECT * FROM invoices 
    WHERE invoice_number = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [invoiceNumber, tenantId]);
  return result.rows.length > 0 ? mapRowToInvoice(result.rows[0]) : null;
}

/**
 * Update invoice
 */
export async function updateInvoice(
  id: string, 
  tenantId: string, 
  data: UpdateInvoiceData
): Promise<Invoice | null> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.invoiceNumber !== undefined) {
    setClause.push(`invoice_number = $${paramIndex++}`);
    values.push(data.invoiceNumber);
  }
  if (data.customerId !== undefined) {
    setClause.push(`customer_id = $${paramIndex++}`);
    values.push(data.customerId);
  }
  if (data.customerSnapshot !== undefined) {
    setClause.push(`customer_snapshot = $${paramIndex++}`);
    values.push(data.customerSnapshot ? JSON.stringify(data.customerSnapshot) : null);
  }
  if (data.invoiceDate !== undefined) {
    setClause.push(`invoice_date = $${paramIndex++}`);
    values.push(data.invoiceDate);
  }
  if (data.dueDate !== undefined) {
    setClause.push(`due_date = $${paramIndex++}`);
    values.push(data.dueDate);
  }
  if (data.invoiceType !== undefined) {
    setClause.push(`invoice_type = $${paramIndex++}`);
    values.push(data.invoiceType);
  }
  if (data.currency !== undefined) {
    setClause.push(`currency = $${paramIndex++}`);
    values.push(data.currency);
  }
  if (data.recurringFrequency !== undefined) {
    setClause.push(`recurring_frequency = $${paramIndex++}`);
    values.push(data.recurringFrequency);
  }
  if (data.taxInclusive !== undefined) {
    setClause.push(`tax_inclusive = $${paramIndex++}`);
    values.push(data.taxInclusive);
  }
  if (data.subtotal !== undefined) {
    setClause.push(`subtotal = $${paramIndex++}`);
    values.push(data.subtotal);
  }
  if (data.taxTotal !== undefined) {
    setClause.push(`tax_total = $${paramIndex++}`);
    values.push(data.taxTotal);
  }
  if (data.paidAmount !== undefined) {
    setClause.push(`paid_amount = $${paramIndex++}`);
    values.push(data.paidAmount);
  }
  if (data.balanceDue !== undefined) {
    setClause.push(`balance_due = $${paramIndex++}`);
    values.push(data.balanceDue);
  }
  if (data.notes !== undefined) {
    setClause.push(`notes = $${paramIndex++}`);
    values.push(data.notes);
  }
  if (data.terms !== undefined) {
    setClause.push(`terms = $${paramIndex++}`);
    values.push(data.terms);
  }
  if (data.settingsProfileId !== undefined) {
    setClause.push(`settings_profile_id = $${paramIndex++}`);
    values.push(data.settingsProfileId);
  }
  if (data.pdfUrl !== undefined) {
    setClause.push(`pdf_url = $${paramIndex++}`);
    values.push(data.pdfUrl);
  }
  if (data.status !== undefined) {
    setClause.push(`status = $${paramIndex++}`);
    values.push(data.status);
  }
  if (data.description !== undefined) {
    setClause.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }
  if (data.discountTotal !== undefined) {
    setClause.push(`discount_total = $${paramIndex++}`);
    values.push(data.discountTotal);
  }
  if (data.grandTotal !== undefined) {
    setClause.push(`grand_total = $${paramIndex++}`);
    values.push(data.grandTotal);
  }
  if (data.projectId !== undefined) {
    setClause.push(`project_id = $${paramIndex++}`);
    values.push(data.projectId);
  }
  if (data.templateId !== undefined) {
    setClause.push(`template_id = $${paramIndex++}`);
    values.push(data.templateId);
  }
  if (data.metadata !== undefined) {
    setClause.push(`metadata = $${paramIndex++}`);
    values.push(data.metadata ? JSON.stringify(data.metadata) : null);
  }

  setClause.push(`updated_by = $${paramIndex++}`);
  values.push(data.updatedBy);
  setClause.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE invoices 
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex} AND deleted_at IS NULL
    RETURNING *
  `;

  values.push(id, tenantId);

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToInvoice(result.rows[0]) : null;
}

/**
 * Soft delete invoice
 */
export async function deleteInvoice(id: string, tenantId: string, deletedBy: string): Promise<boolean> {
  const query = `
    UPDATE invoices 
    SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [deletedBy, id, tenantId]);
  return result.rowCount > 0;
}

/**
 * Hard delete invoice (permanent) with cascade deletion of related data
 */
export async function hardDeleteInvoice(id: string, tenantId: string): Promise<boolean> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // First, get the invoice details to check for PDF URL
    const invoiceQuery = `
      SELECT pdf_url FROM invoices 
      WHERE id = $1 AND tenant_id = $2
    `;
    
    const invoiceResult = await client.query(invoiceQuery, [id, tenantId]);
    
    if (invoiceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    
    const pdfUrl = invoiceResult.rows[0].pdf_url;
    
    // Delete related data in the correct order (respecting foreign key constraints)
    
    // 1. Delete invoice activity logs
    await client.query('DELETE FROM invoice_activity_logs WHERE invoice_id = $1', [id]);
    
    // 2. Delete invoice payments
    await client.query('DELETE FROM invoice_payments WHERE invoice_id = $1', [id]);
    
    // 3. Delete invoice taxes
    await client.query('DELETE FROM invoice_taxes WHERE invoice_id = $1 AND tenant_id = $2', [id, tenantId]);
    
    // 4. Delete invoice line items
    await client.query('DELETE FROM invoice_line_items WHERE invoice_id = $1 AND tenant_id = $2', [id, tenantId]);
    
    // 5. Delete invoice attachments
    await client.query('DELETE FROM invoice_attachments WHERE invoice_id = $1', [id]);
    
    // 6. Finally, delete the invoice itself
    const deleteInvoiceQuery = `
      DELETE FROM invoices 
      WHERE id = $1 AND tenant_id = $2
    `;
    
    const deleteResult = await client.query(deleteInvoiceQuery, [id, tenantId]);
    
    await client.query('COMMIT');
    
    // Delete PDF from R2 if it exists
    if (pdfUrl) {
      try {
        // Import the R2 deletion function
        const { deleteFileFromR2 } = await import('../utils/r2Client');
        await deleteFileFromR2(pdfUrl, tenantId);
      } catch (error) {
        console.error('Failed to delete PDF from R2:', error);
        // Continue even if R2 deletion fails - the database deletion was successful
      }
    }
    
    return deleteResult.rowCount > 0;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all invoices for a tenant with pagination and filtering
 */
export async function getInvoices(
  tenantId: string,
  options: {
    page?: number;
    limit?: number;
    status?: InvoiceStatus | 'all';
    customerId?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<{ invoices: Invoice[]; total: number }> {
  const {
    page = 1,
    limit = 20,
    status = 'all',
    customerId,
    search,
    sortBy = 'created_at',
    sortOrder = 'desc',
    startDate,
    endDate
  } = options;

  const whereConditions: string[] = ['tenant_id = $1 AND deleted_at IS NULL'];
  const values: any[] = [tenantId];
  let paramIndex = 2;

  if (status !== 'all') {
    whereConditions.push(`status = $${paramIndex++}`);
    values.push(status);
  }

  if (customerId) {
    whereConditions.push(`customer_id = $${paramIndex++}`);
    values.push(customerId);
  }

  if (search) {
    whereConditions.push(`(invoice_number ILIKE $${paramIndex++} OR notes ILIKE $${paramIndex++})`);
    values.push(`%${search}%`, `%${search}%`);
  }

  if (startDate) {
    whereConditions.push(`invoice_date >= $${paramIndex++}`);
    values.push(startDate);
  }

  if (endDate) {
    whereConditions.push(`invoice_date <= $${paramIndex++}`);
    values.push(endDate);
  }

  // Map camelCase field names to snake_case database column names
  const columnMapping: { [key: string]: string } = {
    'createdAt': 'created_at',
    'updatedAt': 'updated_at',
    'invoiceDate': 'invoice_date',
    'dueDate': 'due_date',
    'invoiceNumber': 'invoice_number',
    'subtotal': 'subtotal',
    'balanceDue': 'balance_due',
    'status': 'status',
    'taxTotal': 'tax_total',
    'paidAmount': 'paid_amount',
    'deletedAt': 'deleted_at',
    'deletedBy': 'deleted_by',
    'grandTotal': 'grand_total',
    'discountTotal': 'discount_total'
  };
  
  const dbColumnName = columnMapping[sortBy] || sortBy;
  const orderByClause = `ORDER BY ${dbColumnName} ${sortOrder.toUpperCase()}`;
  const offset = (page - 1) * limit;

  const query = `
    SELECT * FROM invoices 
    WHERE ${whereConditions.join(' AND ')}
    ${orderByClause}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM invoices
    WHERE ${whereConditions.join(' AND ')}
  `;

  values.push(limit, offset);

  const [invoicesResult, countResult] = await Promise.all([
    pool.query(query, values),
    pool.query(countQuery, values.slice(0, -2))
  ]);

  const invoices = invoicesResult.rows.map(mapRowToInvoice);

  return {
    invoices,
    total: parseInt(countResult.rows[0].total)
  };
}

/**
 * Update invoice status
 */
export async function updateInvoiceStatus(
  id: string, 
  tenantId: string, 
  status: InvoiceStatus, 
  updatedBy: string
): Promise<Invoice | null> {
  const query = `
    UPDATE invoices 
    SET status = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
    WHERE id = $3 AND tenant_id = $4 AND deleted_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(query, [status, updatedBy, id, tenantId]);
  return result.rows.length > 0 ? mapRowToInvoice(result.rows[0]) : null;
}

/**
 * Update invoice status and balance due
 */
export async function updateInvoiceStatusAndBalance(
  id: string, 
  tenantId: string, 
  status: InvoiceStatus, 
  balanceDue: number,
  paidAmount: number,
  updatedBy: string
): Promise<Invoice | null> {
  const query = `
    UPDATE invoices 
    SET status = $1, balance_due = $2, paid_amount = $3, updated_by = $4, updated_at = CURRENT_TIMESTAMP
    WHERE id = $5 AND tenant_id = $6 AND deleted_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(query, [status, balanceDue, paidAmount, updatedBy, id, tenantId]);
  return result.rows.length > 0 ? mapRowToInvoice(result.rows[0]) : null;
}

/**
 * Mark invoice as sent
 */
export async function markInvoiceAsSent(
  id: string, 
  tenantId: string, 
  updatedBy: string
): Promise<Invoice | null> {
  const query = `
    UPDATE invoices 
    SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, updated_by = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(query, [updatedBy, id, tenantId]);
  return result.rows.length > 0 ? mapRowToInvoice(result.rows[0]) : null;
}

/**
 * Update invoice payment information
 */
export async function updateInvoicePayment(
  id: string, 
  tenantId: string, 
  paidAmount: number, 
  balanceDue: number, 
  status: InvoiceStatus, 
  updatedBy: string
): Promise<Invoice | null> {
  const query = `
    UPDATE invoices 
    SET paid_amount = $1, balance_due = $2, status = $3, 
        updated_by = $4, updated_at = CURRENT_TIMESTAMP,
        paid_at = CASE WHEN $3 = 'PAID' THEN CURRENT_TIMESTAMP ELSE paid_at END,
        fully_paid_date = CASE WHEN $3 = 'PAID' THEN CURRENT_TIMESTAMP ELSE fully_paid_date END
    WHERE id = $5 AND tenant_id = $6 AND deleted_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(query, [paidAmount, balanceDue, status, updatedBy, id, tenantId]);
  return result.rows.length > 0 ? mapRowToInvoice(result.rows[0]) : null;
}

/**
 * Get all invoices for a tenant (including deleted ones) - for invoice number generation
 */
export async function getAllInvoices(
  tenantId: string,
  options: {
    page?: number;
    limit?: number;
    status?: string;
    customerId?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{ invoices: Invoice[]; total: number }> {
  const {
    page = 1,
    limit = 20,
    status = 'all',
    customerId,
    search,
    sortBy = 'created_at',
    sortOrder = 'desc'
  } = options;

  const whereConditions: string[] = ['tenant_id = $1']; // NO deleted_at filter - gets ALL invoices
  const values: any[] = [tenantId];
  let paramIndex = 2;

  if (status !== 'all') {
    whereConditions.push(`status = $${paramIndex++}`);
    values.push(status);
  }

  if (customerId) {
    whereConditions.push(`customer_id = $${paramIndex++}`);
    values.push(customerId);
  }

  if (search) {
    whereConditions.push(`(invoice_number ILIKE $${paramIndex++} OR notes ILIKE $${paramIndex++})`);
    values.push(`%${search}%`, `%${search}%`);
  }

  // Map camelCase field names to snake_case database column names
  const columnMapping: { [key: string]: string } = {
    'createdAt': 'created_at',
    'updatedAt': 'updated_at',
    'invoiceDate': 'invoice_date',
    'dueDate': 'due_date',
    'invoiceNumber': 'invoice_number',
    'subtotal': 'subtotal',
    'balanceDue': 'balance_due',
    'status': 'status',
    'taxTotal': 'tax_total',
    'paidAmount': 'paid_amount',
    'deletedAt': 'deleted_at',
    'deletedBy': 'deleted_by',
    'grandTotal': 'grand_total',
    'discountTotal': 'discount_total'
  };
  
  const dbColumnName = columnMapping[sortBy] || sortBy;
  const orderByClause = `ORDER BY ${dbColumnName} ${sortOrder.toUpperCase()}`;
  const offset = (page - 1) * limit;

  const query = `
    SELECT * FROM invoices 
    WHERE ${whereConditions.join(' AND ')}
    ${orderByClause}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM invoices
    WHERE ${whereConditions.join(' AND ')}
  `;

  values.push(limit, offset);

  const [invoicesResult, countResult] = await Promise.all([
    pool.query(query, values),
    pool.query(countQuery, values.slice(0, -2))
  ]);

  const invoices = invoicesResult.rows.map(mapRowToInvoice);

  return {
    invoices,
    total: parseInt(countResult.rows[0].total)
  };
}

/**
 * Get deleted invoices for a tenant
 */
export async function getDeletedInvoices(
  tenantId: string,
  options: {
    page?: number;
    limit?: number;
    status?: string;
    customerId?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{ invoices: Invoice[]; total: number }> {
  const {
    page = 1,
    limit = 20,
    status = 'all',
    customerId,
    search,
    sortBy = 'deleted_at',
    sortOrder = 'desc'
  } = options;

  const whereConditions: string[] = ['tenant_id = $1 AND deleted_at IS NOT NULL'];
  const values: any[] = [tenantId];
  let paramIndex = 2;

  if (status !== 'all') {
    whereConditions.push(`status = $${paramIndex++}`);
    values.push(status);
  }

  if (customerId) {
    whereConditions.push(`customer_id = $${paramIndex++}`);
    values.push(customerId);
  }

  if (search) {
    whereConditions.push(`(invoice_number ILIKE $${paramIndex++} OR notes ILIKE $${paramIndex++})`);
    values.push(`%${search}%`, `%${search}%`);
  }

  // Map camelCase field names to snake_case database column names
  const columnMapping: { [key: string]: string } = {
    'createdAt': 'created_at',
    'updatedAt': 'updated_at',
    'invoiceDate': 'invoice_date',
    'dueDate': 'due_date',
    'invoiceNumber': 'invoice_number',
    'subtotal': 'subtotal',
    'balanceDue': 'balance_due',
    'status': 'status',
    'taxTotal': 'tax_total',
    'paidAmount': 'paid_amount',
    'deletedAt': 'deleted_at',
    'deletedBy': 'deleted_by',
    'grandTotal': 'grand_total',
    'discountTotal': 'discount_total'
  };
  
  const dbColumnName = columnMapping[sortBy] || sortBy;
  const orderByClause = `ORDER BY ${dbColumnName} ${sortOrder.toUpperCase()}`;
  const offset = (page - 1) * limit;

  const query = `
    SELECT * FROM invoices 
    WHERE ${whereConditions.join(' AND ')}
    ${orderByClause}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM invoices
    WHERE ${whereConditions.join(' AND ')}
  `;

  values.push(limit, offset);

  const [invoicesResult, countResult] = await Promise.all([
    pool.query(query, values),
    pool.query(countQuery, values.slice(0, -2))
  ]);

  const invoices = invoicesResult.rows.map(mapRowToInvoice);

  return {
    invoices,
    total: parseInt(countResult.rows[0].total)
  };
}

/**
 * Get invoice statistics for a tenant
 */
export async function getInvoiceStats(tenantId: string): Promise<{
  total: number;
  draft: number;
  sent: number;
  paid: number;
  overdue: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
}> {
  const query = `
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) as draft,
      COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent,
      COUNT(CASE WHEN status = 'PAID' THEN 1 END) as paid,
      COUNT(CASE WHEN status = 'OVERDUE' THEN 1 END) as overdue,
      COALESCE(SUM(subtotal), 0) as total_amount,
      COALESCE(SUM(paid_amount), 0) as paid_amount,
      COALESCE(SUM(balance_due), 0) as outstanding_amount
    FROM invoices 
    WHERE tenant_id = $1 AND deleted_at IS NULL
  `;

  const result = await pool.query(query, [tenantId]);
  const row = result.rows[0];

  return {
    total: parseInt(row.total),
    draft: parseInt(row.draft),
    sent: parseInt(row.sent),
    paid: parseInt(row.paid),
    overdue: parseInt(row.overdue),
    totalAmount: parseFloat(row.total_amount),
    paidAmount: parseFloat(row.paid_amount),
    outstandingAmount: parseFloat(row.outstanding_amount),
  };
}

/**
 * Restore a soft-deleted invoice
 */
export async function restoreInvoice(id: string, tenantId: string, restoredBy: string): Promise<boolean> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Restore invoice
    const invoiceQuery = `
      UPDATE invoices 
      SET deleted_at = NULL, deleted_by = NULL, updated_at = CURRENT_TIMESTAMP, updated_by = $1
      WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NOT NULL
    `;
    
    const invoiceResult = await client.query(invoiceQuery, [restoredBy, id, tenantId]);
    
    if (invoiceResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    
    // Restore line items
    const lineItemsQuery = `
      UPDATE invoice_line_items 
      SET deleted_at = NULL, deleted_by = NULL, updated_at = CURRENT_TIMESTAMP, updated_by = $1
      WHERE invoice_id = $2 AND tenant_id = $3 AND deleted_at IS NOT NULL
    `;
    
    await client.query(lineItemsQuery, [restoredBy, id, tenantId]);
    
    await client.query('COMMIT');
    return true;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
