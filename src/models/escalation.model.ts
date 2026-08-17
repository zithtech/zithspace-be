import pool from "../config/dbpool";

export interface CreateEscalationData {
    tenantId: string;
    targetMemberIds: string[];
    ticketIds: string[];
    categoryId: string;
    priorityId: string;
    statusId: string;
    projectId?: string;
    subject: string;
    description: string;
    documentUrl?: string; // string representation of JSON array of URLs
    createdById: string;
}

export interface UpdateEscalationData {
    categoryId?: string;
    priorityId?: string;
    statusId?: string;
    projectId?: string;
    subject?: string;
    description?: string;
    documentUrl?: string;
}

/**
 * Create a new Escalation, wrapping inserts in a transaction
 */
export async function createEscalation(data: CreateEscalationData): Promise<any> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Insert into main escalation table
        const queryEscalation = `
            INSERT INTO escalation (
                tenant_id, escalation_category_id, escalation_priority_id, 
                initial_status_id, project_id, short_summary, 
                detailed_description, created_by_id, updated_by_id, document_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)
            RETURNING *;
        `;

        const escalationValues = [
            data.tenantId,
            data.categoryId,
            data.priorityId,
            data.statusId,
            data.projectId || null,
            data.subject,
            data.description,
            data.createdById,
            data.documentUrl || null
        ];

        const result = await client.query(queryEscalation, escalationValues);
        const escalationRecord = result.rows[0];
        const escalationId = escalationRecord.id;

        // 2. Insert into escalation_tickets
        if (data.ticketIds && data.ticketIds.length > 0) {
            const ticketQuery = `
                INSERT INTO escalation_tickets (escalation_id, ticket_id, created_by_id, updated_by_id)
                VALUES ($1, $2, $3, $3)
            `;
            for (const ticketId of data.ticketIds) {
                await client.query(ticketQuery, [escalationId, ticketId, data.createdById]);
            }
        }

        // 3. Insert into escalation_team_members
        if (data.targetMemberIds && data.targetMemberIds.length > 0) {
            const memberQuery = `
                INSERT INTO escalation_team_members (escalation_id, user_id, created_by_id, updated_by_id)
                VALUES ($1, $2, $3, $3)
            `;
            for (const memberId of data.targetMemberIds) {
                await client.query(memberQuery, [escalationId, memberId, data.createdById]);
            }
        }

        await client.query("COMMIT");
        return escalationRecord;
    } catch (error: any) {
        await client.query("ROLLBACK");
        console.error("DATABASE ERROR in createEscalation:", error.message);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Get all active escalations for a tenant (non-deleted).
 * If userId is provided and isAdmin is false, only escalations where the user
 * is the creator or a target team member are returned.
 */
export async function getEscalations(
    tenantId: string, 
    userId?: string, 
    isAdmin?: boolean,
    limit?: number,
    offset?: number
): Promise<{ data: any[], total: number }> {
    let baseQuery = `
        FROM escalation e
        LEFT JOIN escalationcategories ec ON e.escalation_category_id = ec.id
        LEFT JOIN escalation_priorities ep ON e.escalation_priority_id = ep.id
        LEFT JOIN escalation_status es ON e.initial_status_id = es.id
        WHERE e.tenant_id = $1 AND e.is_deleted = FALSE
    `;

    const values: any[] = [tenantId];
    let queryIndex = 2;

    if (userId && !isAdmin) {
        baseQuery += ` AND (e.created_by_id = $${queryIndex} OR EXISTS (
            SELECT 1 FROM escalation_team_members etm 
            WHERE etm.escalation_id = e.id AND etm.user_id = $${queryIndex}
        ))`;
        values.push(userId);
        queryIndex++;
    }

    let query = `
        SELECT e.*, 
               ec.displayname as category_name, ec.visualcolor as category_color,
               ep.displayname as priority_name, ep.visualcolor as priority_color, ep.priorityweight as priority_weight,
               es.displayname as status_name, es.visualcolor as status_color,
               (SELECT json_build_object('name', p.name) FROM projects p WHERE p.id = e.project_id) as project,
               (SELECT json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url) FROM users u WHERE u.id = e.created_by_id) as "createdBy",
               (
                   SELECT json_agg(json_build_object(
                       'user', json_build_object('id', u_m.id, 'name', u_m.name, 'avatarUrl', u_m.avatar_url)
                   ))
                   FROM escalation_team_members etm
                   JOIN users u_m ON etm.user_id = u_m.id
                   WHERE etm.escalation_id = e.id
               ) as "targetMembers",
               (
                   SELECT json_agg(json_build_object(
                       'ticket', json_build_object('id', t.id, 'ticketNumber', t.ticket_number, 'title', t.title)
                   ))
                   FROM escalation_tickets et
                   JOIN tickets t ON et.ticket_id = t.id
                   WHERE et.escalation_id = e.id
               ) as tickets,
               COUNT(*) OVER() as total_count
        ${baseQuery}
        ORDER BY e.created_at DESC
    `;

    if (limit !== undefined && offset !== undefined) {
        query += ` LIMIT $${queryIndex} OFFSET $${queryIndex + 1}`;
        values.push(limit, offset);
    }

    const result = await pool.query(query, values);
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    
    // Remove total_count from each row
    const data = result.rows.map(row => {
        const { total_count, ...rest } = row;
        return rest;
    });

    return { data, total };
}

/**
 * Get all trashed escalations for a tenant.
 * If userId is provided and isAdmin is false, only escalations where the user
 * is the creator or a target team member are returned.
 */
export async function getTrashEscalations(
    tenantId: string, 
    userId?: string, 
    isAdmin?: boolean,
    limit?: number,
    offset?: number
): Promise<{ data: any[], total: number }> {
    let baseQuery = `
        FROM escalation e
        LEFT JOIN escalationcategories ec ON e.escalation_category_id = ec.id
        LEFT JOIN escalation_priorities ep ON e.escalation_priority_id = ep.id
        LEFT JOIN escalation_status es ON e.initial_status_id = es.id
        WHERE e.tenant_id = $1 AND e.is_deleted = TRUE
    `;

    const values: any[] = [tenantId];
    let queryIndex = 2;

    if (userId && !isAdmin) {
        baseQuery += ` AND (e.created_by_id = $${queryIndex} OR EXISTS (
            SELECT 1 FROM escalation_team_members etm 
            WHERE etm.escalation_id = e.id AND etm.user_id = $${queryIndex}
        ))`;
        values.push(userId);
        queryIndex++;
    }

    let query = `
        SELECT e.*, 
               ec.displayname as category_name, ec.visualcolor as category_color,
               ep.displayname as priority_name, ep.visualcolor as priority_color, ep.priorityweight as priority_weight,
               es.displayname as status_name, es.visualcolor as status_color,
               (SELECT json_build_object('name', p.name) FROM projects p WHERE p.id = e.project_id) as project,
               (SELECT json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url) FROM users u WHERE u.id = e.created_by_id) as "createdBy",
               (
                   SELECT json_agg(json_build_object(
                       'user', json_build_object('id', u_m.id, 'name', u_m.name, 'avatarUrl', u_m.avatar_url)
                   ))
                   FROM escalation_team_members etm
                   JOIN users u_m ON etm.user_id = u_m.id
                   WHERE etm.escalation_id = e.id
               ) as "targetMembers",
               (
                   SELECT json_agg(json_build_object(
                       'ticket', json_build_object('id', t.id, 'ticketNumber', t.ticket_number, 'title', t.title)
                   ))
                   FROM escalation_tickets et
                   JOIN tickets t ON et.ticket_id = t.id
                   WHERE et.escalation_id = e.id
               ) as tickets,
               COUNT(*) OVER() as total_count
        ${baseQuery}
        ORDER BY e.updated_at DESC
    `;

    if (limit !== undefined && offset !== undefined) {
        query += ` LIMIT $${queryIndex} OFFSET $${queryIndex + 1}`;
        values.push(limit, offset);
    }

    const result = await pool.query(query, values);
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    
    const data = result.rows.map(row => {
        const { total_count, ...rest } = row;
        return rest;
    });

    return { data, total };
}

/**
 * Get an escalation by ID for a specific tenant.
 * If userId is provided and isAdmin is false, returns null if the user is
 * neither the creator nor a target team member.
 */
export async function getEscalationById(id: string, tenantId: string, userId?: string, isAdmin?: boolean): Promise<any> {
    let query = `
        SELECT e.*, 
               ec.displayname as category_name, ec.visualcolor as category_color,
               ep.displayname as priority_name, ep.visualcolor as priority_color, ep.priorityweight as priority_weight,
               es.displayname as status_name, es.visualcolor as status_color,
               (SELECT json_build_object('name', p.name) FROM projects p WHERE p.id = e.project_id) as project,
               (SELECT json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url) FROM users u WHERE u.id = e.created_by_id) as "createdBy",
               (
                   SELECT json_agg(json_build_object(
                       'user', json_build_object('id', u_m.id, 'name', u_m.name, 'avatarUrl', u_m.avatar_url)
                   ))
                   FROM escalation_team_members etm
                   JOIN users u_m ON etm.user_id = u_m.id
                   WHERE etm.escalation_id = e.id
               ) as "targetMembers",
               (
                   SELECT json_agg(json_build_object(
                       'ticket', json_build_object('id', t.id, 'ticketNumber', t.ticket_number, 'title', t.title)
                   ))
                   FROM escalation_tickets et
                   JOIN tickets t ON et.ticket_id = t.id
                   WHERE et.escalation_id = e.id
               ) as tickets
        FROM escalation e
        LEFT JOIN escalationcategories ec ON e.escalation_category_id = ec.id
        LEFT JOIN escalation_priorities ep ON e.escalation_priority_id = ep.id
        LEFT JOIN escalation_status es ON e.initial_status_id = es.id
        WHERE e.id = $1 AND e.tenant_id = $2 AND e.is_deleted = FALSE
    `;

    const values: any[] = [id, tenantId];

    if (userId && !isAdmin) {
        query += ` AND (e.created_by_id = $3 OR EXISTS (
            SELECT 1 FROM escalation_team_members etm 
            WHERE etm.escalation_id = e.id AND etm.user_id = $3
        ))`;
        values.push(userId);
    }

    const result = await pool.query(query, values);
    const escalation = result.rows[0];

    if (!escalation) return null;

    return escalation;
}

/**
 * Update an escalation details
 */
export async function updateEscalation(
    id: string,
    tenantId: string,
    data: UpdateEscalationData,
    updatedById: string
): Promise<any> {
    const fields: string[] = [];
    const values: any[] = [];
    let placeholderIndex = 1;

    fields.push(`updated_by_id = $${placeholderIndex}`);
    values.push(updatedById);
    placeholderIndex++;

    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    const columnMap: Record<string, string> = {
        categoryId: 'escalation_category_id',
        priorityId: 'escalation_priority_id',
        statusId: 'initial_status_id',
        projectId: 'project_id',
        subject: 'short_summary',
        description: 'detailed_description',
        documentUrl: 'document_url'
    };

    Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
            const column = columnMap[key];
            if (column) {
                fields.push(`${column} = $${placeholderIndex}`);
                values.push(value);
                placeholderIndex++;
            }
        }
    });

    if (fields.length === 2) return null; // Only updated_by_id and updated_at were added

    values.push(id, tenantId);
    const query = `
        UPDATE escalation
        SET ${fields.join(', ')}
        WHERE id = $${placeholderIndex} AND tenant_id = $${placeholderIndex + 1} AND is_deleted = FALSE
        RETURNING *;
    `;

    try {
        const result = await pool.query(query, values);
        return result.rows[0];
    } catch (error: any) {
        console.error('DATABASE ERROR in updateEscalation:', error.message);
        throw error;
    }
}

