import pool from "../config/dbpool";

export interface InvoiceAttachment {
  id: string;
  invoiceId: string;
  fileName: string;
  fileUrl: string;
  uploadedBy: string;
  uploadedAt: Date;
}

export interface CreateInvoiceAttachmentData {
  invoiceId: string;
  fileName: string;
  fileUrl: string;
  uploadedBy: string;
}

/**
 * Convert database row (snake_case) to InvoiceAttachment interface (camelCase)
 */
function mapRowToInvoiceAttachment(row: any): InvoiceAttachment {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    fileName: row.file_name,
    fileUrl: row.file_url,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  };
}

/**
 * Create a new invoice attachment
 */
export async function createInvoiceAttachment(data: CreateInvoiceAttachmentData): Promise<InvoiceAttachment> {
  const query = `
    INSERT INTO invoice_attachments (
      invoice_id, file_name, file_url, uploaded_by
    ) 
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  
  const values = [
    data.invoiceId,
    data.fileName,
    data.fileUrl,
    data.uploadedBy,
  ];

  const result = await pool.query(query, values);
  return mapRowToInvoiceAttachment(result.rows[0]);
}

/**
 * Get invoice attachment by ID
 */
export async function getInvoiceAttachmentById(id: string): Promise<InvoiceAttachment | null> {
  const query = `
    SELECT * FROM invoice_attachments 
    WHERE id = $1
  `;
  
  const result = await pool.query(query, [id]);
  return result.rows.length > 0 ? mapRowToInvoiceAttachment(result.rows[0]) : null;
}

/**
 * Get all attachments for an invoice
 */
export async function getInvoiceAttachments(invoiceId: string): Promise<InvoiceAttachment[]> {
  const query = `
    SELECT * FROM invoice_attachments 
    WHERE invoice_id = $1
    ORDER BY uploaded_at DESC
  `;
  
  const result = await pool.query(query, [invoiceId]);
  return result.rows.map(mapRowToInvoiceAttachment);
}

/**
 * Delete invoice attachment
 */
export async function deleteInvoiceAttachment(id: string): Promise<boolean> {
  const query = `
    DELETE FROM invoice_attachments 
    WHERE id = $1
  `;
  
  const result = await pool.query(query, [id]);
  return result.rowCount > 0;
}

/**
 * Delete all attachments for an invoice
 */
export async function deleteInvoiceAttachmentsByInvoiceId(invoiceId: string): Promise<boolean> {
  const query = `
    DELETE FROM invoice_attachments 
    WHERE invoice_id = $1
  `;
  
  const result = await pool.query(query, [invoiceId]);
  return result.rowCount > 0;
}

/**
 * Update invoice attachment
 */
export async function updateInvoiceAttachment(
  id: string, 
  data: Partial<Pick<InvoiceAttachment, 'fileName' | 'fileUrl'>>
): Promise<InvoiceAttachment | null> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.fileName !== undefined) {
    setClause.push(`file_name = $${paramIndex++}`);
    values.push(data.fileName);
  }
  if (data.fileUrl !== undefined) {
    setClause.push(`file_url = $${paramIndex++}`);
    values.push(data.fileUrl);
  }

  if (setClause.length === 0) {
    return null; // No fields to update
  }

  const query = `
    UPDATE invoice_attachments 
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  values.push(id);

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToInvoiceAttachment(result.rows[0]) : null;
}

/**
 * Get attachment count for an invoice
 */
export async function getInvoiceAttachmentCount(invoiceId: string): Promise<number> {
  const query = `
    SELECT COUNT(*) as count
    FROM invoice_attachments 
    WHERE invoice_id = $1
  `;

  const result = await pool.query(query, [invoiceId]);
  return parseInt(result.rows[0].count);
}
