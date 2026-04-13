import pool from '@/config/dbpool';

export interface EscalationCategoryData {
    id?: string;
    tenantId: string;
    createdById: string;
    updatedById?: string;
    displayName: string;
    description?: string;
    visualColor?: string;
    status?: boolean;
}

export class EscalationCategoryModel {
    /**
     * Create a new escalation category
     */
    static async create(data: EscalationCategoryData): Promise<any> {
        const query = `
      INSERT INTO escalationCategories (
        tenantId, createdById, updatedById,
        displayName, description, visualColor, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

        const values = [
            data.tenantId,
            data.createdById,
            data.updatedById || null,
            data.displayName,
            data.description || null,
            data.visualColor || null,
            data.status ?? true,
        ];

        try {
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error: any) {
            console.error('DATABASE ERROR in EscalationCategoryModel.create:');
            console.error('Message:', error.message);
            console.error('Detail:', error.detail);
            console.error('Constraint:', error.constraint);
            throw error;
        }
    }

    /**
     * Find all escalation categories for a specific tenant
     */
    static async findAll(tenantId: string): Promise<any[]> {
        const query = `
      SELECT * FROM escalationCategories
      WHERE tenantId = $1
      ORDER BY createdAt DESC;
    `;
        const result = await pool.query(query, [tenantId]);
        return result.rows;
    }

    /**
     * Find a specific escalation category by ID and tenant ID
     */
    static async findById(id: string, tenantId: string): Promise<any> {
        const query = `
      SELECT * FROM escalationCategories
      WHERE id = $1 AND tenantId = $2;
    `;
        const result = await pool.query(query, [id, tenantId]);
        return result.rows[0];
    }

    /**
     * Update an escalation category
     */
    static async update(
        id: string,
        tenantId: string,
        data: Partial<EscalationCategoryData>,
        updatedById: string
    ): Promise<any> {
        const fields: string[] = [];
        const values: any[] = [];
        let placeholderIndex = 1;

        // Always update updatedById and updatedAt on any update
        fields.push(`updatedById = $${placeholderIndex}`);
        values.push(updatedById);
        placeholderIndex++;

        fields.push(`updatedAt = CURRENT_TIMESTAMP`);

        // Build dynamic UPDATE query from remaining fields
        Object.entries(data).forEach(([key, value]) => {
            if (!['id', 'tenantId', 'createdById', 'updatedById', 'createdAt', 'updatedAt'].includes(key)) {
                fields.push(`${key} = $${placeholderIndex}`);
                values.push(value);
                placeholderIndex++;
            }
        });

        if (fields.length === 0) return null;

        values.push(id, tenantId);
        const query = `
      UPDATE escalationCategories
      SET ${fields.join(', ')}
      WHERE id = $${placeholderIndex} AND tenantId = $${placeholderIndex + 1}
      RETURNING *;
    `;

        try {
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error: any) {
            console.error('DATABASE ERROR in EscalationCategoryModel.update:');
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
      UPDATE escalationCategories
      SET status = FALSE, updatedById = $3, updatedAt = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenantId = $2
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
      DELETE FROM escalationCategories
      WHERE id = $1 AND tenantId = $2;
    `;
        const result = await pool.query(query, [id, tenantId]);
        return (result.rowCount ?? 0) > 0;
    }
}