import pool from '@/config/dbpool';

export interface EscalationStatusData {
    id?: string;
    tenantId: string;
    createdById: string;
    updatedById?: string;
    displayName: string;
    priorityWeight: number;
    visualColor?: string;
    status?: boolean;
    isFinal?: boolean;
    isDefault?: boolean;
}

export class EscalationStatusModel {
    /**
     * Create a new escalation status
     */
    static async create(data: EscalationStatusData): Promise<any> {
        const query = `
      INSERT INTO "escalation_status" (
        tenantid, createdbyid, updatedbyid,
        displayname, priorityweight, visualcolor, status, finalstate, defaultstatus
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

        const values = [
            data.tenantId,
            data.createdById,
            data.updatedById || null,
            data.displayName,
            data.priorityWeight,
            data.visualColor || null,
            data.status ?? true,
            data.isFinal ?? false,
            data.isDefault ?? false
        ];

        try {
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error: any) {
            console.error('DATABASE ERROR in EscalationStatusModel.create:');
            console.error('Message:', error.message);
            console.error('Detail:', error.detail);
            console.error('Constraint:', error.constraint);
            throw error;
        }
    }

    /**
     * Find all escalation statuses for a specific tenant
     */
    static async findAll(tenantId: string): Promise<any[]> {
        const query = `
      SELECT * FROM "escalation_status"
      WHERE tenantid = $1 AND status = TRUE
      ORDER BY priorityweight ASC;
    `;
        const result = await pool.query(query, [tenantId]);
        return result.rows;
    }

    /**
     * Find a specific escalation status by ID and tenant ID
     */
    static async findById(id: string, tenantId: string): Promise<any> {
        const query = `
      SELECT * FROM "escalation_status"
      WHERE id = $1 AND tenantid = $2;
    `;
        const result = await pool.query(query, [id, tenantId]);
        return result.rows[0];
    }

    /**
     * Update an escalation status
     */
    static async update(
        id: string,
        tenantId: string,
        data: Partial<EscalationStatusData>,
        updatedById: string
    ): Promise<any> {
        const fields: string[] = [];
        const values: any[] = [];
        let placeholderIndex = 1;

        // Always update updatedById and updatedAt on any update
        fields.push(`updatedbyid = $${placeholderIndex}`);
        values.push(updatedById);
        placeholderIndex++;

        fields.push(`updatedat = CURRENT_TIMESTAMP`);

        // Column name map — camelCase interface key → exact DB column name
        const columnMap: Record<string, string> = {
            displayName: 'displayname',
            priorityWeight: 'priorityweight',
            visualColor: 'visualcolor',
            status: 'status',
            isFinal: 'finalstate',
            isDefault: 'defaultstatus'
        };

        // Build dynamic UPDATE query from remaining fields
        Object.entries(data).forEach(([key, value]) => {
            if (!['id', 'tenantId', 'createdById', 'updatedById', 'createdAt', 'updatedAt'].includes(key)) {
                const column = columnMap[key] ?? key;
                fields.push(`${column} = $${placeholderIndex}`);
                values.push(value);
                placeholderIndex++;
            }
        });

        if (fields.length === 0) return null;

        values.push(id, tenantId);
        const query = `
      UPDATE "escalation_status"
      SET ${fields.join(', ')}
      WHERE id = $${placeholderIndex} AND tenantid = $${placeholderIndex + 1}
      RETURNING *;
    `;

        try {
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error: any) {
            console.error('DATABASE ERROR in EscalationStatusModel.update:');
            console.error('Message:', error.message);
            console.error('Detail:', error.detail);
            console.error('Constraint:', error.constraint);
            throw error;
        }
    }

    /**
     * Soft delete — sets status to false
     */
    static async softDelete(id: string, tenantId: string, updatedById: string): Promise<any> {
        const query = `
      UPDATE "escalation_status"
      SET status = FALSE, updatedbyid = $3, updatedat = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenantid = $2
      RETURNING *;
    `;
        const result = await pool.query(query, [id, tenantId, updatedById]);
        return result.rows[0];
    }

    /**
     * Hard delete — permanently removes the record
     */
    static async delete(id: string, tenantId: string): Promise<boolean> {
        const query = `
      DELETE FROM "escalation_status"
      WHERE id = $1 AND tenantid = $2;
    `;
        const result = await pool.query(query, [id, tenantId]);
        return (result.rowCount ?? 0) > 0;
    }
}