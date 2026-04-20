import pool from "../config/dbpool";

export enum PaymentMethod {
  CASH = "CASH",
  BANK_TRANSFER = "BANK_TRANSFER",
  CREDIT_CARD = "CREDIT_CARD",
  DEBIT_CARD = "DEBIT_CARD",
  CHECK = "CHECK",
  ONLINE_PAYMENT = "ONLINE_PAYMENT",
  OTHER = "OTHER",
}

export enum PaymentStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
  CANCELLED = "CANCELLED",
}

export interface InvoicePayment {
  id: string;
  tenantId: string;
  invoiceId: string;
  amount: number;
  description?: string;
  paymentDate: Date;
  paymentMethod?: PaymentMethod;
  status: PaymentStatus;
  createdBy: string;
  createdAt: Date;
  updatedBy?: string;
  updatedAt: Date;
  referenceId?: string;
  balanceBefore?: number;
  balanceAfter?: number;
}

export interface CreateInvoicePaymentData {
  tenantId: string;
  invoiceId: string;
  amount: number;
  description?: string;
  paymentDate?: Date;
  paymentMethod?: PaymentMethod;
  status?: PaymentStatus;
  createdBy: string;
  referenceId?: string;
  balanceBefore?: number;
  balanceAfter?: number;
}

export interface UpdateInvoicePaymentData {
  amount?: number;
  description?: string;
  paymentDate?: Date;
  paymentMethod?: PaymentMethod;
  status?: PaymentStatus;
  updatedBy: string;
  referenceId?: string;
  balanceBefore?: number;
  balanceAfter?: number;
}

/**
 * Convert database row (snake_case) to InvoicePayment interface (camelCase)
 */
function mapRowToInvoicePayment(row: any): InvoicePayment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    invoiceId: row.invoice_id,
    amount: parseFloat(row.amount),
    description: row.description,
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    referenceId: row.reference_id,
    balanceBefore: row.balance_before ? parseFloat(row.balance_before) : undefined,
    balanceAfter: row.balance_after ? parseFloat(row.balance_after) : undefined,
  };
}

/**
 * Create a new invoice payment
 */
export async function createInvoicePayment(data: CreateInvoicePaymentData): Promise<InvoicePayment> {
  const query = `
    INSERT INTO invoice_payments (
      tenant_id, invoice_id, amount, description, payment_date, payment_method,
      status, created_by, reference_id, balance_before, balance_after
    ) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;
  
  const values = [
    data.tenantId,
    data.invoiceId,
    data.amount,
    data.description || null,
    data.paymentDate || new Date(),
    data.paymentMethod || null,
    data.status || PaymentStatus.PENDING,
    data.createdBy,
    data.referenceId || null,
    data.balanceBefore || null,
    data.balanceAfter || null,
  ];

  const result = await pool.query(query, values);
  return mapRowToInvoicePayment(result.rows[0]);
}

/**
 * Get invoice payment by ID
 */
export async function getInvoicePaymentById(id: string, tenantId: string): Promise<InvoicePayment | null> {
  const query = `
    SELECT * FROM invoice_payments 
    WHERE id = $1 AND tenant_id = $2
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rows.length > 0 ? mapRowToInvoicePayment(result.rows[0]) : null;
}

/**
 * Get all payments for an invoice
 */
export async function getInvoicePayments(invoiceId: string, tenantId: string): Promise<InvoicePayment[]> {
  const query = `
    SELECT * FROM invoice_payments 
    WHERE invoice_id = $1 AND tenant_id = $2
    ORDER BY payment_date DESC, created_at DESC
  `;
  
  const result = await pool.query(query, [invoiceId, tenantId]);
  return result.rows.map(mapRowToInvoicePayment);
}

/**
 * Update invoice payment
 */
