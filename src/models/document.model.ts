import pool from "@/config/dbpool";

export const mapRowToDocument = (row: any) => {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    documentHubId: row.documentHubId,
    title: row.title,
    content: row.content,
    version: row.version,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deleted_at,
    deletedById: row.deleted_by_id,
    visibility: row.visibility,
    shareToken: row.share_token,
    sharedWith: row.shared_with || [],
  };
};

export async function createDocumentModel(data: any) {
  const query = `
    INSERT INTO documents (
      id, "tenantId", "documentHubId", title, content, version, "createdById",
      visibility, share_token, "createdAt", "updatedAt", is_deleted
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), false
    ) RETURNING *
  `;
  const id = data.id || require('crypto').randomUUID();
  const values = [
    id,
    data.tenantId,
    data.documentHubId,
    data.title,
    data.content ? JSON.stringify(data.content) : '[]',
    data.version || 1,
    data.createdById,
    data.visibility || 'private',
    data.shareToken || null
  ];

  const result = await pool.query(query, values);
  return mapRowToDocument(result.rows[0]);
}

export async function getDocumentByIdModel(id: string, tenantId: string) {
  const query = `
    SELECT * FROM documents 
    WHERE id = $1 AND "tenantId" = $2 AND is_deleted = false
  `;
  const result = await pool.query(query, [id, tenantId]);
  return result.rows.length > 0 ? mapRowToDocument(result.rows[0]) : null;
}

export async function updateDocumentModel(id: string, tenantId: string, data: any) {
  const keys = Object.keys(data);
  if (keys.length === 0) return null;
  
  const setClauses: string[] = [];
  const values: any[] = [id, tenantId];
  let paramIndex = 3;

  keys.forEach(key => {
    const dbColumn = key === 'deletedAt' ? 'deleted_at' :
                     key === 'deletedById' ? 'deleted_by_id' :
                     key === 'isDeleted' ? 'is_deleted' :
                     key === 'shareToken' ? 'share_token' :
                     key === 'sharedWith' ? 'shared_with' :
                     key === 'id' || key === 'title' || key === 'content' || key === 'version' || key === 'visibility' ? key :
                     `"${key}"`; 
    
    setClauses.push(`${dbColumn} = $${paramIndex}`);
    
    // JSON stringify content
    if (key === 'content') {
      values.push(JSON.stringify(data[key]));
    } else {
      values.push(data[key]);
    }
    paramIndex++;
  });

  setClauses.push(`"updatedAt" = NOW()`);

  const query = `
    UPDATE documents
    SET ${setClauses.join(', ')}
    WHERE id = $1 AND "tenantId" = $2
    RETURNING *
  `;

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToDocument(result.rows[0]) : null;
}