/**
 * Soft delete escalation (Moves to trash)
 */
export async function deleteEscalation(id: string, tenantId: string): Promise<boolean> {
    const query = `
        UPDATE escalation
        SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND tenant_id = $2 AND is_deleted = FALSE;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
}

/**
 * Restore escalation from trash
 */
export async function restoreEscalation(id: string, tenantId: string): Promise<boolean> {
    const query = `
        UPDATE escalation
        SET is_deleted = FALSE, deleted_at = NULL
        WHERE id = $1 AND tenant_id = $2 AND is_deleted = TRUE;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
}

/**
 * Hard delete escalation (Cascades down to tickets and team members)
 */
export async function permanentDeleteEscalation(id: string, tenantId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Delete tickets
        await client.query(`DELETE FROM escalation_tickets WHERE escalation_id = $1`, [id]);

        // 2. Delete team members
        await client.query(`DELETE FROM escalation_team_members WHERE escalation_id = $1`, [id]);

        // 3. Delete escalation
        const result = await client.query(`DELETE FROM escalation WHERE id = $1 AND tenant_id = $2 AND is_deleted = TRUE`, [id, tenantId]);

        await client.query("COMMIT");
        return (result.rowCount ?? 0) > 0;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Empty trash - permanently delete all trashed escalations for a tenant
 */
export async function emptyEscalationTrash(tenantId: string): Promise<number> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Get all trashed escalation IDs for this tenant
        const idsRes = await client.query(`SELECT id FROM escalation WHERE tenant_id = $1 AND is_deleted = TRUE`, [tenantId]);
        const ids = idsRes.rows.map((row: any) => row.id);

        if (ids.length > 0) {
            // Delete tickets
            await client.query(`DELETE FROM escalation_tickets WHERE escalation_id = ANY($1::uuid[])`, [ids]);

            // Delete team members
            await client.query(`DELETE FROM escalation_team_members WHERE escalation_id = ANY($1::uuid[])`, [ids]);

            // Delete escalations
            const result = await client.query(`DELETE FROM escalation WHERE tenant_id = $1 AND is_deleted = TRUE`, [tenantId]);

            await client.query("COMMIT");
            return result.rowCount ?? 0;
        }

        await client.query("COMMIT");
        return 0;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Bulk restore escalations from trash
 */
export async function bulkRestoreEscalations(ids: string[], tenantId: string): Promise<number> {
    const query = `
        UPDATE escalation
        SET is_deleted = FALSE, deleted_at = NULL
        WHERE tenant_id = $2 AND id = ANY($1::uuid[]) AND is_deleted = TRUE;
    `;
    const result = await pool.query(query, [ids, tenantId]);
    return result.rowCount ?? 0;
}

/**
 * Bulk permanently delete escalations
 */
export async function bulkPermanentDeleteEscalations(ids: string[], tenantId: string): Promise<number> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Delete tickets
        await client.query(`DELETE FROM escalation_tickets WHERE escalation_id = ANY($1::uuid[])`, [ids]);

        // Delete team members
        await client.query(`DELETE FROM escalation_team_members WHERE escalation_id = ANY($1::uuid[])`, [ids]);

        // Delete escalations
        const result = await client.query(`DELETE FROM escalation WHERE tenant_id = $2 AND id = ANY($1::uuid[]) AND is_deleted = TRUE`, [ids, tenantId]);

        await client.query("COMMIT");
        return result.rowCount ?? 0;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Get name and workEmail of users for notifications
 */
export async function getTargetUsers(tenantId: string, userIds: string[]): Promise<{ name: string; workEmail: string | null }[]> {
    const query = `
        SELECT name, work_email as "workEmail"
        FROM users
        WHERE tenant_id = $1 AND id = ANY($2::text[])
    `;
    const result = await pool.query<{ name: string; workEmail: string | null }>(query, [tenantId, userIds]);
    return result.rows;
}
