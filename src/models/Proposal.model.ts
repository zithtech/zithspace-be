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
   * Find all proposals for a tenant. Embeds the creator user as a nested
   * `createdBy` object so the table can render an avatar + name without a
   * second round-trip.
   */
  static async findAll(tenantId: string): Promise<any[]> {
    const query = `
      SELECT
        p.id,
        p.title,
        p.client_name,
        p.status,
        p.created_at,
        p.updated_at,
        p.created_by,
        (
          SELECT json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url)
          FROM users u
          WHERE u.id = p.created_by
        ) AS "createdBy"
      FROM proposals p
      WHERE p.tenant_id = $1
      ORDER BY p.created_at DESC;
    `;
    const result = await pool.query(query, [tenantId]);
    return result.rows;
  }

  /**
   * Find a specific proposal by ID and tenant ID. Embeds the creator as a
   * nested `createdBy` object so detail pages can render an avatar + name.
   */
  static async findById(id: string, tenantId: string): Promise<any> {
    const query = `
      SELECT
        p.*,
        (
          SELECT json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url)
          FROM users u
          WHERE u.id = p.created_by
        ) AS "createdBy"
      FROM proposals p
      WHERE p.id = $1 AND p.tenant_id = $2;
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
      if (key !== 'id' && key !== 'tenant_id' && key !== 'created_at') {
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
