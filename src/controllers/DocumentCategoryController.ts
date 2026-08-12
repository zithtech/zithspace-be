import { Response } from 'express';
import { AuthRequest, ApiResponse, ValidationError } from '../types';
import { DocumentCategoryService } from '../services/DocumentCategoryService';

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
      const category = await DocumentCategoryService.updateCategory(req.tenantId, id, req.body);

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
      await DocumentCategoryService.deleteCategory(req.tenantId, id);

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