export async function updateInvoicePayment(
  id: string, 
  tenantId: string, 
  data: UpdateInvoicePaymentData
): Promise<InvoicePayment | null> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.amount !== undefined) {
    setClause.push(`amount = $${paramIndex++}`);
    values.push(data.amount);
  }
  if (data.description !== undefined) {
    setClause.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }
  if (data.paymentDate !== undefined) {
    setClause.push(`payment_date = $${paramIndex++}`);
    values.push(data.paymentDate);
  }
  if (data.paymentMethod !== undefined) {
    setClause.push(`payment_method = $${paramIndex++}`);
    values.push(data.paymentMethod);
  }
  if (data.status !== undefined) {
    setClause.push(`status = $${paramIndex++}`);
    values.push(data.status);
  }
  if (data.referenceId !== undefined) {
    setClause.push(`reference_id = $${paramIndex++}`);
    values.push(data.referenceId);
  }
  if (data.balanceBefore !== undefined) {
    setClause.push(`balance_before = $${paramIndex++}`);
    values.push(data.balanceBefore);
  }
  if (data.balanceAfter !== undefined) {
    setClause.push(`balance_after = $${paramIndex++}`);
    values.push(data.balanceAfter);
  }

  setClause.push(`updated_by = $${paramIndex++}`);
  values.push(data.updatedBy);
  setClause.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE invoice_payments 
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
    RETURNING *
  `;

  values.push(id, tenantId);

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToInvoicePayment(result.rows[0]) : null;
}

/**
 * Delete invoice payment
 */
export async function deleteInvoicePayment(id: string, tenantId: string): Promise<boolean> {
  const query = `
    DELETE FROM invoice_payments 
    WHERE id = $1 AND tenant_id = $2
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rowCount > 0;
}

/**
 * Delete all payments for an invoice
 */
export async function deleteInvoicePaymentsByInvoiceId(invoiceId: string, tenantId: string): Promise<boolean> {
  const query = `
    DELETE FROM invoice_payments 
    WHERE invoice_id = $1 AND tenant_id = $2
  `;
  
  const result = await pool.query(query, [invoiceId, tenantId]);
  return result.rowCount > 0;
}

/**
 * Get payments summary for an invoice
 */
export async function getInvoicePaymentsSummary(invoiceId: string, tenantId: string): Promise<{
  totalPayments: number;
  totalAmount: number;
  completedAmount: number;
  pendingAmount: number;
}> {
  const query = `
    SELECT 
      COUNT(*) as total_payments,
      COALESCE(SUM(amount), 0) as total_amount,
      COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END), 0) as completed_amount,
      COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0) as pending_amount
    FROM invoice_payments 
    WHERE invoice_id = $1 AND tenant_id = $2
  `;

  const result = await pool.query(query, [invoiceId, tenantId]);
  const row = result.rows[0];

  return {
    totalPayments: parseInt(row.total_payments),
    totalAmount: parseFloat(row.total_amount),
    completedAmount: parseFloat(row.completed_amount),
    pendingAmount: parseFloat(row.pending_amount),
  };
}

/**
 * Get all payments for a tenant with pagination and filtering
 */
