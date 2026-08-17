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
   * Find all proposals for a tenant with pagination and filters.
   */
  static async findAll(options: {
    tenantId: string;
    userId?: string;
    page?: number;
    limit?: number;
    search?: string;
    view?: string;
    status?: string;
    client?: string;
    creator?: string;
    startDate?: string;
    endDate?: string;
    starredIds?: string[];
  }): Promise<{ data: any[]; total: number }> {
    const { tenantId, userId, page, limit, search, view, status, client, creator, startDate, endDate, starredIds } = options;

    let whereClause = `p.tenant_id = $1 AND p.deleted_at IS NULL`;
    const values: any[] = [tenantId];
    let paramIdx = 2;

    if (view === 'mine' && userId) {
      whereClause += ` AND p.created_by = $${paramIdx++}`;
      values.push(userId);
    } else if (view === 'sent') {
      whereClause += ` AND p.status = 'sent'`;
    } else if (view === 'starred' && starredIds && starredIds.length > 0) {
      whereClause += ` AND p.id = ANY($${paramIdx++})`;
      values.push(starredIds);
    } else if (view === 'starred' && (!starredIds || starredIds.length === 0)) {
      // If starred view but no starred ids, return nothing
      whereClause += ` AND false`;
    }

    if (search) {
      whereClause += ` AND (p.title ILIKE $${paramIdx} OR p.client_name ILIKE $${paramIdx})`;
      values.push(`%${search}%`);
      paramIdx++;
    }

    if (status && status !== 'all') {
      whereClause += ` AND p.status = $${paramIdx++}`;
      values.push(status);
    }

    if (client) {
      whereClause += ` AND p.client_name = $${paramIdx++}`;
      values.push(client);
    }

    if (creator) {
      whereClause += ` AND p.created_by = $${paramIdx++}`;
      values.push(creator);
    }

    if (startDate && endDate) {
      whereClause += ` AND p.created_at >= $${paramIdx++} AND p.created_at <= $${paramIdx++}`;
      values.push(startDate, endDate);
    }

    const countQuery = `SELECT COUNT(*) FROM proposals p WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count, 10);

    let limitOffsetClause = "";
    if (limit) {
      limitOffsetClause = `LIMIT $${paramIdx++}`;
      values.push(limit);
      if (page) {
        limitOffsetClause += ` OFFSET $${paramIdx++}`;
        values.push((page - 1) * limit);
      }
    }
    const query = `
      SELECT
        p.id,
        p.title,
        p.client_name,
        p.status,
        p.created_at,
        p.updated_at,
        p.created_by,
        p.lead_id,
        l.client_mail,
        lm.last_mail_at,
        (COALESCE(l.is_mail_sent, false) OR lm.last_mail_at IS NOT NULL) as is_mail_sent,
        (
          SELECT json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url)
          FROM users u
          WHERE u.id = p.created_by
        ) AS "createdBy"
      FROM proposals p
      LEFT JOIN leads l ON l.id = p.lead_id
      LEFT JOIN (
        SELECT lead_id, MAX(sent_at) as last_mail_at
        FROM lead_mails
        WHERE tenant_id = $1
        GROUP BY lead_id
      ) lm ON p.lead_id = lm.lead_id
      WHERE ${whereClause}
      ORDER BY p.created_at DESC
      ${limitOffsetClause};
    `;
    const result = await pool.query(query, values);
    return { data: result.rows, total };
  }

  /**
   * Find all trashed proposals for a tenant.
   */
  static async findTrashed(options: {
    tenantId: string;
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    client?: string;
    creator?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ data: any[]; total: number }> {
    const { tenantId, page, limit, search, status, client, creator, startDate, endDate } = options;

    let whereClause = `p.tenant_id = $1 AND p.deleted_at IS NOT NULL`;
    const values: any[] = [tenantId];
    let paramIdx = 2;

    if (search) {
      whereClause += ` AND (p.title ILIKE $${paramIdx} OR p.client_name ILIKE $${paramIdx})`;
      values.push(`%${search}%`);
      paramIdx++;
    }

    if (status && status !== 'all') {
      whereClause += ` AND p.status = $${paramIdx++}`;
      values.push(status);
    }

    if (client) {
      whereClause += ` AND p.client_name = $${paramIdx++}`;
      values.push(client);
    }

    if (creator) {
      whereClause += ` AND p.created_by = $${paramIdx++}`;
      values.push(creator);
    }

    if (startDate && endDate) {
      whereClause += ` AND p.created_at >= $${paramIdx++} AND p.created_at <= $${paramIdx++}`;
      values.push(startDate, endDate);
    }

    const countQuery = `SELECT COUNT(*) FROM proposals p WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count, 10);

    let limitOffsetClause = "";
    if (limit) {
      limitOffsetClause = `LIMIT $${paramIdx++}`;
      values.push(limit);
      if (page) {
        limitOffsetClause += ` OFFSET $${paramIdx++}`;
        values.push((page - 1) * limit);
      }
    }

    const query = `
      SELECT
        p.id,
        p.title,
        p.client_name,
        p.status,
        p.created_at,
        p.updated_at,
        p.deleted_at,
        p.created_by,
        p.lead_id,
        l.client_mail,
        lm.last_mail_at,
        (COALESCE(l.is_mail_sent, false) OR lm.last_mail_at IS NOT NULL) as is_mail_sent,
        (
          SELECT json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url)
          FROM users u
          WHERE u.id = p.created_by
        ) AS "createdBy"
      FROM proposals p
      LEFT JOIN leads l ON l.id = p.lead_id
      LEFT JOIN (
        SELECT lead_id, MAX(sent_at) as last_mail_at
        FROM lead_mails
        WHERE tenant_id = $1
        GROUP BY lead_id
      ) lm ON p.lead_id = lm.lead_id
      WHERE ${whereClause}
      ORDER BY p.deleted_at DESC
      ${limitOffsetClause};
    `;
    const result = await pool.query(query, values);
    return { data: result.rows, total };
  }

  /**
   * Find a specific proposal by ID and tenant ID. Embeds the creator as a
   * nested `createdBy` object so detail pages can render an avatar + name.
   */
  static async findById(id: string, tenantId: string): Promise<any> {
    const query = `
      SELECT
        p.*,
        l.client_mail,
        lm.last_mail_at,
        (COALESCE(l.is_mail_sent, false) OR lm.last_mail_at IS NOT NULL) as is_mail_sent,
        (
          SELECT json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url)
          FROM users u
          WHERE u.id = p.created_by
        ) AS "createdBy"
      FROM proposals p
      LEFT JOIN leads l ON l.id = p.lead_id
      LEFT JOIN (
        SELECT lead_id, MAX(sent_at) as last_mail_at
        FROM lead_mails
        WHERE tenant_id = $2
        GROUP BY lead_id
      ) lm ON p.lead_id = lm.lead_id
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
   * Soft delete a proposal (move to trash)
   */
  static async delete(id: string, tenantId: string): Promise<boolean> {
    const query = `
      UPDATE proposals 
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Restore a proposal from trash
   */
  static async restore(id: string, tenantId: string): Promise<boolean> {
    const query = `
      UPDATE proposals 
      SET deleted_at = NULL
      WHERE id = $1 AND tenant_id = $2;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Permanently delete a proposal
   */
  static async hardDelete(id: string, tenantId: string): Promise<boolean> {
    const query = `
      DELETE FROM proposals 
      WHERE id = $1 AND tenant_id = $2;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Empty trash (permanently delete all trashed proposals)
   */
  static async emptyTrash(tenantId: string): Promise<number> {
    const query = `
      DELETE FROM proposals 
      WHERE tenant_id = $1 AND deleted_at IS NOT NULL;
    `;
    const result = await pool.query(query, [tenantId]);
    return result.rowCount ?? 0;
  }
}
