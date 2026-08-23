import pool from "@/config/dbpool";

export const mapRowToDocumentHub = (row: any) => {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    projectId: row.projectId,
    ticketId: row.ticketId,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deleted_at,
    deletedById: row.deleted_by_id,
    isDeleted: row.is_deleted,
    visibility: row.visibility,
    shareToken: row.share_token,
    sharedWith: row.shared_with || [],
    
    project: row.projectId && row.project_name ? {
      id: row.projectId,
      name: row.project_name,
      code: row.project_code,
    } : undefined,
    createdBy: row.createdById && row.creator_name ? {
      id: row.createdById,
      name: row.creator_name,
      workEmail: row.creator_email,
      avatarUrl: row.creator_avatar,
    } : undefined,
    ticket: row.ticketId && row.ticket_title ? {
      id: row.ticketId,
      title: row.ticket_title,
      status: row.ticket_status,
      ticketNumber: row.ticket_number,
    } : undefined,
  };
};

export async function findHubByName(name: string, tenantId: string) {
  const query = `
    SELECT * FROM document_hub 
    WHERE name = $1 AND "tenantId" = $2 AND is_deleted = false
    LIMIT 1
  `;
  const result = await pool.query(query, [name, tenantId]);
  return result.rows.length > 0 ? mapRowToDocumentHub(result.rows[0]) : null;
}

export async function createDocumentHubModel(data: any) {
  const query = `
    INSERT INTO document_hub (
      id, "tenantId", name, "projectId", "ticketId", "createdById", 
      visibility, share_token, "createdAt", "updatedAt", is_deleted
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), false
    ) RETURNING *
  `;
  const id = data.id || require('crypto').randomUUID();
  const values = [
    id,
    data.tenantId,
    data.name,
    data.projectId || null,
    data.ticketId || null,
    data.createdById,
    data.visibility || 'private',
    data.shareToken || null
  ];

  const result = await pool.query(query, values);
  return mapRowToDocumentHub(result.rows[0]);
}

export async function getDocumentHubById(id: string, tenantId: string, userId: string) {
  const query = `
    WITH accessible_docs AS (
      SELECT id FROM documents
      WHERE "documentHubId" = $1 AND "tenantId" = $2 AND is_deleted = false 
        AND (visibility = 'public' OR "createdById" = $3 OR $3 = ANY(shared_with))
    )
    SELECT dh.*,
           u.id as creator_id, u.name as creator_name, u.work_email as creator_email, u.avatar_url as creator_avatar,
           p.id as project_id, p.name as project_name, p.code as project_code,
           t.id as ticket_id, t.title as ticket_title, t.status as ticket_status, t.ticket_number as ticket_number,
           (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', dt.id,
               'type', dt.type,
               'title', dt.title,
               'parentId', dt."parentId",
               'documentId', dt."documentId",
               'position', dt.position
             ) ORDER BY dt.position ASC), '[]'::jsonb)
             FROM documenttree dt
             WHERE dt."documentHubId" = dh.id AND dt.is_deleted = false
               AND (dt.type != 'file' OR dt."documentId" IN (SELECT id FROM accessible_docs))
           ) as tree_nodes
    FROM document_hub dh
    LEFT JOIN users u ON dh."createdById" = u.id
    LEFT JOIN projects p ON dh."projectId" = p.id
    LEFT JOIN tickets t ON dh."ticketId" = t.id
    WHERE dh.id = $1 AND dh."tenantId" = $2 AND dh.is_deleted = false
      AND (dh.visibility = 'public' OR dh."createdById" = $3 OR $3 = ANY(dh.shared_with))
  `;
  const result = await pool.query(query, [id, tenantId, userId]);
  if (result.rows.length === 0) return null;
  const hub = mapRowToDocumentHub(result.rows[0]);
  return {
    ...hub,
    treeNodes: result.rows[0].tree_nodes || []
  };
}

export interface GetHubsOptions {
  tenantId: string;
  userId: string;
  ticketIdFilter?: string;
  page?: number;
  limit?: number;
  search?: string;
  view?: string;
  projectId?: string;
  createdById?: string;
  startDate?: string;
  endDate?: string;
}

