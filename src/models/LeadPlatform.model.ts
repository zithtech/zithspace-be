import pool from '@/config/dbpool';

export interface LeadPlatformData {
  id?: string;
  tenant_id: string;
  name: string;
  code: string;
  type: 'online' | 'website';
  url?: string;
  logo_url?: string;
  description?: string;
  is_active?: boolean;
  order?: number;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Derive a stable `code` from the human name.
 * "Upwork" → "UPWORK", "Own Website" → "OWN_WEBSITE", "Zithmi Tech!" → "ZITHMI_TECH".
 */
export const deriveCode = (name: string): string => {
  return (name || '')
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}\s]/gu, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .slice(0, 80);
};

export class LeadPlatformModel {
  static async create(data: Partial<LeadPlatformData> & {
    tenant_id: string;
    name: string;
    type: 'online' | 'website';
  }): Promise<any> {
    const code = data.code || deriveCode(data.name);
    const query = `
      INSERT INTO lead_platforms (
        tenant_id, name, code, type, url, logo_url, description, is_active, "order"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    const values = [
      data.tenant_id,
      data.name,
      code,
      data.type,
      data.url || null,
      data.logo_url || null,
      data.description || null,
      data.is_active ?? true,
      data.order ?? 0,
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findAll(tenantId: string): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM lead_platforms
        WHERE tenant_id = $1
        ORDER BY "order" ASC, created_at ASC`,
      [tenantId],
    );
    return result.rows;
  }

  static async findWithPagination(tenantId: string, options: {
    page: number;
    limit: number;
    offset: number;
    search?: string;
    filter?: string;
  }): Promise<{
    platforms: any[];
    total: number;
    totalActive: number;
  }> {
    const whereClauses = ['tenant_id = $1'];
    const values: any[] = [tenantId];
    let paramIndex = 2;

    if (options.search) {
      whereClauses.push(`(name ILIKE $${paramIndex} OR code ILIKE $${paramIndex} OR url ILIKE $${paramIndex} OR type ILIKE $${paramIndex})`);
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
      `SELECT COUNT(*) as count FROM lead_platforms WHERE ${whereSql}`,
      values
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Global stats
    const statsResult = await pool.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE is_active = true) as active
       FROM lead_platforms 
       WHERE tenant_id = $1`,
      [tenantId]
    );
    const totalActive = parseInt(statsResult.rows[0]?.active || '0', 10);

    // Items
    const query = `
      SELECT * FROM lead_platforms 
      WHERE ${whereSql}
      ORDER BY "order" ASC, created_at ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;
    const result = await pool.query(query, [...values, options.limit, options.offset]);

    return {
      platforms: result.rows,
      total,
      totalActive,
    };
  }

  static async findById(id: string, tenantId: string): Promise<any> {
    const result = await pool.query(
      `SELECT * FROM lead_platforms WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return result.rows[0];
  }

  /**
   * Update. `code` cannot be changed once set — it's the stable handle
   * the leads page uses to match a platform.
   */
  static async update(
    id: string,
    tenantId: string,
    data: Partial<LeadPlatformData>,
  ): Promise<any> {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (
        key === 'id' ||
        key === 'tenant_id' ||
        key === 'code' ||
        key === 'created_at' ||
        key === 'updated_at'
      ) return;
      fields.push(`"${key}" = $${i}`);
      values.push(value);
      i++;
    });

    if (fields.length === 0) return null;

    values.push(id, tenantId);
    const query = `
      UPDATE lead_platforms
         SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${i} AND tenant_id = $${i + 1}
       RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM lead_platforms WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
