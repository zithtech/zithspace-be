import { Response } from 'express';
import { 
  AuthRequest, 
  ApiResponse, 
  NotFoundError, 
  ValidationError 
} from '../types';
import { 
  CreateInvoiceTemplateDto, 
  UpdateInvoiceTemplateDto 
} from '../types/invoiceTemplate';
import { InvoiceTemplateModel } from '../models/invoiceTemplate.model';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '../utils/transactionHistory';

export class InvoiceTemplateController {
  
  /**
   * Create a new invoice template with fields
   */
  static async createTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { name, description, billingType, isDefault, isActive, fields }: CreateInvoiceTemplateDto = req.body;

      if (!name || !billingType) {
        throw new ValidationError('Name and billing type are required');
      }

      const template = await InvoiceTemplateModel.createTemplate(
        req.tenantId,
        { name, description, billingType, isDefault, isActive, fields },
        req.user.id
      );

      // Get the template with fields for response
      const templateWithFields = await InvoiceTemplateModel.getTemplateById(req.tenantId, template.id);

      res.status(201).json({
        success: true,
        data: templateWithFields,
        message: 'Invoice template created successfully'
      } as ApiResponse);

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.INVOICES,
        page: Page.INVOICE_TEMPLATE_LIST,
        action: Action.CREATE,
        actionLabel: `Created template ${name}`,
        entityType: EntityType.INVOICE_TEMPLATE,
        entityId: template.id,
        entityLabel: name,
        afterData: { name, billingType, isDefault, isActive },
      });

    } catch (error: any) {
      console.error('Create template error:', error);
      const isValidationError = error instanceof ValidationError || 
                                error.message?.includes('already exists');
      res.status(isValidationError ? 400 : 500).json({
        success: false,
        error: error.message || 'Failed to create invoice template'
      } as ApiResponse);
    }
  }

  /**
   * Get all templates for the tenant
   */
  static async getTemplates(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) throw new ValidationError('Tenant context required');

      const { page, limit } = req.query;
      const parsedLimit = limit ? parseInt(limit as string) : undefined;
      const parsedOffset = page && parsedLimit ? (parseInt(page as string) - 1) * parsedLimit : undefined;

      const { templates, total } = await InvoiceTemplateModel.getTemplates(req.tenantId, parsedLimit, parsedOffset);

      // Get fields for each template
      const templatesWithFields = await Promise.all(
        templates.map(async (template) => {
          const templateWithFields = await InvoiceTemplateModel.getTemplateById(req.tenantId, template.id);
          return {
            ...template,
            fields: templateWithFields?.fields || [],
            _count: { fields: templateWithFields?.fields?.length || 0 }
          };
        })
      );

      res.status(200).json({
        success: true,
        data: templatesWithFields,
        ...(parsedLimit ? {
          pagination: {
            page: parseInt(page as string) || 1,
            limit: parsedLimit,
            total,
            pages: Math.ceil(total / parsedLimit)
          }
        } : { total })
      } as ApiResponse);

    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch templates'
      } as ApiResponse);
    }
  }

  /**
   * Get template by ID with fields ordered
   */
  static async getTemplateById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) throw new ValidationError('Tenant context required');

      const { id } = req.params;
      const templateResult = await InvoiceTemplateModel.getTemplateById(req.tenantId, id);

      if (!templateResult) throw new NotFoundError('Invoice template not found');

      res.status(200).json({
        success: true,
        data: {
          ...templateResult.template,
          fields: templateResult.fields
        }
      } as ApiResponse);

    } catch (error: any) {
      res.status(error instanceof NotFoundError ? 404 : 500).json({
        success: false,
        error: error.message || 'Failed to fetch template'
      } as ApiResponse);
    }
  }

  /**
   * Update template and its fields
   */
  static async updateTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { id } = req.params;
      const { name, description, billingType, isDefault, isActive, fields }: UpdateInvoiceTemplateDto = req.body;

      const updatedTemplate = await InvoiceTemplateModel.updateTemplate(
        req.tenantId,
        id,
        { name, description, billingType, isDefault, isActive, fields },
        req.user.id
      );

      // Get the updated template with fields for response
      const templateWithFields = await InvoiceTemplateModel.getTemplateById(req.tenantId, id);

      res.status(200).json({
        success: true,
        data: {
          ...updatedTemplate,
          fields: templateWithFields?.fields || []
        },
        message: 'Invoice template updated successfully'
      } as ApiResponse);

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.INVOICES,
        page: Page.INVOICE_TEMPLATE_LIST,
        action: Action.UPDATE,
        actionLabel: `Updated template ${updatedTemplate.name}`,
        entityType: EntityType.INVOICE_TEMPLATE,
        entityId: id,
        entityLabel: updatedTemplate.name,
        afterData: { name: updatedTemplate.name, isActive: updatedTemplate.isActive, isDefault: updatedTemplate.isDefault },
      });

    } catch (error: any) {
      console.error('Update template error:', error);
      const isValidationError = error instanceof ValidationError || 
                                error.message?.includes('already exists');
      res.status(error instanceof NotFoundError ? 404 : 
                 isValidationError ? 400 : 500).json({
        success: false,
        error: error.message || 'Failed to update invoice template'
      } as ApiResponse);
    }
  }

  /**
   * Delete template
   */
  static async deleteTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) throw new ValidationError('Tenant context required');

      const { id } = req.params;
      
      const templateResult = await InvoiceTemplateModel.getTemplateById(req.tenantId, id);
      const templateName = templateResult?.template?.name || id;

      await InvoiceTemplateModel.deleteTemplate(req.tenantId, id);

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.INVOICES,
        page: Page.INVOICE_TEMPLATE_LIST,
        action: Action.DELETE,
        actionLabel: `Deleted template ${templateName}`,
        entityType: EntityType.INVOICE_TEMPLATE,
        entityId: id,
        entityLabel: templateName,
      });

      res.status(200).json({
        success: true,
        message: 'Invoice template deleted successfully'
      } as ApiResponse);

    } catch (error: any) {
      res.status(error instanceof NotFoundError ? 404 : 500).json({
        success: false,
        error: error.message || 'Failed to delete template'
      } as ApiResponse);
    }
  }
}
