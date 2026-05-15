import pool from '@/config/dbpool';

export interface ProposalData {
  id?: string;
  tenant_id: string;
  lead_id?: string;
  title: string;
  client_name?: string;
  blocks_data: any;
  status?: string;
  created_by?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class ProposalModel {
  /**
   * Create a new proposal
   */
  static async create(data: ProposalData): Promise<any> {
    const query = `
      INSERT INTO proposals (tenant_id, lead_id, title, client_name, blocks_data, status, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    const values = [
      data.tenant_id,
      data.lead_id,
      data.title,
      data.client_name,
      typeof data.blocks_data === 'string' ? data.blocks_data : JSON.stringify(data.blocks_data),
      data.status || 'draft',
      data.created_by
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Find all proposals for a tenant
   */
  static async findAll(tenantId: string): Promise<any[]> {
    const query = `
      SELECT id, title, client_name, status, created_at 
      FROM proposals 
      WHERE tenant_id = $1 
      ORDER BY created_at DESC;
    `;
    const result = await pool.query(query, [tenantId]);
    return result.rows;
  }

  /**
   * Find a specific proposal by ID and tenant ID
   */
  static async findById(id: string, tenantId: string): Promise<any> {
    const query = `
      SELECT * FROM proposals 
      WHERE id = $1 AND tenant_id = $2;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return result.rows[0];
  }

  /**
   * Update a proposal
   */
  static async update(id: string, tenantId: string, data: Partial<ProposalData>): Promise<any> {
    const fields: string[] = [];
    const values: any[] = [];
    let placeholderIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'tenant_id' && key !== 'created_at' && value !== undefined) {
        fields.push(`${key} = $${placeholderIndex}`);
        
        if (value === null) {
          values.push(null);
        } else if (key === 'blocks_data' && typeof value !== 'string') {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
        
        placeholderIndex++;
      }
    });

    if (fields.length === 0) return null;

    values.push(id, tenantId);
    const query = `
      UPDATE proposals 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${placeholderIndex} AND tenant_id = $${placeholderIndex + 1}
      RETURNING *;
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Delete a proposal
   */
  static async delete(id: string, tenantId: string): Promise<boolean> {
    const query = `
      DELETE FROM proposals 
      WHERE id = $1 AND tenant_id = $2;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }
}
