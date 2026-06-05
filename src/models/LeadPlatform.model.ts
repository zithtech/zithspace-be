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
