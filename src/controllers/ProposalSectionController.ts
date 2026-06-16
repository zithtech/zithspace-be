import { Response } from 'express';
import { AuthRequest, ApiResponse, ValidationError } from '@/types';
import { ProposalSectionModel } from '@/models/ProposalSection.model';

const VALID_CATEGORIES = ['Introduction', 'Service', 'Pricing', 'Legal', 'Trust', 'Closing', 'Custom'];
const VALID_TYPES = ['text', 'cover', 'pricing', 'timeline', 'scope', 'signature', 'terms', 'testimonial', 'gallery', 'video', 'cta'];

export class ProposalSectionController {
  /** GET /api/proposal-sections — list sections for the tenant. */
  static async getSections(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) throw new ValidationError('Tenant context required');

      const includeArchived = req.query.archived !== 'false';
      const sections = await ProposalSectionModel.findAll(tenantId, includeArchived);

      res.status(200).json({ success: true, data: sections } as ApiResponse);
    } catch (error: any) {
      console.error('Error fetching proposal sections:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch sections' } as ApiResponse);
    }
  }

  /** GET /api/proposal-sections/:id */
  static async getSectionById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) throw new ValidationError('Tenant context required');

      const section = await ProposalSectionModel.findById(req.params.id, tenantId);
      if (!section) {
        res.status(404).json({ success: false, error: 'Section not found' } as ApiResponse);
        return;
      }
      res.status(200).json({ success: true, data: section } as ApiResponse);
    } catch (error: any) {
      console.error('Error fetching section:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch section' } as ApiResponse);
    }
  }

  /** POST /api/proposal-sections */
  static async createSection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      if (!tenantId) throw new ValidationError('Tenant context required');

      const { name, category, type, description, components, data, isGlobal } = req.body;
      if (!name || !String(name).trim()) throw new ValidationError('Section name is required');
      if (category && !VALID_CATEGORIES.includes(category)) throw new ValidationError('Invalid category');
      if (type && !VALID_TYPES.includes(type)) throw new ValidationError('Invalid section type');

      const section = await ProposalSectionModel.create({
        tenant_id: tenantId,
        name: String(name).trim(),
        category,
        type,
        description,
        components,
        data,
        is_global: !!isGlobal,
        created_by: userId,
      });

      res.status(201).json({ success: true, data: section, message: 'Section created successfully' } as ApiResponse);
    } catch (error: any) {
      console.error('Error creating section:', error);
      const status = error instanceof ValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: error.message || 'Failed to create section' } as ApiResponse);
    }
  }

  /** PUT /api/proposal-sections/:id */
  static async updateSection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) throw new ValidationError('Tenant context required');

      const existing = await ProposalSectionModel.findById(req.params.id, tenantId);
      if (!existing) {
        res.status(404).json({ success: false, error: 'Section not found' } as ApiResponse);
        return;
      }

      const { name, category, type, description, components, data, isGlobal, archived } = req.body;
      if (category && !VALID_CATEGORIES.includes(category)) throw new ValidationError('Invalid category');
      if (type && !VALID_TYPES.includes(type)) throw new ValidationError('Invalid section type');

      const updated = await ProposalSectionModel.update(req.params.id, tenantId, {
        name: name !== undefined ? String(name).trim() : undefined,
        category,
        type,
        description,
        components,
        data,
        is_global: isGlobal,
        archived,
      });

      res.status(200).json({ success: true, data: updated, message: 'Section updated successfully' } as ApiResponse);
    } catch (error: any) {
      console.error('Error updating section:', error);
      const status = error instanceof ValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: error.message || 'Failed to update section' } as ApiResponse);
    }
  }

  /** PATCH /api/proposal-sections/:id/archive — body { archived: boolean } */
  static async archiveSection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) throw new ValidationError('Tenant context required');

      const archived = req.body?.archived !== false; // default to true
      const updated = await ProposalSectionModel.setArchived(req.params.id, tenantId, archived);
      if (!updated) {
        res.status(404).json({ success: false, error: 'Section not found' } as ApiResponse);
        return;
      }
      res.status(200).json({ success: true, data: updated, message: archived ? 'Section archived' : 'Section restored' } as ApiResponse);
    } catch (error: any) {
      console.error('Error archiving section:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to archive section' } as ApiResponse);
    }
  }

  /** POST /api/proposal-sections/:id/duplicate */
  static async duplicateSection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      if (!tenantId) throw new ValidationError('Tenant context required');

      const copy = await ProposalSectionModel.duplicate(req.params.id, tenantId, userId);
      if (!copy) {
        res.status(404).json({ success: false, error: 'Section not found' } as ApiResponse);
        return;
      }
      res.status(201).json({ success: true, data: copy, message: 'Section duplicated' } as ApiResponse);
    } catch (error: any) {
      console.error('Error duplicating section:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to duplicate section' } as ApiResponse);
    }
  }

  /** DELETE /api/proposal-sections/:id */
  static async deleteSection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) throw new ValidationError('Tenant context required');

      const existing = await ProposalSectionModel.findById(req.params.id, tenantId);
      if (!existing) {
        res.status(404).json({ success: false, error: 'Section not found' } as ApiResponse);
        return;
      }
      if (existing.system) {
        res.status(403).json({ success: false, error: 'System sections cannot be deleted' } as ApiResponse);
        return;
      }

      await ProposalSectionModel.remove(req.params.id, tenantId);
      res.status(200).json({ success: true, message: 'Section deleted successfully' } as ApiResponse);
    } catch (error: any) {
      console.error('Error deleting section:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to delete section' } as ApiResponse);
    }
  }
}
