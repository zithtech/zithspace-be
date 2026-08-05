import { Prisma } from '@prisma/client';
import pool from '../config/dbpool';
import { ValidationError } from '../types';

export interface CreateTemplateDto {
  templateName: string;
  categoryId?: string;
  designationId?: string; // FK to Position or null
  description?: string;
  editorContent: string;
  status?: string;
  placeholders?: Array<{
    placeholderKey: string;
    placeholderLabel: string;
    dataType?: string;
    required?: boolean;
    defaultValue?: string;
    displayOrder?: number;
  }>;
  isGlobal?: boolean;
}

export interface UpdateTemplateDto {
  templateName?: string;
  categoryId?: string | null;
  designationId?: string | null;
  description?: string;
  editorContent?: string;
  status?: string;
  changeNotes?: string;
  placeholders?: Array<{
    placeholderKey: string;
    placeholderLabel: string;
    dataType?: string;
    required?: boolean;
    defaultValue?: string;
    displayOrder?: number;
  }>;
  isGlobal?: boolean;
}

export class LetterTemplateService {
  /**
   * Helper: extract placeholders from HTML/Text content if none provided explicitly
   */
  static extractPlaceholdersFromContent(content: string): Array<{ key: string; label: string }> {
    const placeholdersMap = new Map<string, string>();

    // Match {{key}} or {{key:Label}}
    const regex = /\{\{\s*([a-zA-Z0-9_]+)(?:\s*:\s*([^}]+))?\s*\}\}/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const key = match[1];
      const label = match[2] || key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      if (!placeholdersMap.has(key)) {
        placeholdersMap.set(key, label);
      }
    }

    // Match Tiptap chip attributes e.g. data-placeholder-key="key" data-placeholder-label="label"
    const tiptapRegex = /data-(?:placeholder-key|id)="([^"]+)"(?:\s+data-(?:placeholder-label|label)="([^"]*)")?/g;
    while ((match = tiptapRegex.exec(content)) !== null) {
      const key = match[1];
      const label = match[2] || key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      if (!placeholdersMap.has(key)) {
        placeholdersMap.set(key, label);
      }
    }

    return Array.from(placeholdersMap.entries()).map(([key, label]) => ({
      key,
      label,
    }));
  }

  static async getTemplates(tenantId: string, filters?: { categoryId?: string; designationId?: string; status?: string; search?: string }) {
    const conditions = ["dt.tenant_id IN ($1, 'GLOBAL')"];
    const values: any[] = [tenantId];
    let paramIdx = 2;

    if (filters?.categoryId) {
      conditions.push(`dt.category_id = $${paramIdx++}`);
      values.push(filters.categoryId);
    }
    if (filters?.designationId) {
      conditions.push(`dt.designation_id = $${paramIdx++}`);
      values.push(filters.designationId);
    }
    if (filters?.status) {
      conditions.push(`dt.status = $${paramIdx++}`);
      values.push(filters.status);
    }
    if (filters?.search) {
      conditions.push(`(dt.template_name ILIKE $${paramIdx} OR dt.description ILIKE $${paramIdx})`);
      values.push(`%${filters.search}%`);
      paramIdx++;
    }

    const query = `
      SELECT 
        dt.id, dt.tenant_id AS "tenantId", dt.template_name AS "templateName", 
        dt.description, dt.category_id AS "categoryId", dt.designation_id AS "designationId", 
        dt.editor_content AS "editorContent", dt.current_version AS "currentVersion", 
        dt.status, dt.created_by AS "createdById", dt.created_at AS "createdAt", 
        dt.updated_at AS "updatedAt",
        (SELECT json_build_object('id', dc.id, 'categoryName', dc.category_name, 'description', dc.description) FROM document_categories dc WHERE dc.id = dt.category_id) AS category,
        (SELECT json_build_object('id', p.id, 'title', p.title) FROM positions p WHERE p.id = dt.designation_id) AS designation,
        (SELECT COALESCE(json_agg(json_build_object(
          'id', tp.id, 'tenantId', tp.tenant_id, 'templateId', tp.template_id, 'placeholderKey', tp.placeholder_key, 'placeholderLabel', tp.placeholder_label, 'dataType', tp.data_type, 'required', tp.required, 'defaultValue', tp.default_value, 'displayOrder', tp.display_order, 'createdAt', tp.created_at
        ) ORDER BY tp.display_order ASC), '[]'::json) FROM template_placeholders tp WHERE tp.template_id = dt.id) AS placeholders,
        json_build_object(
          'versions', (SELECT COUNT(*) FROM template_versions tv WHERE tv.template_id = dt.id)::int,
          'generatedDocuments', (SELECT COUNT(*) FROM generated_documents gd WHERE gd.template_id = dt.id)::int
        ) AS "_count"
      FROM document_templates dt
      WHERE ${conditions.join(' AND ')}
      ORDER BY dt.updated_at DESC
    `;
    const result = await pool.query(query, values);
    return result.rows;
  }

  static async getTemplateById(tenantId: string, id: string) {
    const query = `
      SELECT 
        dt.id, dt.tenant_id AS "tenantId", dt.template_name AS "templateName", 
        dt.description, dt.category_id AS "categoryId", dt.designation_id AS "designationId", 
        dt.editor_content AS "editorContent", dt.current_version AS "currentVersion", 
        dt.status, dt.created_by AS "createdById", dt.created_at AS "createdAt", 
        dt.updated_at AS "updatedAt",
        (SELECT json_build_object('id', dc.id, 'categoryName', dc.category_name, 'description', dc.description) FROM document_categories dc WHERE dc.id = dt.category_id) AS category,
        (SELECT json_build_object('id', p.id, 'title', p.title) FROM positions p WHERE p.id = dt.designation_id) AS designation,
        (SELECT COALESCE(json_agg(json_build_object(
          'id', tp.id, 'tenantId', tp.tenant_id, 'templateId', tp.template_id, 'placeholderKey', tp.placeholder_key, 'placeholderLabel', tp.placeholder_label, 'dataType', tp.data_type, 'required', tp.required, 'defaultValue', tp.default_value, 'displayOrder', tp.display_order, 'createdAt', tp.created_at
        ) ORDER BY tp.display_order ASC), '[]'::json) FROM template_placeholders tp WHERE tp.template_id = dt.id) AS placeholders,
        (SELECT COALESCE(json_agg(json_build_object(
          'id', tv.id, 'tenantId', tv.tenant_id, 'templateId', tv.template_id, 'versionNumber', tv.version_number, 'editorContent', tv.editor_content, 'changeNotes', tv.change_notes, 'createdById', tv.created_by, 'createdAt', tv.created_at,
          'createdBy', (SELECT json_build_object('id', u.id, 'name', u.name, 'workEmail', u.work_email) FROM users u WHERE u.id = tv.created_by)
        ) ORDER BY tv.version_number DESC), '[]'::json) FROM template_versions tv WHERE tv.template_id = dt.id) AS versions,
        (SELECT json_build_object('id', u.id, 'name', u.name, 'workEmail', u.work_email) FROM users u WHERE u.id = dt.created_by) AS "createdBy"
      FROM document_templates dt
      WHERE dt.id = $1 AND dt.tenant_id IN ($2, 'GLOBAL')
      LIMIT 1
    `;
    const result = await pool.query(query, [id, tenantId]);
    const template = result.rows[0];

    if (!template) {
      throw new Error('Template not found');
    }

    return template;
  }

  static async createTemplate(tenantId: string, data: CreateTemplateDto, userId: string, ipAddress?: string) {
    const trimmedName = (data.templateName || '').trim();
    if (!trimmedName) {
      throw new ValidationError('Template name is required');
    }

    const existRes = await pool.query(`SELECT id FROM document_templates WHERE tenant_id = $1 AND template_name ILIKE $2 LIMIT 1`, [tenantId, trimmedName]);
    if (existRes.rows.length > 0) {
      throw new ValidationError(`A template with the name "${trimmedName}" already exists.`);
    }

    data.templateName = trimmedName;
    const effectiveTenantId = data.isGlobal ? 'GLOBAL' : tenantId;

    let placeholdersToCreate = data.placeholders || [];
    if (placeholdersToCreate.length === 0) {
      const extracted = this.extractPlaceholdersFromContent(data.editorContent);
      placeholdersToCreate = extracted.map((p, idx) => ({
        placeholderKey: p.key,
        placeholderLabel: p.label,
        dataType: 'Text',
        required: true,
        displayOrder: idx,
      }));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tplRes = await client.query(
        `INSERT INTO document_templates (id, tenant_id, template_name, category_id, designation_id, description, editor_content, current_version, status, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 1, $7, $8, NOW(), NOW()) RETURNING id`,
        [effectiveTenantId, data.templateName, data.categoryId || null, data.designationId || null, data.description || null, data.editorContent, data.status || 'ACTIVE', userId]
      );
      const templateId = tplRes.rows[0].id;

      await client.query(
        `INSERT INTO template_versions (id, tenant_id, template_id, version_number, editor_content, change_notes, created_by, created_at)
         VALUES (gen_random_uuid(), $1, $2, 1, $3, 'Initial template creation', $4, NOW())`,
        [effectiveTenantId, templateId, data.editorContent, userId]
      );

      if (placeholdersToCreate.length > 0) {
        for (let idx = 0; idx < placeholdersToCreate.length; idx++) {
          const p = placeholdersToCreate[idx];
          await client.query(
            `INSERT INTO template_placeholders (id, tenant_id, template_id, placeholder_key, placeholder_label, data_type, required, default_value, display_order, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [effectiveTenantId, templateId, p.placeholderKey, p.placeholderLabel || p.placeholderKey, p.dataType || 'Text', p.required !== undefined ? p.required : true, p.defaultValue || null, p.displayOrder !== undefined ? p.displayOrder : idx]
          );
        }
      }

      await client.query(
        `INSERT INTO document_audit_logs (id, tenant_id, module, reference_id, action, performed_by, ip_address, remarks, created_at)
         VALUES (gen_random_uuid(), $1, 'Template Management', $2, 'Created', $3, $4, $5, NOW())`,
        [effectiveTenantId, templateId, userId, ipAddress || null, `Created template "${data.templateName}"${data.isGlobal ? ' as Global Template' : ''}`]
      );

      await client.query('COMMIT');
      return await this.getTemplateById(tenantId, templateId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async updateTemplate(tenantId: string, id: string, data: UpdateTemplateDto, userId: string, ipAddress?: string) {
    const existing = await this.getTemplateById(tenantId, id);
    if (!existing) {
      throw new Error('Template not found');
    }

    if (existing.tenantId === 'GLOBAL' && tenantId !== 'GLOBAL') {
      throw new ValidationError('Cannot edit global templates. Please duplicate this template first to edit your own copy.');
    }

    if (data.templateName !== undefined) {
      const trimmedName = data.templateName.trim();
      if (!trimmedName) {
        throw new ValidationError('Template name cannot be empty');
      }
      if (trimmedName.toLowerCase() !== existing.templateName.trim().toLowerCase()) {
        const existRes = await pool.query(
          `SELECT id FROM document_templates WHERE tenant_id = $1 AND id != $2 AND template_name ILIKE $3 LIMIT 1`,
          [tenantId, id, trimmedName]
        );
        const existingName = existRes.rows[0];

        if (existingName) {
          throw new ValidationError(`A template with the name "${trimmedName}" already exists.`);
        }
      }
      data.templateName = trimmedName;
    }

    const effectiveTenantId = data.isGlobal ? 'GLOBAL' : existing.tenantId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let newVersionNumber = existing.currentVersion;
      let editorContentChanged = false;

      if (data.editorContent && data.editorContent !== existing.editorContent) {
        newVersionNumber += 1;
        editorContentChanged = true;

        await client.query(
          `INSERT INTO template_versions (id, tenant_id, template_id, version_number, editor_content, change_notes, created_by, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())`,
          [effectiveTenantId, id, newVersionNumber, data.editorContent, data.changeNotes || `Updated template version ${newVersionNumber}`, userId]
        );
      }

      await client.query(
        `UPDATE document_templates 
         SET tenant_id = $1, template_name = $2, category_id = $3, designation_id = $4, description = $5, editor_content = $6, status = $7, current_version = $8, updated_at = NOW()
         WHERE id = $9`,
        [
          effectiveTenantId, 
          data.templateName !== undefined ? data.templateName : existing.templateName,
          data.categoryId !== undefined ? data.categoryId : (existing.categoryId || null),
          data.designationId !== undefined ? data.designationId : (existing.designationId || null),
          data.description !== undefined ? data.description : (existing.description || null),
          data.editorContent !== undefined ? data.editorContent : existing.editorContent,
          data.status !== undefined ? data.status : existing.status,
          newVersionNumber,
          id
        ]
      );

      if (data.placeholders || editorContentChanged) {
        if (data.placeholders && data.placeholders.length > 0) {
          await client.query(`DELETE FROM template_placeholders WHERE template_id = $1`, [id]);
          for (let idx = 0; idx < data.placeholders.length; idx++) {
            const p = data.placeholders[idx];
            await client.query(
              `INSERT INTO template_placeholders (id, tenant_id, template_id, placeholder_key, placeholder_label, data_type, required, default_value, display_order, created_at)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
              [effectiveTenantId, id, p.placeholderKey, p.placeholderLabel || p.placeholderKey, p.dataType || 'Text', p.required !== undefined ? p.required : true, p.defaultValue || null, p.displayOrder !== undefined ? p.displayOrder : idx]
            );
          }
        } else if (editorContentChanged) {
          const extracted = this.extractPlaceholdersFromContent(data.editorContent || existing.editorContent);
          await client.query(`DELETE FROM template_placeholders WHERE template_id = $1`, [id]);
          for (let idx = 0; idx < extracted.length; idx++) {
            const p = extracted[idx];
            const old = existing.placeholders.find((x: any) => x.placeholderKey === p.key);
            await client.query(
              `INSERT INTO template_placeholders (id, tenant_id, template_id, placeholder_key, placeholder_label, data_type, required, default_value, display_order, created_at)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
              [effectiveTenantId, id, p.key, old?.placeholderLabel || p.label, old?.dataType || 'Text', old?.required !== undefined ? old.required : true, old?.defaultValue || null, old?.displayOrder !== undefined ? old.displayOrder : idx]
            );
          }
        }
      }

      await client.query(
        `INSERT INTO document_audit_logs (id, tenant_id, module, reference_id, action, performed_by, ip_address, remarks, created_at)
         VALUES (gen_random_uuid(), $1, 'Template Management', $2, 'Updated', $3, $4, $5, NOW())`,
        [effectiveTenantId, id, userId, ipAddress || null, `Updated template "${data.templateName !== undefined ? data.templateName : existing.templateName}"${data.isGlobal && existing.tenantId !== 'GLOBAL' ? ' and set as Global' : ''} (Version ${newVersionNumber})`]
      );

      await client.query('COMMIT');
      return await this.getTemplateById(tenantId, id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async duplicateTemplate(tenantId: string, id: string, newName: string, userId: string, ipAddress?: string) {
    const existing = await this.getTemplateById(tenantId, id);
    if (!existing) {
      throw new Error('Template not found');
    }

    let targetName = (newName || `${existing.templateName} (Copy)`).trim();
    let counter = 1;
    while (true) {
      const existRes = await pool.query(`SELECT id FROM document_templates WHERE tenant_id = $1 AND template_name ILIKE $2 LIMIT 1`, [tenantId, targetName]);
      if (existRes.rows.length === 0) break;
      counter += 1;
      const baseName = (newName || existing.templateName).replace(/\s*\(Copy(\s+\d+)?\)$/i, '').trim();
      targetName = `${baseName} (Copy ${counter})`;
    }

    return await this.createTemplate(
      tenantId,
      {
        templateName: targetName,
        categoryId: existing.categoryId || undefined,
        designationId: existing.designationId || undefined,
        description: existing.description || undefined,
        editorContent: existing.editorContent,
        status: 'ACTIVE',
        placeholders: existing.placeholders.map((p: any) => ({
          placeholderKey: p.placeholderKey,
          placeholderLabel: p.placeholderLabel,
          dataType: p.dataType,
          required: p.required,
          defaultValue: p.defaultValue || undefined,
          displayOrder: p.displayOrder,
        })),
      },
      userId,
      ipAddress
    );
  }

  static async restoreVersion(tenantId: string, templateId: string, versionNumber: number, userId: string, ipAddress?: string) {
    const verRes = await pool.query(`SELECT editor_content AS "editorContent" FROM template_versions WHERE template_id = $1 AND version_number = $2 AND tenant_id = $3 LIMIT 1`, [templateId, versionNumber, tenantId]);
    const version = verRes.rows[0];

    if (!version) {
      throw new Error('Version not found');
    }

    return await this.updateTemplate(
      tenantId,
      templateId,
      {
        editorContent: version.editorContent,
        changeNotes: `Restored from version ${versionNumber}`,
      },
      userId,
      ipAddress
    );
  }

  static async deleteTemplate(tenantId: string, id: string, userId: string, ipAddress?: string) {
    const existing = await this.getTemplateById(tenantId, id);
    if (!existing) {
      throw new Error('Template not found');
    }
    
    if (existing.tenantId === 'GLOBAL') {
        throw new ValidationError('Cannot delete global templates.');
    }

    const delRes = await pool.query(`DELETE FROM document_templates WHERE id = $1 RETURNING *`, [id]);
    const res = delRes.rows[0];

    await pool.query(
      `INSERT INTO document_audit_logs (id, tenant_id, module, reference_id, action, performed_by, ip_address, remarks, created_at)
       VALUES (gen_random_uuid(), $1, 'Template Management', $2, 'Deleted', $3, $4, $5, NOW())`,
      [tenantId, id, userId, ipAddress || null, `Deleted template "${existing.templateName}"`]
    );

    return res;
  }
}
