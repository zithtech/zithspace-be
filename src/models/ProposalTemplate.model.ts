import pool from '@/config/dbpool';

/**
 * ProposalTemplate — reusable blueprint that composes an ordered list of
 * proposal_sections with a theme + font preset. Raw PostgreSQL queries
 * (no Prisma), matching the Proposals / Proposal Sections modules.
 */
export interface ProposalTemplateData {
  id?: string;
  tenant_id: string;
  name: string;
  description?: string;
  blocks?: any[];
  section_ids?: string[];
  theme_id?: string;
  font_id?: string;
  archived?: boolean;
  is_system?: boolean;
  created_by?: string;
}

// Projection that returns rows already shaped for the frontend (camelCase).
const COLS = `
  id,
  name,
  description,
  blocks,
  section_ids AS "sectionIds",
  theme_id    AS "themeId",
  font_id     AS "fontId",
  archived,
  is_system   AS "system",
  created_by  AS "createdBy",
  created_at  AS "createdAt",
  updated_at  AS "updatedAt"
`;

const toJsonArray = (v: any): string =>
  v === undefined || v === null ? '[]' : (typeof v === 'string' ? v : JSON.stringify(v));

export class ProposalTemplateModel {
  /** Create a new template. */
  static async create(data: ProposalTemplateData): Promise<any> {
    const query = `
      INSERT INTO proposal_templates
        (tenant_id, name, description, blocks, section_ids, theme_id, font_id, is_system, created_by)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)
      RETURNING ${COLS};
    `;
    const values = [
      data.tenant_id,
      data.name,
      data.description ?? null,
      toJsonArray(data.blocks),
      toJsonArray(data.section_ids),
      data.theme_id || 'azure',
      data.font_id || 'inter',
      data.is_system ?? false,
      data.created_by ?? null,
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /** List templates for a tenant. Pass includeArchived=false to hide archived. */
  static async findAll(tenantId: string, includeArchived = true): Promise<any[]> {
    const query = `
      SELECT ${COLS}
      FROM proposal_templates
      WHERE tenant_id = $1
        ${includeArchived ? '' : 'AND archived = false'}
      ORDER BY created_at DESC;
    `;
    const result = await pool.query(query, [tenantId]);
    return result.rows;
  }

  /** Find a single template scoped to the tenant. */
  static async findById(id: string, tenantId: string): Promise<any | null> {
    const query = `
      SELECT ${COLS}
      FROM proposal_templates
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return result.rows[0] || null;
  }

  /** Patch a template. Only provided fields are updated. */
  static async update(id: string, tenantId: string, patch: Partial<ProposalTemplateData>): Promise<any | null> {
    const sets: string[] = [];
    const values: any[] = [];
    let i = 1;

    const push = (col: string, val: any, cast = '') => {
      sets.push(`${col} = $${i}${cast}`);
      values.push(val);
      i++;
    };

    if (patch.name !== undefined) push('name', patch.name);
    if (patch.description !== undefined) push('description', patch.description);
    if (patch.blocks !== undefined) push('blocks', toJsonArray(patch.blocks), '::jsonb');
    if (patch.section_ids !== undefined) push('section_ids', toJsonArray(patch.section_ids), '::jsonb');
    if (patch.theme_id !== undefined) push('theme_id', patch.theme_id);
    if (patch.font_id !== undefined) push('font_id', patch.font_id);
    if (patch.archived !== undefined) push('archived', patch.archived);

    if (sets.length === 0) {
      return this.findById(id, tenantId);
    }

    sets.push(`updated_at = CURRENT_TIMESTAMP`);

    const query = `
      UPDATE proposal_templates
      SET ${sets.join(', ')}
      WHERE id = $${i} AND tenant_id = $${i + 1}
      RETURNING ${COLS};
    `;
    values.push(id, tenantId);

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /** Archive or restore a template. */
  static async setArchived(id: string, tenantId: string, archived: boolean): Promise<any | null> {
    const query = `
      UPDATE proposal_templates
      SET archived = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND tenant_id = $3
      RETURNING ${COLS};
    `;
    const result = await pool.query(query, [archived, id, tenantId]);
    return result.rows[0] || null;
  }

  /** Duplicate a template into a fresh, editable copy. */
  static async duplicate(id: string, tenantId: string, createdBy?: string): Promise<any | null> {
    const src = await pool.query(
      `SELECT name, description, blocks, section_ids, theme_id, font_id
         FROM proposal_templates
        WHERE id = $1 AND tenant_id = $2
        LIMIT 1;`,
      [id, tenantId],
    );
    const row = src.rows[0];
    if (!row) return null;

    return this.create({
      tenant_id: tenantId,
      name: `${row.name} (Copy)`,
      description: row.description,
      blocks: row.blocks,
      section_ids: row.section_ids,
      theme_id: row.theme_id,
      font_id: row.font_id,
      is_system: false,
      created_by: createdBy,
    });
  }

  /** Permanently delete a template. Returns the deleted id or null. */
  static async remove(id: string, tenantId: string): Promise<string | null> {
    const result = await pool.query(
      `DELETE FROM proposal_templates WHERE id = $1 AND tenant_id = $2 RETURNING id;`,
      [id, tenantId],
    );
    return result.rows[0]?.id || null;
  }
}
