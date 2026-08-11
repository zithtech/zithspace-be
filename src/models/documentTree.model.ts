import pool from "@/config/dbpool";

export const mapRowToDocumentTree = (row: any) => {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    documentHubId: row.documentHubId,
    documentId: row.documentId, 
    title: row.title,
    type: row.type, 
    parentId: row.parentId,
    position: row.position,
    createdById: row.createdById,
    createdAt: row.createdAt,
    deletedAt: row.deleted_at,
    deletedById: row.deleted_by_id,
    isDeleted: row.is_deleted,
  };
};

export async function createDocumentTreeModel(data: any) {
  const query = `
    INSERT INTO documenttree (
      id, "tenantId", "documentHubId", "documentId", title, type, "parentId",
      position, "createdById", "createdAt", is_deleted
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), false
    ) RETURNING *
  `;
  const id = data.id || require('crypto').randomUUID();
  const values = [
    id,
    data.tenantId,
    data.documentHubId,
    data.documentId || null,
    data.title,
    data.type,
    data.parentId || null,
    data.position || 0,
    data.createdById
  ];

  const result = await pool.query(query, values);
  return mapRowToDocumentTree(result.rows[0]);
}

export async function getDocumentTreeByIdModel(id: string, tenantId: string) {
  const query = `
    SELECT * FROM documenttree 
    WHERE id = $1 AND "tenantId" = $2 AND is_deleted = false
  `;
  const result = await pool.query(query, [id, tenantId]);
  return result.rows.length > 0 ? mapRowToDocumentTree(result.rows[0]) : null;
}

export async function getLastNodePositionModel(documentHubId: string, tenantId: string, parentId: string | null) {
  let query, values;
  if (parentId) {
    query = `
      SELECT position FROM documenttree
      WHERE "documentHubId" = $1 AND "tenantId" = $2 AND "parentId" = $3 AND is_deleted = false
      ORDER BY position DESC LIMIT 1
    `;
    values = [documentHubId, tenantId, parentId];
  } else {
    query = `
      SELECT position FROM documenttree
      WHERE "documentHubId" = $1 AND "tenantId" = $2 AND "parentId" IS NULL AND is_deleted = false
      ORDER BY position DESC LIMIT 1
    `;
    values = [documentHubId, tenantId];
  }
  
  const result = await pool.query(query, values);
  return result.rows.length > 0 ? (result.rows[0] as any).position : null;
}

export async function updateDocumentTreeModel(id: string, tenantId: string, data: any) {
  const keys = Object.keys(data);
  if (keys.length === 0) return null;
  
  const setClauses: string[] = [];
  const values: any[] = [id, tenantId];
  let paramIndex = 3;

  keys.forEach(key => {
    const dbColumn = key === 'deletedAt' ? 'deleted_at' :
                     key === 'deletedById' ? 'deleted_by_id' :
                     key === 'isDeleted' ? 'is_deleted' :
                     key === 'id' || key === 'title' || key === 'type' || key === 'position' ? key :
                     `"${key}"`; 
    
    setClauses.push(`${dbColumn} = $${paramIndex}`);
    values.push(data[key]);
    paramIndex++;
  });

  const query = `
    UPDATE documenttree
    SET ${setClauses.join(', ')}
    WHERE id = $1 AND "tenantId" = $2
    RETURNING *
  `;

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToDocumentTree(result.rows[0]) : null;
}
