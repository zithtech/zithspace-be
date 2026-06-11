import pool from '@/config/dbpool';

/**
 * ProposalSection — reusable, composed building block for proposals.
 * Raw PostgreSQL queries (no Prisma), matching the Proposals module.
 */
export interface ProposalSectionData {
  id?: string;
  tenant_id: string;
  name: string;
  category?: string;
  type?: string;
  description?: string;
  components?: any;
  data?: any;
  is_global?: boolean;
  archived?: boolean;
  is_system?: boolean;
  created_by?: string;
}

// Projection that returns rows already shaped for the frontend (camelCase).
const COLS = `
  id,
  name,
  category,
  type,
  description,
  components,
  data,
  is_global   AS "isGlobal",
  archived,
  is_system   AS "system",
  created_by  AS "createdBy",
  created_at  AS "createdAt",
  updated_at  AS "updatedAt"
`;

const toJson = (v: any, fallback: string): string =>
  v === undefined || v === null ? fallback : (typeof v === 'string' ? v : JSON.stringify(v));

export class ProposalSectionModel {
  /** Create a new section. */
  static async create(data: ProposalSectionData): Promise<any> {
    const query = `
      INSERT INTO proposal_sections
        (tenant_id, name, category, type, description, components, data, is_global, is_system, created_by)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10)
      RETURNING ${COLS};
    `;
    const values = [
      data.tenant_id,
      data.name,
      data.category || 'Custom',
      data.type || 'text',
      data.description ?? null,
      toJson(data.components, '[]'),
      toJson(data.data, '{}'),
      data.is_global ?? false,
      data.is_system ?? false,
      data.created_by ?? null,
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /** List sections for a tenant. Pass includeArchived=false to hide archived. */
  static async findAll(tenantId: string, includeArchived = true): Promise<any[]> {
    const query = `
      SELECT ${COLS}
      FROM proposal_sections
      WHERE tenant_id = $1
        ${includeArchived ? '' : 'AND archived = false'}
      ORDER BY created_at DESC;
    `;
    const result = await pool.query(query, [tenantId]);
    return result.rows;
  }

  /** Find a single section scoped to the tenant. */
  static async findById(id: string, tenantId: string): Promise<any | null> {
    const query = `
      SELECT ${COLS}
      FROM proposal_sections
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return result.rows[0] || null;
  }

  /** Patch a section. Only provided fields are updated. */
  static async update(id: string, tenantId: string, patch: Partial<ProposalSectionData>): Promise<any | null> {
    const sets: string[] = [];
    const values: any[] = [];
    let i = 1;

    const push = (col: string, val: any, cast = '') => {
      sets.push(`${col} = $${i}${cast}`);
      values.push(val);
      i++;
    };

    if (patch.name !== undefined) push('name', patch.name);
    if (patch.category !== undefined) push('category', patch.category);
    if (patch.type !== undefined) push('type', patch.type);
    if (patch.description !== undefined) push('description', patch.description);
    if (patch.components !== undefined) push('components', toJson(patch.components, '[]'), '::jsonb');
    if (patch.data !== undefined) push('data', toJson(patch.data, '{}'), '::jsonb');
    if (patch.is_global !== undefined) push('is_global', patch.is_global);
    if (patch.archived !== undefined) push('archived', patch.archived);

    if (sets.length === 0) {
      return this.findById(id, tenantId);
    }

    sets.push(`updated_at = CURRENT_TIMESTAMP`);

    const query = `
      UPDATE proposal_sections
      SET ${sets.join(', ')}
      WHERE id = $${i} AND tenant_id = $${i + 1}
      RETURNING ${COLS};
    `;
    values.push(id, tenantId);

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /** Archive or restore a section. */
  static async setArchived(id: string, tenantId: string, archived: boolean): Promise<any | null> {
    const query = `
      UPDATE proposal_sections
      SET archived = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND tenant_id = $3
      RETURNING ${COLS};
    `;
    const result = await pool.query(query, [archived, id, tenantId]);
    return result.rows[0] || null;
  }

  /** Duplicate a section into a fresh, editable copy. */
  static async duplicate(id: string, tenantId: string, createdBy?: string): Promise<any | null> {
    const src = await pool.query(
      `SELECT name, category, type, description, components, data
         FROM proposal_sections
        WHERE id = $1 AND tenant_id = $2
        LIMIT 1;`,
      [id, tenantId],
    );
    const row = src.rows[0];
    if (!row) return null;

    return this.create({
      tenant_id: tenantId,
      name: `${row.name} (Copy)`,
      category: row.category,
      type: row.type,
      description: row.description,
      components: row.components,
      data: row.data,
      is_global: false,
      is_system: false,
      created_by: createdBy,
    });
  }

  /** Permanently delete a section. Returns the deleted id or null. */
  static async remove(id: string, tenantId: string): Promise<string | null> {
    const result = await pool.query(
      `DELETE FROM proposal_sections WHERE id = $1 AND tenant_id = $2 RETURNING id;`,
      [id, tenantId],
    );
    return result.rows[0]?.id || null;
  }
}