export async function getTenantPayments(
  tenantId: string,
  options: {
    page?: number;
    limit?: number;
    status?: PaymentStatus | 'all';
    paymentMethod?: PaymentMethod | 'all';
    startDate?: Date;
    endDate?: Date;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{ payments: InvoicePayment[]; total: number }> {
  const {
    page = 1,
    limit = 20,
    status = 'all',
    paymentMethod = 'all',
    startDate,
    endDate,
    search,
    sortBy = 'payment_date',
    sortOrder = 'desc'
  } = options;

  const whereConditions: string[] = ['tenant_id = $1'];
  const values: any[] = [tenantId];
  let paramIndex = 2;

  if (status !== 'all') {
    whereConditions.push(`status = $${paramIndex++}`);
    values.push(status);
  }

  if (paymentMethod !== 'all') {
    whereConditions.push(`payment_method = $${paramIndex++}`);
    values.push(paymentMethod);
  }

  if (startDate) {
    whereConditions.push(`payment_date >= $${paramIndex++}`);
    values.push(startDate);
  }

  if (endDate) {
    whereConditions.push(`payment_date <= $${paramIndex++}`);
    values.push(endDate);
  }

  if (search) {
    whereConditions.push(`(description ILIKE $${paramIndex++} OR reference_id ILIKE $${paramIndex++})`);
    values.push(`%${search}%`, `%${search}%`);
  }

  // Map camelCase field names to snake_case database column names
  const columnMapping: { [key: string]: string } = {
    'createdAt': 'created_at',
    'updatedAt': 'updated_at',
    'paymentDate': 'payment_date',
    'paymentMethod': 'payment_method',
    'referenceId': 'reference_id',
    'amount': 'amount',
    'status': 'status'
  };
  
  const dbColumnName = columnMapping[sortBy] || sortBy;
  const orderByClause = `ORDER BY ${dbColumnName} ${sortOrder.toUpperCase()}`;
  const offset = (page - 1) * limit;

  const query = `
    SELECT * FROM invoice_payments 
    WHERE ${whereConditions.join(' AND ')}
    ${orderByClause}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM invoice_payments
    WHERE ${whereConditions.join(' AND ')}
  `;

  values.push(limit, offset);

  const [paymentsResult, countResult] = await Promise.all([
    pool.query(query, values),
    pool.query(countQuery, values.slice(0, -2))
  ]);

  const payments = paymentsResult.rows.map(mapRowToInvoicePayment);

  return {
    payments,
    total: parseInt(countResult.rows[0].total)
  };
}

/**
 * Update payment status
 */
export async function updatePaymentStatus(
  id: string, 
  tenantId: string, 
  status: PaymentStatus, 
  updatedBy: string
): Promise<InvoicePayment | null> {
  const query = `
    UPDATE invoice_payments 
    SET status = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
    WHERE id = $3 AND tenant_id = $4
    RETURNING *
  `;

  const result = await pool.query(query, [status, updatedBy, id, tenantId]);
  return result.rows.length > 0 ? mapRowToInvoicePayment(result.rows[0]) : null;
}

/**
 * Get payment statistics for a tenant
 */
export async function getPaymentStats(tenantId: string): Promise<{
  totalPayments: number;
  totalAmount: number;
  completedAmount: number;
  pendingAmount: number;
  failedAmount: number;
  refundedAmount: number;
}> {
  const query = `
    SELECT 
      COUNT(*) as total_payments,
      COALESCE(SUM(amount), 0) as total_amount,
      COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END), 0) as completed_amount,
      COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0) as pending_amount,
      COALESCE(SUM(CASE WHEN status = 'FAILED' THEN amount ELSE 0 END), 0) as failed_amount,
      COALESCE(SUM(CASE WHEN status = 'REFUNDED' THEN amount ELSE 0 END), 0) as refunded_amount
    FROM invoice_payments 
    WHERE tenant_id = $1
  `;

  const result = await pool.query(query, [tenantId]);
  const row = result.rows[0];

  return {
    totalPayments: parseInt(row.total_payments),
    totalAmount: parseFloat(row.total_amount),
    completedAmount: parseFloat(row.completed_amount),
    pendingAmount: parseFloat(row.pending_amount),
    failedAmount: parseFloat(row.failed_amount),
    refundedAmount: parseFloat(row.refunded_amount),
  };
}

/**
 * Get recent payments for a tenant
 */
export async function getRecentPayments(tenantId: string, limit: number = 10): Promise<InvoicePayment[]> {
  const query = `
    SELECT * FROM invoice_payments 
    WHERE tenant_id = $1
    ORDER BY payment_date DESC, created_at DESC
    LIMIT $2
  `;
  
  const result = await pool.query(query, [tenantId, limit]);
  return result.rows.map(mapRowToInvoicePayment);
}
