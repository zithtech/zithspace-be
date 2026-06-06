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
