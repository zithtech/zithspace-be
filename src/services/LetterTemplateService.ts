import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
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
    const where: Prisma.DocumentTemplateWhereInput = { tenantId: { in: [tenantId, 'GLOBAL'] } };

    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.designationId) where.designationId = filters.designationId;
    if (filters?.status) where.status = filters.status;
    if (filters?.search) {
      where.OR = [
        { templateName: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return await prisma.documentTemplate.findMany({
      where,
      include: {
        category: true,
        designation: true,
        placeholders: { orderBy: { displayOrder: 'asc' } },
        _count: {
          select: {
            versions: true,
            generatedDocuments: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  static async getTemplateById(tenantId: string, id: string) {
    const template = await prisma.documentTemplate.findFirst({
      where: { id, tenantId: { in: [tenantId, 'GLOBAL'] } },
      include: {
        category: true,
        designation: true,
        placeholders: { orderBy: { displayOrder: 'asc' } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { createdBy: { select: { id: true, name: true, workEmail: true } } },
        },
        createdBy: { select: { id: true, name: true, workEmail: true } },
      },
    });

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

    const existingName = await prisma.documentTemplate.findFirst({
      where: {
        tenantId,
        templateName: {
          equals: trimmedName,
          mode: 'insensitive',
        },
      },
    });

    if (existingName) {
      throw new ValidationError(`A template with the name "${trimmedName}" already exists.`);
    }

    data.templateName = trimmedName;

    // Optional: override tenantId if isGlobal
    // Wait, the UI request only sets it if Super Admin, but we can do a backend check if we have the user role.
    const effectiveTenantId = data.isGlobal ? 'GLOBAL' : tenantId;

    // 1. Determine placeholders
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

    // 2. Create Template, initial Version, Placeholders, and Audit Log in transaction
    return await prisma.$transaction(async (tx) => {
      const template = await tx.documentTemplate.create({
        data: {
          tenantId: effectiveTenantId,
          templateName: data.templateName,
          categoryId: data.categoryId || null,
          designationId: data.designationId || null,
          description: data.description || null,
          editorContent: data.editorContent,
          currentVersion: 1,
          status: data.status || 'ACTIVE',
          createdById: userId,
        },
      });

      // Create Version 1
      await tx.templateVersion.create({
        data: {
          tenantId: effectiveTenantId,
          templateId: template.id,
          versionNumber: 1,
          editorContent: data.editorContent,
          changeNotes: 'Initial template creation',
          createdById: userId,
        },
      });

      // Create Placeholders
      if (placeholdersToCreate.length > 0) {
        await tx.templatePlaceholder.createMany({
          data: placeholdersToCreate.map((p, idx) => ({
            tenantId: effectiveTenantId,
            templateId: template.id,
            placeholderKey: p.placeholderKey,
            placeholderLabel: p.placeholderLabel || p.placeholderKey,
            dataType: p.dataType || 'Text',
            required: p.required !== undefined ? p.required : true,
            defaultValue: p.defaultValue || null,
            displayOrder: p.displayOrder !== undefined ? p.displayOrder : idx,
          })),
        });
      }

      // Audit log
      await tx.documentAuditLog.create({
        data: {
          tenantId: effectiveTenantId,
          module: 'Template Management',
          referenceId: template.id,
          action: 'Created',
          performedById: userId,
          ipAddress: ipAddress || null,
          remarks: `Created template "${data.templateName}"${data.isGlobal ? ' as Global Template' : ''}`,
        },
      });

      return await tx.documentTemplate.findUnique({
        where: { id: template.id },
        include: {
          category: true,
          designation: true,
          placeholders: true,
        },
      });
    });
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
        const existingName = await prisma.documentTemplate.findFirst({
          where: {
            tenantId,
            id: { not: id },
            templateName: {
              equals: trimmedName,
              mode: 'insensitive',
            },
          },
        });

        if (existingName) {
          throw new ValidationError(`A template with the name "${trimmedName}" already exists.`);
        }
      }
      data.templateName = trimmedName;
    }

    const effectiveTenantId = data.isGlobal ? 'GLOBAL' : existing.tenantId;

    return await prisma.$transaction(async (tx) => {
      let newVersionNumber = existing.currentVersion;
      let editorContentChanged = false;

      if (data.editorContent && data.editorContent !== existing.editorContent) {
        newVersionNumber += 1;
        editorContentChanged = true;

        await tx.templateVersion.create({
          data: {
            tenantId: effectiveTenantId,
            templateId: id,
            versionNumber: newVersionNumber,
            editorContent: data.editorContent,
            changeNotes: data.changeNotes || `Updated template version ${newVersionNumber}`,
            createdById: userId,
          },
        });
      }

      const updated = await tx.documentTemplate.update({
        where: { id },
        data: {
          tenantId: effectiveTenantId,
          templateName: data.templateName !== undefined ? data.templateName : existing.templateName,
          categoryId: data.categoryId !== undefined ? data.categoryId : existing.categoryId,
          designationId: data.designationId !== undefined ? data.designationId : existing.designationId,
          description: data.description !== undefined ? data.description : existing.description,
          editorContent: data.editorContent !== undefined ? data.editorContent : existing.editorContent,
          status: data.status !== undefined ? data.status : existing.status,
          currentVersion: newVersionNumber,
        },
      });

      // Update Placeholders if provided or content changed
      if (data.placeholders || editorContentChanged) {
        if (data.placeholders && data.placeholders.length > 0) {
          await tx.templatePlaceholder.deleteMany({
            where: { templateId: id },
          });

          await tx.templatePlaceholder.createMany({
            data: data.placeholders.map((p, idx) => ({
              tenantId: effectiveTenantId,
              templateId: id,
              placeholderKey: p.placeholderKey,
              placeholderLabel: p.placeholderLabel || p.placeholderKey,
              dataType: p.dataType || 'Text',
              required: p.required !== undefined ? p.required : true,
              defaultValue: p.defaultValue || null,
              displayOrder: p.displayOrder !== undefined ? p.displayOrder : idx,
            })),
          });
        } else if (editorContentChanged) {
          const extracted = this.extractPlaceholdersFromContent(updated.editorContent);
          await tx.templatePlaceholder.deleteMany({ where: { templateId: id } });
          await tx.templatePlaceholder.createMany({
            data: extracted.map((p, idx) => {
              const old = existing.placeholders.find(x => x.placeholderKey === p.key);
              return {
                tenantId: effectiveTenantId,
                templateId: id,
                placeholderKey: p.key,
                placeholderLabel: old?.placeholderLabel || p.label,
                dataType: old?.dataType || 'Text',
                required: old?.required !== undefined ? old.required : true,
                defaultValue: old?.defaultValue || null,
                displayOrder: old?.displayOrder !== undefined ? old.displayOrder : idx,
              };
            }),
          });
        }
      }

      await tx.documentAuditLog.create({
        data: {
          tenantId: effectiveTenantId,
          module: 'Template Management',
          referenceId: id,
          action: 'Updated',
          performedById: userId,
          ipAddress: ipAddress || null,
          remarks: `Updated template "${updated.templateName}"${data.isGlobal && existing.tenantId !== 'GLOBAL' ? ' and set as Global' : ''} (Version ${newVersionNumber})`,
        },
      });

      return await tx.documentTemplate.findUnique({
        where: { id },
        include: { category: true, designation: true, placeholders: true },
      });
    });
  }

  static async duplicateTemplate(tenantId: string, id: string, newName: string, userId: string, ipAddress?: string) {
    const existing = await this.getTemplateById(tenantId, id);
    if (!existing) {
      throw new Error('Template not found');
    }

    let targetName = (newName || `${existing.templateName} (Copy)`).trim();
    let counter = 1;
    while (true) {
      const exists = await prisma.documentTemplate.findFirst({
        where: {
          tenantId,
          templateName: { equals: targetName, mode: 'insensitive' },
        },
      });
      if (!exists) break;
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
        placeholders: existing.placeholders.map(p => ({
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
    const version = await prisma.templateVersion.findFirst({
      where: { templateId, versionNumber, tenantId },
    });

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

    // Delete template and log audit
    const res = await prisma.documentTemplate.delete({
      where: { id },
    });

    await prisma.documentAuditLog.create({
      data: {
        tenantId,
        module: 'Template Management',
        referenceId: id,
        action: 'Deleted',
        performedById: userId,
        ipAddress: ipAddress || null,
        remarks: `Deleted template "${existing.templateName}"`,
      },
    });

    return res;
  }
}
