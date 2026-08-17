import { Response } from 'express';
import { 
  AuthRequest, 
  ApiResponse, 
  NotFoundError, 
  ValidationError 
} from '../types';
import {
  Category,
  CreateCategoryData,
  UpdateCategoryData,
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getCategoryStats,
  categoryNameExists
} from '../models/category.model';
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from '../utils/transactionHistory';

export class CategoryController {
  /**
   * Get all categories for a tenant
   */
  static async getCategories(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      console.log(`GET CATEGORIES - Tenant: ${req.tenantId}`);
      
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      const { data, total } = await getCategories(req.tenantId, limit, offset);
      
      res.status(200).json({
        success: true,
        data: data,
        total: total,
        count: data.length
      } as ApiResponse);

    } catch (error: any) {
      console.error('Get categories error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to fetch categories' 
      } as ApiResponse);
    }
  }

  /**
   * Get a single category by ID
   */
  static async getCategoryById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { id } = req.params;
      console.log(`GET CATEGORY - ID: ${id}, Tenant: ${req.tenantId}`);

      const category = await getCategoryById(id, req.tenantId);
      
      if (!category) {
        throw new NotFoundError('Category not found');
      }

      res.status(200).json({
        success: true,
        data: category
      } as ApiResponse);

    } catch (error: any) {
      console.error('Get category error:', error);
      res.status(
        error instanceof NotFoundError ? 404 :
        error instanceof ValidationError ? 400 : 500
      ).json({ 
        success: false, 
        error: error.message || 'Failed to fetch category' 
      } as ApiResponse);
    }
  }

  /**
   * Create a new category
   */
  static async createCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { name, description, color, isActive } = req.body;
      console.log(`CREATE CATEGORY - Tenant: ${req.tenantId}, Name: ${name}`);

      // Validation
      if (!name || name.trim().length === 0) {
        throw new ValidationError('Category name is required');
      }

      if (!color || color.trim().length === 0) {
        throw new ValidationError('Category color is required');
      }

      // Check if category name already exists
      const nameExists = await categoryNameExists(name.trim(), req.tenantId);
      if (nameExists) {
        throw new ValidationError('Category with this name already exists');
      }

      const createData: CreateCategoryData = {
        tenantId: req.tenantId,
        name: name.trim(),
        description: description?.trim() || undefined,
        color: color.trim(),
        isActive: isActive !== undefined ? isActive : true,
        createdBy: req.user.id
      };

      const category = await createCategory(createData);

      console.log(`Category created successfully: ${category.id}`);
      
      res.status(201).json({
        success: true,
        data: category,
        message: 'Category created successfully'
      } as ApiResponse);

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.ACCOUNTS,
        page: Page.ACCOUNTS_SETTINGS,
        action: Action.CREATE,
        actionLabel: `Created category "${category.name}"`,
        entityType: EntityType.EXPENSE_CATEGORY,
        entityId: category.id,
        entityLabel: category.name,
        afterData: {
          name: category.name,
          description: category.description,
          color: category.color,
          isActive: category.isActive,
        },
      });

    } catch (error: any) {
      console.error('Create category error:', error);
      res.status(
        error instanceof ValidationError ? 400 : 500
      ).json({ 
        success: false, 
        error: error.message || 'Failed to create category' 
      } as ApiResponse);
    }
  }

  /**
   * Update an existing category
   */
  static async updateCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { id } = req.params;
      const { name, description, color, isActive } = req.body;
      
      console.log(`UPDATE CATEGORY - ID: ${id}, Tenant: ${req.tenantId}`);

      // Check if category exists
      const existingCategory = await getCategoryById(id, req.tenantId);
      if (!existingCategory) {
        throw new NotFoundError('Category not found');
      }

      // Check if new name already exists (excluding current category)
      if (name && name.trim() !== existingCategory.name) {
        const nameExists = await categoryNameExists(name.trim(), req.tenantId, id);
        if (nameExists) {
          throw new ValidationError('Category with this name already exists');
        }
      }

      const updateData: UpdateCategoryData = {
        updatedBy: req.user.id
      };

      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description?.trim() || undefined;
      if (color !== undefined) updateData.color = color.trim();
      if (isActive !== undefined) updateData.isActive = isActive;

      const updatedCategory = await updateCategory(id, req.tenantId, updateData);
      
      if (!updatedCategory) {
        throw new Error('Failed to update category');
      }

      console.log(`Category updated successfully: ${updatedCategory.id}`);

      res.status(200).json({
        success: true,
        data: updatedCategory,
        message: 'Category updated successfully'
      } as ApiResponse);

      // ─── Activity log ───────────────────────────────────────────────
      const beforeSnap = {
        name: existingCategory.name,
        description: existingCategory.description,
        color: existingCategory.color,
        isActive: existingCategory.isActive,
      };
      const afterSnap = {
        name: updatedCategory.name,
        description: updatedCategory.description,
        color: updatedCategory.color,
        isActive: updatedCategory.isActive,
      };
      const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);

      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.ACCOUNTS,
        page: Page.ACCOUNTS_SETTINGS,
        action: Action.UPDATE,
        actionLabel: `Updated category "${updatedCategory.name}"`,
        entityType: EntityType.EXPENSE_CATEGORY,
        entityId: id,
        entityLabel: updatedCategory.name,
        beforeData: before,
        afterData: after,
        changedFields,
      });

    } catch (error: any) {
      console.error('Update category error:', error);
      res.status(
        error instanceof NotFoundError ? 404 :
        error instanceof ValidationError ? 400 : 500
      ).json({ 
        success: false, 
        error: error.message || 'Failed to update category' 
      } as ApiResponse);
    }
  }

  /**
   * Delete a category (soft delete)
   */
  static async deleteCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { id } = req.params;
      console.log(`DELETE CATEGORY - ID: ${id}, Tenant: ${req.tenantId}`);

      // Check if category exists
      const existingCategory = await getCategoryById(id, req.tenantId);
      if (!existingCategory) {
        throw new NotFoundError('Category not found');
      }

      const deleted = await deleteCategory(id, req.tenantId, req.user.id);

      if (!deleted) {
        throw new Error('Failed to delete category');
      }

      console.log(`Category deleted successfully: ${id}`);

      res.status(200).json({
        success: true,
        message: 'Category deleted successfully'
      } as ApiResponse);

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.ACCOUNTS,
        page: Page.ACCOUNTS_SETTINGS,
        action: Action.DELETE,
        actionLabel: `Deleted category "${existingCategory.name}"`,
        entityType: EntityType.EXPENSE_CATEGORY,
        entityId: id,
        entityLabel: existingCategory.name,
      });

    } catch (error: any) {
      console.error('Delete category error:', error);
      res.status(
        error instanceof NotFoundError ? 404 :
        error instanceof ValidationError ? 400 : 500
      ).json({ 
        success: false, 
        error: error.message || 'Failed to delete category' 
      } as ApiResponse);
    }
  }

  /**
   * Get category statistics
   */
  static async getCategoryStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      console.log(`GET CATEGORY STATS - Tenant: ${req.tenantId}`);

      const stats = await getCategoryStats(req.tenantId);

      res.status(200).json({
        success: true,
        data: stats
      } as ApiResponse);

    } catch (error: any) {
      console.error('Get category stats error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to fetch category statistics' 
      } as ApiResponse);
    }
  }
}

export default CategoryController;
