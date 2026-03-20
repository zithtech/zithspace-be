import { Response } from 'express';
import { prisma } from "@/config/database";
import { 
  AuthRequest, 
  ApiResponse, 
  NotFoundError, 
  ValidationError 
} from '@/types';
import { 
  CreateInvoiceTemplateDto, 
  UpdateInvoiceTemplateDto 
} from '@/types/invoiceTemplate';

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

      const template = await prisma.$transaction(async (tx) => {
        // If this is set as default, unset other defaults for this tenant
        if (isDefault) {
          await tx.invoiceTemplate.updateMany({
            where: { tenantId: req.tenantId, isDefault: true },
            data: { isDefault: false }
          });
        }

        return await tx.invoiceTemplate.create({
          data: {
            tenantId: req.tenantId!,
            name,
            description,
            billingType,
            isDefault: !!isDefault,
            isActive: isActive !== false,
            createdById: req.user!.id,
            fields: {
              create: fields.map(field => ({
                fieldKey: field.fieldKey,
                fieldLabel: field.fieldLabel,
                fieldType: field.fieldType,
                fieldOrder: field.fieldOrder,
                isRequired: !!field.isRequired,
                isSystem: !!field.isSystem,
                options: field.options || [],
              }))
            }
          },
          include: { fields: true }
        });
      }, {
        maxWait: 5000, // 5s to acquire a connection
        timeout: 10000, // 10s execution limit
      });

      res.status(201).json({
        success: true,
        data: template,
        message: 'Invoice template created successfully'
      } as ApiResponse);

    } catch (error: any) {
      console.error('Create template error:', error);
      res.status(error instanceof ValidationError ? 400 : 500).json({
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

      const templates = await prisma.invoiceTemplate.findMany({
        where: { tenantId: req.tenantId },
        include: { 
          _count: { select: { fields: true } },
          fields: {
            orderBy: { fieldOrder: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.status(200).json({
        success: true,
        data: templates
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
      const template = await prisma.invoiceTemplate.findFirst({
        where: { id, tenantId: req.tenantId },
        include: {
          fields: {
            orderBy: { fieldOrder: 'asc' }
          }
        }
      });

      if (!template) throw new NotFoundError('Invoice template not found');

      res.status(200).json({
        success: true,
        data: template
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

      const updatedTemplate = await prisma.$transaction(async (tx) => {
        const existing = await tx.invoiceTemplate.findFirst({
          where: { id, tenantId: req.tenantId }
        });

        if (!existing) throw new NotFoundError('Invoice template not found');

        // If this is set as default, unset other defaults
        if (isDefault) {
          await tx.invoiceTemplate.updateMany({
            where: { tenantId: req.tenantId, isDefault: true, id: { not: id } },
            data: { isDefault: false }
          });
        }

        // Manage fields if provided
        if (fields) {
          const incomingFieldIds = fields.filter(f => f.id).map(f => f.id!);
          
          // Delete removed fields
          await tx.invoiceTemplateField.deleteMany({
            where: {
              templateId: id,
              id: { notIn: incomingFieldIds }
            }
          });

          // Update existing and create new fields
          for (const field of fields) {
            const fieldData = {
              fieldKey: field.fieldKey,
              fieldLabel: field.fieldLabel,
              fieldType: field.fieldType,
              fieldOrder: field.fieldOrder,
              isRequired: !!field.isRequired,
              isSystem: !!field.isSystem,
              options: field.options || [],
            };

            if (field.id) {
              await tx.invoiceTemplateField.update({
                where: { id: field.id },
                data: fieldData
              });
            } else {
              await tx.invoiceTemplateField.create({
                data: {
                  ...fieldData,
                  templateId: id
                }
              });
            }
          }
        }

        // Update template metadata
        return await tx.invoiceTemplate.update({
          where: { id },
          data: {
            name,
            description,
            billingType,
            isDefault: isDefault !== undefined ? !!isDefault : undefined,
            isActive: isActive !== undefined ? !!isActive : undefined,
          },
          include: { 
            fields: {
              orderBy: { fieldOrder: 'asc' }
            }
          }
        });
      }, {
        maxWait: 5000,
        timeout: 10000,
      });

      res.status(200).json({
        success: true,
        data: updatedTemplate,
        message: 'Invoice template updated successfully'
      } as ApiResponse);

    } catch (error: any) {
      console.error('Update template error:', error);
      res.status(error instanceof NotFoundError ? 404 : 
                 error instanceof ValidationError ? 400 : 500).json({
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
      
      const existing = await prisma.invoiceTemplate.findFirst({
        where: { id, tenantId: req.tenantId }
      });

      if (!existing) throw new NotFoundError('Invoice template not found');

      await prisma.invoiceTemplate.delete({
        where: { id }
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
