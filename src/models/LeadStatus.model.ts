import pool from '@/config/dbpool';

export interface LeadStatusData {
  id?: string;
  tenant_id: string;
  name: string;
  category: string;
  applies_to: string[];
  color: string;
  is_default: boolean;
  is_final_stage: boolean;
  is_active: boolean;
  order: number;
  icon?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class LeadStatusModel {
  /**
   * Create a new lead status
   */
  static async create(data: Partial<LeadStatusData> & { tenant_id: string; name: string; category: string; color: string }): Promise<any> {
    const query = `
      INSERT INTO lead_statuses (
        tenant_id, name, category, applies_to, color,
        is_default, is_final_stage, is_active, "order", icon
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;

    const values = [
      data.tenant_id,
      data.name,
      data.category,
      JSON.stringify(data.applies_to || []),
      data.color,
      data.is_default ?? false,
      data.is_final_stage ?? false,
      data.is_active ?? true,
      data.order ?? 0,
      data.icon ?? null,
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('DATABASE ERROR in LeadStatusModel.create:', error.message);
      throw error;
    }
  }

  /**
   * Find all lead statuses for a tenant
   */
  static async findAll(tenantId: string): Promise<any[]> {
    const query = `
      SELECT * FROM lead_statuses 
      WHERE tenant_id = $1 
      ORDER BY "order" ASC, created_at ASC;
    `;
    const result = await pool.query(query, [tenantId]);
    return result.rows;
  }

  /**
   * Find lead statuses with pagination, search, and filtering
   */
  static async findWithPagination(tenantId: string, options: {
    page: number;
    limit: number;
    offset: number;
    search?: string;
    filter?: string;
  }): Promise<{
    statuses: any[];
    total: number;
    totalActive: number;
    totalFinal: number;
    totalDefault: number;
  }> {
    const whereClauses = ['tenant_id = $1'];
    const values: any[] = [tenantId];
    let paramIndex = 2;

    if (options.search) {
      whereClauses.push(`(name ILIKE $${paramIndex} OR category ILIKE $${paramIndex})`);
      values.push(`%${options.search}%`);
      paramIndex++;
    }

    if (options.filter === 'active') {
      whereClauses.push(`is_active = true`);
    } else if (options.filter === 'hidden') {
      whereClauses.push(`is_active = false`);
    }

    const whereSql = whereClauses.join(' AND ');

    // Filtered count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM lead_statuses WHERE ${whereSql}`,
      values
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Global stats for tenant
    const statsResult = await pool.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE is_active = true) as active,
         COUNT(*) FILTER (WHERE is_final_stage = true) as final,
         COUNT(*) FILTER (WHERE is_default = true) as default
       FROM lead_statuses 
       WHERE tenant_id = $1`,
      [tenantId]
    );
    const totalActive = parseInt(statsResult.rows[0]?.active || '0', 10);
    const totalFinal = parseInt(statsResult.rows[0]?.final || '0', 10);
    const totalDefault = parseInt(statsResult.rows[0]?.default || '0', 10);

    // Items
    const query = `
      SELECT * FROM lead_statuses 
      WHERE ${whereSql}
      ORDER BY "order" ASC, created_at ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;
    const result = await pool.query(query, [...values, options.limit, options.offset]);

    return {
      statuses: result.rows,
      total,
      totalActive,
      totalFinal,
      totalDefault,
    };
  }

  /**
   * Find default status for a tenant
   */
  static async findDefault(tenantId: string): Promise<any> {
    const query = `
      SELECT * FROM lead_statuses 
      WHERE tenant_id = $1 AND is_default = true 
      LIMIT 1;
    `;
    const result = await pool.query(query, [tenantId]);
    return result.rows[0];
  }

  /**
   * Find by ID and tenant
   */
  static async findById(id: string, tenantId: string): Promise<any> {
    const query = `
      SELECT * FROM lead_statuses 
      WHERE id = $1 AND tenant_id = $2;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return result.rows[0];
  }

  /**
   * Update a lead status
   */
  static async update(id: string, tenantId: string, data: Partial<LeadStatusData>): Promise<any> {
    const fields: string[] = [];
    const values: any[] = [];
    let placeholderIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'tenant_id' && key !== 'created_at' && key !== 'updated_at') {
        fields.push(`"${key}" = $${placeholderIndex}`);
        values.push(Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : value);
        placeholderIndex++;
      }
    });

    if (fields.length === 0) return null;

    values.push(id, tenantId);
    const query = `
      UPDATE lead_statuses 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${placeholderIndex} AND tenant_id = $${placeholderIndex + 1}
      RETURNING *;
    `;

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('DATABASE ERROR in LeadStatusModel.update:', error.message);
      throw error;
    }
  }

  /**
   * Delete a lead status
   */
  static async delete(id: string, tenantId: string): Promise<boolean> {
    const query = `
      DELETE FROM lead_statuses 
      WHERE id = $1 AND tenant_id = $2;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }
}
