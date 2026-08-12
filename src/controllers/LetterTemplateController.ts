import { Response } from 'express';
import { AuthRequest, ApiResponse, ValidationError } from '../types';
import { LetterTemplateService } from '../services/LetterTemplateService';
import { AIService } from '../services/aiService';
import { uploadImageToR2 } from '../utils/r2Client';

export class LetterTemplateController {
  static async getTemplates(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { categoryId, designationId, status, search } = req.query;
      const templates = await LetterTemplateService.getTemplates(req.tenantId, {
        categoryId: categoryId as string,
        designationId: designationId as string,
        status: status as string,
        search: search as string,
      });

      res.status(200).json({
        success: true,
        data: templates,
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch templates',
      } as ApiResponse);
    }
  }

  static async getTemplateById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { id } = req.params;
      const template = await LetterTemplateService.getTemplateById(req.tenantId, id);

      res.status(200).json({
        success: true,
        data: template,
      } as ApiResponse);
    } catch (error: any) {
      res.status(error.message === 'Template not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to fetch template',
      } as ApiResponse);
    }
  }

  static async createTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and user authentication required');
      }

      const { templateName, editorContent, isGlobal } = req.body;
      if (!templateName || !editorContent) {
        throw new ValidationError('Template name and content are required');
      }

      if (isGlobal && req.user.role !== 'super_admin' && req.user.role !== 'admin') {
        // Silently ignore or throw error? Let's throw error.
        throw new ValidationError('Only super admins can create global templates');
      }

      const ipAddress = req.ip || req.socket.remoteAddress || undefined;
      const template = await LetterTemplateService.createTemplate(
        req.tenantId,
        req.body,
        req.user.id,
        ipAddress
      );

      res.status(201).json({
        success: true,
        data: template,
        message: 'Template created successfully',
      } as ApiResponse);
    } catch (error: any) {
      const is400 = error instanceof ValidationError || error.name === 'ValidationError' || error.code === 'VALIDATION_ERROR' || error.message?.includes('already exists') || error.message?.includes('required') || error.message?.includes('empty');
      res.status(is400 ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to create template',
      } as ApiResponse);
    }
  }

  static async generateTemplateWithZai(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and user authentication required');
      }

      const { templateName, categoryId, description, placeholders } = req.body;
      if (!templateName || !description) {
        throw new ValidationError('Template name and description are required');
      }

      // Call AI Service to generate HTML content
      const generatedHtml = await AIService.generateLetterTemplate({
        templateName,
        category: categoryId || 'General',
        description,
        placeholders: placeholders || []
      }, req.tenantId);

      // Convert any {{placeholder}} from Zai into proper Tiptap span elements
      const finalHtml = generatedHtml.replace(/\{\{([^}]+)\}\}/g, (match, inner) => {
        const key = inner.trim().toLowerCase().replace(/\s+/g, '_');
        const label = inner.trim().replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
        return `<span data-placeholder-key="${key}" style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 500; border: 1px solid #7dd3fc; display: inline-block;">{{${label}}}</span>`;
      });

      const ipAddress = req.ip || req.socket.remoteAddress || undefined;

      const defaultPageConfig = {
        marginTop: '20mm',
        marginBottom: '20mm',
        marginLeft: '20mm',
        marginRight: '20mm',
        borderWidth: '0px',
        borderStyle: 'solid',
        borderColor: '#000000',
        headerHtml: '',
        footerHtml: '<div style="border-top: 1px solid #cbd5e1; padding-top: 8px; text-align: right; font-size: 11px; color: #64748b;">Page <span class="pageNumber" style="font-weight: bold; color: #64748b;">[Page #]</span></div>'
      };
      
      const configScript = `\n<script id="zith-page-config" type="application/json">${JSON.stringify(defaultPageConfig)}</script>`;

      const templateData = {
        templateName,
        categoryId,
        description,
        editorContent: finalHtml + configScript,
        status: 'ACTIVE',
        placeholders: (placeholders || []).map((p: string, idx: number) => ({
          placeholderKey: p.toLowerCase().replace(/\s+/g, '_'),
          placeholderLabel: p.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
          dataType: 'string',
          required: false,
          displayOrder: idx
        }))
      };

      const template = await LetterTemplateService.createTemplate(
        req.tenantId,
        templateData,
        req.user.id,
        ipAddress
      );

      res.status(201).json({
        success: true,
        data: template,
        message: 'Template generated successfully by Zai',
      } as ApiResponse);
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to generate template with Zai',
      } as ApiResponse);
    }
  }

  static async updateTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and user authentication required');
      }

      const { id } = req.params;
      const { isGlobal } = req.body;

      if (isGlobal && req.user.role?.toUpperCase() !== 'SUPER_ADMIN' && req.user.role?.toUpperCase() !== 'SUPER ADMIN') {
        throw new ValidationError('Only super admins can set templates as global');
      }

      const ipAddress = req.ip || req.socket.remoteAddress || undefined;
      const template = await LetterTemplateService.updateTemplate(
        req.tenantId,
        id,
        req.body,
        req.user.id,
        ipAddress
      );

      res.status(200).json({
        success: true,
        data: template,
        message: 'Template updated successfully',
      } as ApiResponse);
    } catch (error: any) {
      const is400 = error instanceof ValidationError || error.name === 'ValidationError' || error.code === 'VALIDATION_ERROR' || error.message?.includes('already exists') || error.message?.includes('required') || error.message?.includes('empty');
      res.status(error.message === 'Template not found' ? 404 : (is400 ? 400 : 500)).json({
        success: false,
        message: error.message || 'Failed to update template',
      } as ApiResponse);
    }
  }

  static async duplicateTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and user authentication required');
      }

      const { id } = req.params;
      const { newName } = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress || undefined;

      const template = await LetterTemplateService.duplicateTemplate(
        req.tenantId,
        id,
        newName,
        req.user.id,
        ipAddress
      );

      res.status(201).json({
        success: true,
        data: template,
        message: 'Template duplicated successfully',
      } as ApiResponse);
    } catch (error: any) {
      const is400 = error instanceof ValidationError || error.name === 'ValidationError' || error.code === 'VALIDATION_ERROR' || error.message?.includes('already exists') || error.message?.includes('required') || error.message?.includes('empty');
      res.status(error.message === 'Template not found' ? 404 : (is400 ? 400 : 500)).json({
        success: false,
        message: error.message || 'Failed to duplicate template',
      } as ApiResponse);
    }
  }

  static async restoreVersion(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and user authentication required');
      }

      const { id, versionNumber } = req.params;
      const ipAddress = req.ip || req.socket.remoteAddress || undefined;

      const template = await LetterTemplateService.restoreVersion(
        req.tenantId,
        id,
        parseInt(versionNumber, 10),
        req.user.id,
        ipAddress
      );

      res.status(200).json({
        success: true,
        data: template,
        message: `Template restored to version ${versionNumber} successfully`,
      } as ApiResponse);
    } catch (error: any) {
      res.status(error.message === 'Version not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to restore template version',
      } as ApiResponse);
    }
  }

  static async deleteTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and user authentication required');
      }

      const { id } = req.params;
      const ipAddress = req.ip || req.socket.remoteAddress || undefined;
      await LetterTemplateService.deleteTemplate(req.tenantId, id, req.user.id, ipAddress);

      res.status(200).json({
        success: true,
        message: 'Template deleted successfully',
      } as ApiResponse);
    } catch (error: any) {
      res.status(error.message === 'Template not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to delete template',
      } as ApiResponse);
    }
  }

  static async uploadTemplateImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and user authentication required');
      }

      const { image } = req.body;
      if (!image) {
        throw new ValidationError('Image data is required');
      }

      const url = await uploadImageToR2(image, req.tenantId, 'template');

      res.status(200).json({
        success: true,
        data: { url },
        message: 'Image uploaded successfully',
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to upload template image',
      } as ApiResponse);
    }
  }
}
