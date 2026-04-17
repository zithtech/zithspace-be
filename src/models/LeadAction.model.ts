import pool from '@/config/dbpool';

export interface LeadActionData {
  id?: string;
  tenant_id: string;
  name: string;
  type: string;
  icon: string;
  color: string;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class LeadActionModel {
  /**
   * Create a new lead action
   */
  static async create(data: Partial<LeadActionData> & { tenant_id: string; name: string; type: string; icon: string; color: string }): Promise<any> {
    const query = `
      INSERT INTO lead_actions (
        tenant_id, name, type, icon, color, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    const values = [
      data.tenant_id,
      data.name,
      data.type,
      data.icon,
      data.color,
      data.is_active ?? true
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('DATABASE ERROR in LeadActionModel.create:', error.message);
      throw error;
    }
  }

  /**
   * Find all lead actions for a tenant
   */
  static async findAll(tenantId: string): Promise<any[]> {
    const query = `
      SELECT * FROM lead_actions 
      WHERE tenant_id = $1 
      ORDER BY created_at ASC;
    `;
    const result = await pool.query(query, [tenantId]);
    return result.rows;
  }

  /**
   * Find by ID and tenant
   */
  static async findById(id: string, tenantId: string): Promise<any> {
    const query = `
      SELECT * FROM lead_actions 
      WHERE id = $1 AND tenant_id = $2;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return result.rows[0];
  }

  /**
   * Update a lead action
   */
  static async update(id: string, tenantId: string, data: Partial<LeadActionData>): Promise<any> {
    const fields: string[] = [];
    const values: any[] = [];
    let placeholderIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'tenant_id' && key !== 'created_at' && key !== 'updated_at') {
        fields.push(`"${key}" = $${placeholderIndex}`);
        values.push(value);
        placeholderIndex++;
      }
    });

    if (fields.length === 0) return null;

    values.push(id, tenantId);
    const query = `
      UPDATE lead_actions 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${placeholderIndex} AND tenant_id = $${placeholderIndex + 1}
      RETURNING *;
    `;

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('DATABASE ERROR in LeadActionModel.update:', error.message);
      throw error;
    }
  }

  /**
   * Delete a lead action
   */
  static async delete(id: string, tenantId: string): Promise<boolean> {
    const query = `
      DELETE FROM lead_actions 
      WHERE id = $1 AND tenant_id = $2;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }
}
