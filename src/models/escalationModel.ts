import pool from "../config/dbpool";

export interface CreateEscalationPayload {
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

export interface UpdateEscalationPayload {
    categoryId?: string;
    priorityId?: string;
    statusId?: string;
    projectId?: string;
    subject?: string;
    description?: string;
    documentUrl?: string;
}

export class EscalationModel {
    /**
     * Create a new Escalation, wrapping inserts in a transaction
     */
    static async create(data: CreateEscalationPayload): Promise<any> {
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
            console.error("DATABASE ERROR in EscalationModel.create:", error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get all escalations for a tenant
     */
    static async findAll(tenantId: string): Promise<any[]> {
        const query = `
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
            WHERE e.tenant_id = $1
            ORDER BY e.created_at DESC;
        `;
        const result = await pool.query(query, [tenantId]);
        return result.rows;
    }

    /**
     * Get an escalation by ID for a specific tenant
     */
    static async findById(id: string, tenantId: string): Promise<any> {
        const query = `
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
            WHERE e.id = $1 AND e.tenant_id = $2;
        `;
        const result = await pool.query(query, [id, tenantId]);
        const escalation = result.rows[0];

        if (!escalation) return null;

        return escalation;
    }

    /**
     * Update an escalation details
     */
    static async update(
        id: string,
        tenantId: string,
        data: UpdateEscalationPayload,
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
            WHERE id = $${placeholderIndex} AND tenant_id = $${placeholderIndex + 1}
            RETURNING *;
        `;

        try {
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error: any) {
            console.error('DATABASE ERROR in EscalationModel.update:', error.message);
            throw error;
        }
    }

    /**
     * Hard delete escalation (Cascades down to tickets and team members)
     */
    static async delete(id: string, tenantId: string): Promise<boolean> {
        const query = `
            DELETE FROM escalation
            WHERE id = $1 AND tenant_id = $2;
        `;
        const result = await pool.query(query, [id, tenantId]);
        return (result.rowCount ?? 0) > 0;
    }
}
