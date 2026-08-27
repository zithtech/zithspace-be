import { Response } from 'express';
import { AuthRequest, ApiResponse, ValidationError } from '../types';
import { DocumentCategoryService } from '../services/DocumentCategoryService';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
  diffShallow,
} from '../utils/transactionHistory';

export class DocumentCategoryController {
  static async getCategories(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const categories = await DocumentCategoryService.getCategories(req.tenantId);

      res.status(200).json({
        success: true,
        data: categories,
      } as ApiResponse);
    } catch (error: any) {
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to fetch categories',
      } as ApiResponse);
    }
  }

  static async getCategoryById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { id } = req.params;
      const category = await DocumentCategoryService.getCategoryById(req.tenantId, id);

      if (!category) {
        res.status(404).json({ success: false, message: 'Category not found' } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: category,
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch category',
      } as ApiResponse);
    }
  }

  static async createCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { categoryName, description, status } = req.body;
      if (!categoryName) {
        throw new ValidationError('Category name is required');
      }

      const category = await DocumentCategoryService.createCategory(req.tenantId, {
        categoryName,
        description,
        status,
      });

      recordTransaction({
        req: req as any,
        section: Section.HR,
        module: Module.DOCS_AND_LETTERS,
        page: Page.DOCUMENT_CATEGORIES,
        action: Action.CREATE,
        actionLabel: `Created document category "${category.categoryName}"`,
        entityType: EntityType.DOCUMENT_CATEGORY,
        entityId: category.id,
        entityLabel: category.categoryName,
        afterData: { status: category.status, description: category.description },
      });

      res.status(201).json({
        success: true,
        data: category,
        message: 'Category created successfully',
      } as ApiResponse);
    } catch (error: any) {
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to create category',
      } as ApiResponse);
    }
  }

  static async updateCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { id } = req.params;
      const before = await DocumentCategoryService.getCategoryById(req.tenantId, id);
      const category = await DocumentCategoryService.updateCategory(req.tenantId, id, req.body);

      if (before) {
        const diff = diffShallow(before, category);
        if (diff.changedFields.length > 0) {
          recordTransaction({
            req: req as any,
            section: Section.HR,
            module: Module.DOCS_AND_LETTERS,
            page: Page.DOCUMENT_CATEGORIES,
            action: Action.UPDATE,
            actionLabel: `Updated document category "${category.categoryName}"`,
            entityType: EntityType.DOCUMENT_CATEGORY,
            entityId: category.id,
            entityLabel: category.categoryName,
            beforeData: diff.before,
            afterData: diff.after,
            changedFields: diff.changedFields,
          });
        }
      }

      res.status(200).json({
        success: true,
        data: category,
        message: 'Category updated successfully',
      } as ApiResponse);
    } catch (error: any) {
      res.status(error.message === 'Category not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to update category',
      } as ApiResponse);
    }
  }

  static async deleteCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { id } = req.params;
      const existing = await DocumentCategoryService.getCategoryById(req.tenantId, id).catch(() => null);
      await DocumentCategoryService.deleteCategory(req.tenantId, id);

      if (existing) {
        recordTransaction({
          req: req as any,
          section: Section.HR,
          module: Module.DOCS_AND_LETTERS,
          page: Page.DOCUMENT_CATEGORIES,
          action: Action.DELETE,
          actionLabel: `Deleted document category "${existing.categoryName}"`,
          entityType: EntityType.DOCUMENT_CATEGORY,
          entityId: existing.id,
          entityLabel: existing.categoryName,
          beforeData: { status: existing.status, description: existing.description },
        });
      }

      res.status(200).json({
        success: true,
        message: 'Category deleted successfully',
      } as ApiResponse);
    } catch (error: any) {
      res.status(error.message === 'Category not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to delete category',
      } as ApiResponse);
    }
  }
}