export async function getAllDocumentHubsModel(options: GetHubsOptions) {
  const { tenantId, userId, ticketIdFilter, page, limit, search, view, projectId, createdById, startDate, endDate } = options;

  let whereClause = `dh."tenantId" = $1 AND dh.is_deleted = false`;
  const values: any[] = [tenantId, userId];
  let paramIdx = 3;

  let visibilityClause = `(dh.visibility = 'public' OR dh."createdById" = $2 OR $2 = ANY(dh.shared_with))`;
  
  if (view === 'mine') {
    visibilityClause = `(dh."createdById" = $2)`;
  } else if (view === 'shared') {
    visibilityClause = `(dh."createdById" != $2 AND ($2 = ANY(dh.shared_with) OR dh.visibility = 'public'))`;
  } else if (view === 'public') {
    visibilityClause = `(dh.visibility = 'public' AND $2 = $2)`;
  }
  
  whereClause += ` AND ${visibilityClause}`;

  if (ticketIdFilter) {
    whereClause += ` AND dh."ticketId" = $${paramIdx++}`;
    values.push(ticketIdFilter);
  }

  if (search) {
    whereClause += ` AND dh.name ILIKE $${paramIdx++}`;
    values.push(`%${search}%`);
  }

  if (projectId) {
    whereClause += ` AND dh."projectId" = $${paramIdx++}`;
    values.push(projectId);
  }

  if (createdById) {
    whereClause += ` AND dh."createdById" = $${paramIdx++}`;
    values.push(createdById);
  }

  if (startDate && endDate) {
    whereClause += ` AND (dh."createdAt" >= $${paramIdx} AND dh."createdAt" <= $${paramIdx + 1} OR dh."updatedAt" >= $${paramIdx} AND dh."updatedAt" <= $${paramIdx + 1})`;
    values.push(startDate, endDate);
    paramIdx += 2;
  }

  let joinStars = "";
  if (view === 'starred') {
    joinStars = `INNER JOIN document_hub_stars dhs ON dh.id::text = dhs.hub_id::text AND dhs.user_id::text = $2::text`;
  }

  const countQuery = `
    SELECT COUNT(*) 
    FROM document_hub dh
    ${joinStars}
    WHERE ${whereClause}
  `;
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
    WITH accessible_docs AS (
      SELECT id FROM documents
      WHERE "tenantId" = $1 AND is_deleted = false 
        AND (visibility = 'public' OR "createdById" = $2 OR $2 = ANY(shared_with))
    )
    SELECT 
      dh.*,
      u.id as creator_id, u.name as creator_name, u.work_email as creator_email, u.avatar_url as creator_avatar,
      p.id as project_id, p.name as project_name, p.code as project_code,
      t.id as ticket_id, t.title as ticket_title, t.status as ticket_status, t.ticket_number as ticket_number,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', d.id,
          'visibility', d.visibility,
          'createdById', d."createdById"
        )), '[]'::jsonb)
        FROM documents d
        WHERE d."documentHubId" = dh.id AND d.is_deleted = false
          AND d.id IN (SELECT id FROM accessible_docs)
      ) as documents,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', dt.id,
          'type', dt.type,
          'title', dt.title,
          'parentId', dt."parentId",
          'documentId', dt."documentId",
          'position', dt.position
        ) ORDER BY dt.position ASC), '[]'::jsonb)
        FROM documenttree dt
        WHERE dt."documentHubId" = dh.id AND dt.is_deleted = false
          AND (dt.type != 'file' OR dt."documentId" IN (SELECT id FROM accessible_docs))
      ) as tree_nodes
    FROM document_hub dh
    ${joinStars}
    LEFT JOIN users u ON dh."createdById" = u.id
    LEFT JOIN projects p ON dh."projectId" = p.id
    LEFT JOIN tickets t ON dh."ticketId" = t.id
    WHERE ${whereClause}
    ORDER BY dh."createdAt" DESC
    ${limitOffsetClause}
  `;

  const result = await pool.query(query, values);
  const data = result.rows.map(row => {
    const hub = mapRowToDocumentHub(row);
    return {
      ...hub,
      documents: row.documents || [],
      treeNodes: row.tree_nodes || [],
    };
  });

  return { data, total };
}

export async function getDocumentHubStarsModel(userId: string, tenantId: string) {
  const query = `
    SELECT hub_id FROM document_hub_stars
    WHERE user_id = $1 AND tenant_id = $2
  `;
  const result = await pool.query(query, [userId, tenantId]);
  return result.rows;
}

export async function updateDocumentHubModel(id: string, tenantId: string, data: any) {
  // Dynamic update builder
  const keys = Object.keys(data);
  if (keys.length === 0) return null;
  
  const setClauses: string[] = [];
  const values: any[] = [id, tenantId];
  let paramIndex = 3;

  keys.forEach(key => {
    // updatedAt is always handled by the hardcoded NOW() below — skip it here
    // to avoid "multiple assignments to same column" PostgreSQL error.
    if (key === 'updatedAt') return;

    const dbColumn = key === 'deletedAt' ? 'deleted_at' :
                     key === 'deletedById' ? 'deleted_by_id' :
                     key === 'isDeleted' ? 'is_deleted' :
                     key === 'sharedWith' ? 'shared_with' :
                     key === 'shareToken' ? 'share_token' :
                     key === 'id' || key === 'name' || key === 'visibility' ? key :
                     `"${key}"`; // quote camelCase
    
    setClauses.push(`${dbColumn} = $${paramIndex}`);
    values.push(data[key]);
    paramIndex++;
  });

  // Always update updatedAt
  setClauses.push(`"updatedAt" = NOW()`);

  const query = `
    UPDATE document_hub
    SET ${setClauses.join(', ')}
    WHERE id = $1 AND "tenantId" = $2
    RETURNING *
  `;

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToDocumentHub(result.rows[0]) : null;
}
