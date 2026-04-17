import pool from "../config/dbpool";
import { CreateInvoiceTemplateDto, UpdateInvoiceTemplateDto, InvoiceTemplateFieldDto } from "../types/invoiceTemplate";

export interface InvoiceTemplate {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  billingType: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  updatedById: string;
}

export interface InvoiceTemplateField {
  id: string;
  templateId: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  fieldOrder: number;
  isRequired: boolean;
  isSystem: boolean;
  options?: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Convert database row (snake_case) to InvoiceTemplate interface (camelCase)
 */
function mapRowToInvoiceTemplate(row: any): InvoiceTemplate {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    billingType: row.billing_type,
    isDefault: row.is_default,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdById: row.created_by,
    updatedById: row.updated_by_id,
  };
}

/**
 * Convert database row to InvoiceTemplateField interface
 */
function mapRowToInvoiceTemplateField(row: any): InvoiceTemplateField {
  let options = null;
  if (row.options) {
    try {
      options = JSON.parse(row.options);
    } catch (error) {
      console.warn('Failed to parse options JSON:', row.options, error);
      options = null;
    }
  }
  
  return {
    id: row.id,
    templateId: row.template_id,
    fieldKey: row.field_key,
    fieldLabel: row.field_label,
    fieldType: row.field_type,
    fieldOrder: row.field_order,
    isRequired: row.is_required,
    isSystem: row.is_system,
    options,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class InvoiceTemplateModel {
  
  /**
   * Create a new invoice template with fields using raw PostgreSQL queries
   */
  static async createTemplate(tenantId: string, data: CreateInvoiceTemplateDto, userId: string): Promise<InvoiceTemplate> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check for duplicate template
      const duplicateQuery = `
        SELECT id FROM invoice_templates 
        WHERE tenant_id = $1 AND name = $2 AND (description = $3 OR (description IS NULL AND $3 IS NULL))
      `;
      const duplicateResult = await client.query(duplicateQuery, [tenantId, data.name, data.description || null]);
      
      if (duplicateResult.rows.length > 0) {
        throw new Error('A template with this exact same name and description already exists');
      }

      // If this is set as default, unset other defaults for this billing type
      if (data.isDefault) {
        const unsetDefaultQuery = `
          UPDATE invoice_templates 
          SET is_default = false, updated_by_id_id = $1, updated_at = NOW()
          WHERE tenant_id = $2 AND billing_type = $3 AND is_default = true
        `;
        await client.query(unsetDefaultQuery, [userId, tenantId, data.billingType]);
      }

      // Insert the template
      const insertTemplateQuery = `
        INSERT INTO invoice_templates (
          tenant_id, name, description, billing_type, is_default, is_active,
          created_by, updated_by_id_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *
      `;
      
      const templateValues = [
        tenantId,
        data.name,
        data.description || null,
        data.billingType,
        data.isDefault || false,
        data.isActive !== undefined ? data.isActive : true,
        userId,
        userId
      ];

      const result = await client.query(insertTemplateQuery, templateValues);
      await client.query('COMMIT');
      
      const template = mapRowToInvoiceTemplate(result.rows[0]);

      // Insert template fields
      if (data.fields && data.fields.length > 0) {
        for (const field of data.fields) {
          const insertFieldQuery = `
            INSERT INTO invoice_template_fields (
              template_id, field_key, field_label, field_type, field_order,
              is_required, is_system, options, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
            RETURNING *
          `;
          
          const fieldValues = [
            template.id,
            field.fieldKey,
            field.fieldLabel,
            field.fieldType,
            field.fieldOrder,
            field.isRequired !== undefined ? field.isRequired : false,
            field.isSystem !== undefined ? field.isSystem : false,
            field.options ? JSON.stringify(field.options) : null
          ];

          const fieldResult = await client.query(insertFieldQuery, fieldValues);
        }
      }

      return template;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all templates for a tenant
   */
  static async getTemplates(tenantId: string): Promise<InvoiceTemplate[]> {
    const query = `
      SELECT * FROM invoice_templates 
      WHERE tenant_id = $1 
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query, [tenantId]);
    return result.rows.map(mapRowToInvoiceTemplate);
  }

  /**
   * Get template by ID with fields
   */
  static async getTemplateById(tenantId: string, templateId: string): Promise<{ template: InvoiceTemplate; fields: InvoiceTemplateField[] } | null> {
    const client = await pool.connect();
    
    try {
      // Get template
      const templateQuery = `
        SELECT * FROM invoice_templates 
        WHERE tenant_id = $1 AND id = $2
      `;
      
      const templateResult = await client.query(templateQuery, [tenantId, templateId]);
      
      if (templateResult.rows.length === 0) {
        return null;
      }

      const template = mapRowToInvoiceTemplate(templateResult.rows[0]);

      // Get fields
      const fieldsQuery = `
        SELECT * FROM invoice_template_fields 
        WHERE template_id = $1 
        ORDER BY field_order ASC
      `;
      
      const fieldsResult = await client.query(fieldsQuery, [templateId]);
      const fields = fieldsResult.rows.map(mapRowToInvoiceTemplateField);

      return { template, fields };

    } finally {
      client.release();
    }
  }

  /**
   * Update template by ID
   */
  static async updateTemplate(tenantId: string, templateId: string, data: UpdateInvoiceTemplateDto, userId: string): Promise<InvoiceTemplate> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if template exists
      const existingQuery = `
        SELECT id, is_default, billing_type FROM invoice_templates 
        WHERE tenant_id = $1 AND id = $2
      `;
      
      const existingResult = await client.query(existingQuery, [tenantId, templateId]);
      
      if (existingResult.rows.length === 0) {
        throw new Error('Template not found');
      }

      const existingTemplate = existingResult.rows[0];

      // If updating to default, unset other defaults for this billing type
      if (data.isDefault && !existingTemplate.is_default) {
        const unsetDefaultQuery = `
          UPDATE invoice_templates 
          SET is_default = false, updated_by_id_id = $1, updated_at = NOW()
          WHERE tenant_id = $2 AND billing_type = $3 AND is_default = true AND id != $4
        `;
        await client.query(unsetDefaultQuery, [userId, tenantId, existingTemplate.billing_type, templateId]);
      }

      // Build dynamic update query
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (data.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        updateValues.push(data.name);
      }
      if (data.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        updateValues.push(data.description);
      }
      if (data.billingType !== undefined) {
        updateFields.push(`billing_type = $${paramIndex++}`);
        updateValues.push(data.billingType);
      }
      if (data.isDefault !== undefined) {
        updateFields.push(`is_default = $${paramIndex++}`);
        updateValues.push(data.isDefault);
      }
      if (data.isActive !== undefined) {
        updateFields.push(`is_active = $${paramIndex++}`);
        updateValues.push(data.isActive);
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      updateFields.push(`updated_by_id_id = $${paramIndex++}`);
      updateFields.push(`updated_at = NOW()`);
      updateValues.push(userId);

      const updateQuery = `
        UPDATE invoice_templates 
        SET ${updateFields.join(', ')}
        WHERE tenant_id = $${paramIndex++} AND id = $${paramIndex++}
        RETURNING *
      `;

      updateValues.push(tenantId, templateId);

      const updateResult = await client.query(updateQuery, updateValues);
      const updatedTemplate = mapRowToInvoiceTemplate(updateResult.rows[0]);

      // Update fields if provided
      if (data.fields !== undefined) {
        // Delete existing fields
        await client.query('DELETE FROM invoice_template_fields WHERE template_id = $1', [templateId]);

        // Insert new fields
        if (data.fields.length > 0) {
          for (const field of data.fields) {
            const insertFieldQuery = `
              INSERT INTO invoice_template_fields (
                template_id, field_key, field_label, field_type, field_order,
                is_required, is_system, options, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
              RETURNING *
            `;
            
            const fieldValues = [
              templateId,
              field.fieldKey,
              field.fieldLabel,
              field.fieldType,
              field.fieldOrder,
              field.isRequired !== undefined ? field.isRequired : false,
              field.isSystem !== undefined ? field.isSystem : false,
              field.options ? JSON.stringify(field.options) : null
            ];

            await client.query(insertFieldQuery, fieldValues);
          }
        }
      }

      await client.query('COMMIT');
      return updatedTemplate;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete template by ID
   */
  static async deleteTemplate(tenantId: string, templateId: string): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if template exists
      const existingQuery = `
        SELECT id FROM invoice_templates 
        WHERE tenant_id = $1 AND id = $2
      `;
      
      const existingResult = await client.query(existingQuery, [tenantId, templateId]);
      
      if (existingResult.rows.length === 0) {
        throw new Error('Template not found');
      }

      // Delete fields first (foreign key constraint)
      await client.query('DELETE FROM invoice_template_fields WHERE template_id = $1', [templateId]);

      // Delete template
      await client.query('DELETE FROM invoice_templates WHERE tenant_id = $1 AND id = $2', [tenantId, templateId]);

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get default template for billing type
   */
  static async getDefaultTemplate(tenantId: string, billingType: string): Promise<InvoiceTemplate | null> {
    const query = `
      SELECT * FROM invoice_templates 
      WHERE tenant_id = $1 AND billing_type = $2 AND is_default = true AND is_active = true
      LIMIT 1
    `;
    
    const result = await pool.query(query, [tenantId, billingType]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}
