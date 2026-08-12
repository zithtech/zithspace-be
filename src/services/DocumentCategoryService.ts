import pool from '../config/dbpool';

const DEFAULT_CATEGORIES = [
  { categoryName: 'Offer Letter', description: 'Letters extended to selected candidates offering employment.' },
  { categoryName: 'Appointment Letter', description: 'Formal employment appointment documents.' },
  { categoryName: 'Experience Certificate', description: 'Certificates detailing past employment duration and roles.' },
  { categoryName: 'Promotion Letter', description: 'Letters detailing career advancement and new designations.' },
  { categoryName: 'Salary Revision Letter', description: 'Letters confirming compensation changes or increments.' },
  { categoryName: 'Legal Agreement', description: 'NDAs, non-compete, and other legal HR contracts.' },
  { categoryName: 'Relieving Letter', description: 'Formal acknowledgment of employee relieving from duties.' },
  { categoryName: 'Warning Letter', description: 'Formal disciplinary or warning notices.' },
  { categoryName: 'General HR Document', description: 'Miscellaneous organizational HR communications.' },
];

export class DocumentCategoryService {
  /**
   * Get all document categories for a tenant.
   * If none exist, automatically seed default HR categories.
   */
  static async getCategories(tenantId: string) {
    let result = await pool.query(
      `SELECT id, tenant_id AS "tenantId", category_name AS "categoryName", description, status, created_at AS "createdAt", updated_at AS "updatedAt" FROM document_categories WHERE tenant_id = $1 ORDER BY category_name ASC`,
      [tenantId]
    );
    let categories = result.rows;

    if (categories.length === 0) {
      // Seed default categories
      for (const c of DEFAULT_CATEGORIES) {
        await pool.query(
          `INSERT INTO document_categories (id, tenant_id, category_name, description, status, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE', NOW(), NOW())`,
          [tenantId, c.categoryName, c.description || null]
        );
      }
      
      const refreshResult = await pool.query(
        `SELECT id, tenant_id AS "tenantId", category_name AS "categoryName", description, status, created_at AS "createdAt", updated_at AS "updatedAt" FROM document_categories WHERE tenant_id = $1 ORDER BY category_name ASC`,
        [tenantId]
      );
      categories = refreshResult.rows;
    }

    return categories;
  }

  static async getCategoryById(tenantId: string, id: string) {
    const result = await pool.query(
      `SELECT id, tenant_id AS "tenantId", category_name AS "categoryName", description, status, created_at AS "createdAt", updated_at AS "updatedAt" FROM document_categories WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [id, tenantId]
    );
    return result.rows[0] || null;
  }

  static async createCategory(tenantId: string, data: { categoryName: string; description?: string; status?: string }) {
    const result = await pool.query(
      `INSERT INTO document_categories (id, tenant_id, category_name, description, status, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW()) RETURNING id, tenant_id AS "tenantId", category_name AS "categoryName", description, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [tenantId, data.categoryName, data.description || null, data.status || 'ACTIVE']
    );
    return result.rows[0];
  }

  static async updateCategory(tenantId: string, id: string, data: { categoryName?: string; description?: string; status?: string }) {
    const existing = await this.getCategoryById(tenantId, id);
    if (!existing) {
      throw new Error('Category not found');
    }

    const updates = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.categoryName !== undefined) {
      updates.push(`category_name = $${paramIndex++}`);
      values.push(data.categoryName);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }
    
    updates.push(`updated_at = NOW()`);

    values.push(id);
    values.push(tenantId);
    const idParam = `$${paramIndex++}`;
    const tenantIdParam = `$${paramIndex++}`;

    const updateQuery = `UPDATE document_categories SET ${updates.join(', ')} WHERE id = ${idParam} AND tenant_id = ${tenantIdParam} RETURNING id, tenant_id AS "tenantId", category_name AS "categoryName", description, status, created_at AS "createdAt", updated_at AS "updatedAt"`;
    
    const result = await pool.query(updateQuery, values);
    return result.rows[0];
  }

  static async deleteCategory(tenantId: string, id: string) {
    const existing = await this.getCategoryById(tenantId, id);
    if (!existing) {
      throw new Error('Category not found');
    }
    const result = await pool.query(
      `DELETE FROM document_categories WHERE id = $1 AND tenant_id = $2 RETURNING id, tenant_id AS "tenantId", category_name AS "categoryName", description, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [id, tenantId]
    );
    return result.rows[0];
  }
}
