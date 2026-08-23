import pool from '../config/dbpool';

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  color: string;
  isActive: boolean;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  deletedBy?: string;
}

export interface CreateCategoryData {
  tenantId: string;
  name: string;
  description?: string;
  color: string;
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateCategoryData {
  name?: string;
  description?: string;
  color?: string;
  isActive?: boolean;
  updatedBy: string;
}

/**
 * Create a new expense category
 */
export async function createCategory(data: CreateCategoryData): Promise<Category> {
  const id = require('crypto').randomUUID();
  const now = new Date();

  const query = `
    INSERT INTO expense_categories (
      id, tenant_id, name, description, color, is_active, 
      created_by, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const values = [
    id,
    data.tenantId,
    data.name,
    data.description || null,
    data.color,
    data.isActive ?? true,
    data.createdBy,
    now,
    now
  ];

  const result = await pool.query(query, values);
  return mapRowToCategory(result.rows[0]);
}

/**
 * Get all categories for a tenant
 */
export async function getCategories(tenantId: string, limit?: number, offset?: number): Promise<{ data: Category[], total: number }> {
  let query = `
    SELECT *, COUNT(*) OVER() as total_count FROM expense_categories 
    WHERE tenant_id = $1 AND deleted_at IS NULL
    ORDER BY created_at DESC
  `;

  const values: any[] = [tenantId];
  if (limit !== undefined && offset !== undefined) {
    query += ` LIMIT $2 OFFSET $3`;
    values.push(limit, offset);
  }

  const result = await pool.query(query, values);
  const data = result.rows.map(mapRowToCategory);
  const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;

  return { data, total };
}

/**
 * Get a single category by ID
 */
export async function getCategoryById(id: string, tenantId: string): Promise<Category | null> {
  const query = `
    SELECT * FROM expense_categories 
    WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `;

  const result = await pool.query(query, [id, tenantId]);
  return result.rows.length > 0 ? mapRowToCategory(result.rows[0]) : null;
}

/**
 * Update an existing category
 */
export async function updateCategory(
  id: string, 
  tenantId: string, 
  data: UpdateCategoryData
): Promise<Category | null> {
  const now = new Date();
  
  // Build dynamic update query
  const updateFields = [];
  const values = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updateFields.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    updateFields.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }
  if (data.color !== undefined) {
    updateFields.push(`color = $${paramIndex++}`);
    values.push(data.color);
  }
  if (data.isActive !== undefined) {
    updateFields.push(`is_active = $${paramIndex++}`);
    values.push(data.isActive);
  }

  if (updateFields.length === 0) {
    throw new Error('No fields to update');
  }

  updateFields.push(`updated_by = $${paramIndex++}`);
  values.push(data.updatedBy);
  updateFields.push(`updated_at = $${paramIndex++}`);
  values.push(now);

  values.push(id, tenantId);

  const query = `
    UPDATE expense_categories 
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++} AND deleted_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToCategory(result.rows[0]) : null;
}

/**
 * Soft delete a category
 */
export async function deleteCategory(
  id: string, 
  tenantId: string, 
  deletedBy: string
): Promise<boolean> {
  const query = `
    UPDATE expense_categories 
    SET deleted_at = $1, deleted_by = $2
    WHERE id = $3 AND tenant_id = $4 AND deleted_at IS NULL
  `;

  const result = await pool.query(query, [new Date(), deletedBy, id, tenantId]);
  return result.rowCount > 0;
}

/**
 * Hard delete a category (permanent)
 */
export async function hardDeleteCategory(id: string, tenantId: string): Promise<boolean> {
  const query = `
    DELETE FROM expense_categories 
    WHERE id = $1 AND tenant_id = $2
  `;

  const result = await pool.query(query, [id, tenantId]);
  return result.rowCount > 0;
}

/**
 * Get category statistics for a tenant
 */
export async function getCategoryStats(tenantId: string): Promise<{
  total: number;
  active: number;
  inactive: number;
}> {
  const query = `
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN is_active = true THEN 1 END) as active,
      COUNT(CASE WHEN is_active = false THEN 1 END) as inactive
    FROM expense_categories 
    WHERE tenant_id = $1 AND deleted_at IS NULL
  `;

  const result = await pool.query(query, [tenantId]);
  const row = result.rows[0];
  
  return {
    total: parseInt(row.total),
    active: parseInt(row.active),
    inactive: parseInt(row.inactive)
  };
}

/**
 * Check if category name exists for a tenant
 */
export async function categoryNameExists(
  name: string, 
  tenantId: string, 
  excludeId?: string
): Promise<boolean> {
  let query = `
    SELECT id FROM expense_categories 
    WHERE name = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `;
  const values = [name, tenantId];

  if (excludeId) {
    query += ` AND id != $3`;
    values.push(excludeId);
  }

  const result = await pool.query(query, values);
  return result.rows.length > 0;
}

/**
 * Map database row to Category interface
 */
function mapRowToCategory(row: any): Category {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    color: row.color,
    isActive: row.is_active,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    deletedBy: row.deleted_by
  };
}
