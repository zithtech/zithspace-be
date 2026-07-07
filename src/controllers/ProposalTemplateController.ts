import { Response } from 'express';
import { AuthRequest, ApiResponse, ValidationError } from '@/types';
import { ProposalTemplateModel } from '@/models/ProposalTemplate.model';

const normalizeSectionIds = (val: any): string[] | undefined => {
  if (val === undefined) return undefined;
  if (!Array.isArray(val)) throw new ValidationError('sectionIds must be an array');
  return val.map((id) => String(id));
};

export class ProposalTemplateController {
  /** GET /api/proposal-templates — list templates for the tenant. */
  static async getTemplates(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) throw new ValidationError('Tenant context required');

      const includeArchived = req.query.archived !== 'false';
      const templates = await ProposalTemplateModel.findAll(tenantId, includeArchived);

      res.status(200).json({ success: true, data: templates } as ApiResponse);
    } catch (error: any) {
      console.error('Error fetching proposal templates:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch templates' } as ApiResponse);
    }
  }

  /** GET /api/proposal-templates/:id */
  static async getTemplateById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) throw new ValidationError('Tenant context required');

      const template = await ProposalTemplateModel.findById(req.params.id, tenantId);
      if (!template) {
        res.status(404).json({ success: false, error: 'Template not found' } as ApiResponse);
        return;
      }
      res.status(200).json({ success: true, data: template } as ApiResponse);
    } catch (error: any) {
      console.error('Error fetching template:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch template' } as ApiResponse);
    }
  }

  /** POST /api/proposal-templates */
  static async createTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      if (!tenantId) throw new ValidationError('Tenant context required');

      const { name, description, blocks, sectionIds, themeId, fontId } = req.body;
      if (!name || !String(name).trim()) throw new ValidationError('Template name is required');
      if (blocks !== undefined && !Array.isArray(blocks)) throw new ValidationError('blocks must be an array');

      const trimmedName = String(name).trim();
      const existing = await ProposalTemplateModel.findByName(trimmedName, tenantId);
      if (existing) {
        throw new ValidationError('A template with this name already exists.');
      }

      const template = await ProposalTemplateModel.create({
        tenant_id: tenantId,
        name: trimmedName,
        description,
        blocks,
        section_ids: normalizeSectionIds(sectionIds),
        theme_id: themeId,
        font_id: fontId,
        created_by: userId,
      });

      res.status(201).json({ success: true, data: template, message: 'Template created successfully' } as ApiResponse);
    } catch (error: any) {
      console.error('Error creating template:', error);
      const status = error instanceof ValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: error.message || 'Failed to create template' } as ApiResponse);
    }
  }

  /** PUT /api/proposal-templates/:id */
  static async updateTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) throw new ValidationError('Tenant context required');

      const existing = await ProposalTemplateModel.findById(req.params.id, tenantId);
      if (!existing) {
        res.status(404).json({ success: false, error: 'Template not found' } as ApiResponse);
        return;
      }

      const { name, description, blocks, sectionIds, themeId, fontId, archived } = req.body;
      if (blocks !== undefined && !Array.isArray(blocks)) throw new ValidationError('blocks must be an array');

      let newName: string | undefined;
      if (name !== undefined) {
        newName = String(name).trim();
        if (newName.toLowerCase() !== existing.name.toLowerCase()) {
          const nameConflict = await ProposalTemplateModel.findByName(newName, tenantId);
          if (nameConflict && nameConflict.id !== req.params.id) {
            throw new ValidationError('A template with this name already exists.');
          }
        }
      }

      const updated = await ProposalTemplateModel.update(req.params.id, tenantId, {
        name: newName,
        description,
        blocks,
        section_ids: normalizeSectionIds(sectionIds),
        theme_id: themeId,
        font_id: fontId,
        archived,
      });

      res.status(200).json({ success: true, data: updated, message: 'Template updated successfully' } as ApiResponse);
    } catch (error: any) {
      console.error('Error updating template:', error);
      const status = error instanceof ValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: error.message || 'Failed to update template' } as ApiResponse);
    }
  }

  /** PATCH /api/proposal-templates/:id/archive — body { archived: boolean } */
  static async archiveTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) throw new ValidationError('Tenant context required');

      const archived = req.body?.archived !== false; // default to true
      const updated = await ProposalTemplateModel.setArchived(req.params.id, tenantId, archived);
      if (!updated) {
        res.status(404).json({ success: false, error: 'Template not found' } as ApiResponse);
        return;
      }
      res.status(200).json({ success: true, data: updated, message: archived ? 'Template archived' : 'Template restored' } as ApiResponse);
    } catch (error: any) {
      console.error('Error archiving template:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to archive template' } as ApiResponse);
    }
  }

  /** POST /api/proposal-templates/:id/duplicate */
  static async duplicateTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      if (!tenantId) throw new ValidationError('Tenant context required');

      const copy = await ProposalTemplateModel.duplicate(req.params.id, tenantId, userId);
      if (!copy) {
        res.status(404).json({ success: false, error: 'Template not found' } as ApiResponse);
        return;
      }
      res.status(201).json({ success: true, data: copy, message: 'Template duplicated' } as ApiResponse);
    } catch (error: any) {
      console.error('Error duplicating template:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to duplicate template' } as ApiResponse);
    }
  }

  /** DELETE /api/proposal-templates/:id */
  static async deleteTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) throw new ValidationError('Tenant context required');

      const existing = await ProposalTemplateModel.findById(req.params.id, tenantId);
      if (!existing) {
        res.status(404).json({ success: false, error: 'Template not found' } as ApiResponse);
        return;
      }
      if (existing.system) {
        res.status(403).json({ success: false, error: 'System templates cannot be deleted' } as ApiResponse);
        return;
      }

      await ProposalTemplateModel.remove(req.params.id, tenantId);
      res.status(200).json({ success: true, message: 'Template deleted successfully' } as ApiResponse);
    } catch (error: any) {
      console.error('Error deleting template:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to delete template' } as ApiResponse);
    }
  }
}
