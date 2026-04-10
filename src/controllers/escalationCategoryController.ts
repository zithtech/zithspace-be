import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class EscalationCategoryController {
  // Create a new Escalation Category
  static async createCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context is missing" } as ApiResponse);
        return;
      }

      const { name, description, color, isActive } = req.body;

      if (!name) {
        res.status(400).json({ success: false, error: "Name is required." } as ApiResponse);
        return;
      }

      const newCategory = await prisma.escalationCategory.create({
        data: {
          tenantId: req.tenantId,
          name,
          description,
          color,
          isActive: isActive !== undefined ? isActive : true,
        },
      });

      res.status(201).json({ success: true, data: newCategory, message: "Category created successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error creating escalation category:", error);
      if (error.code === 'P2002') {
        res.status(409).json({ success: false, error: "A category with this name already exists." } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to create category" } as ApiResponse);
    }
  }

  // Get all Categories for the tenant
  static async getAllCategories(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }

      const categories = await prisma.escalationCategory.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json({ success: true, data: categories } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching escalation categories:", error);
      res.status(500).json({ success: false, error: "Failed to fetch categories" } as ApiResponse);
    }
  }

  // Update a Category
  static async updateCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context is missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const { name, description, color, isActive } = req.body;

      const existing = await prisma.escalationCategory.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Category not found" } as ApiResponse);
        return;
      }

      const updatedCategory = await prisma.escalationCategory.update({
        where: { id },
        data: { name, description, color, isActive },
      });

      res.status(200).json({ success: true, data: updatedCategory, message: "Category updated successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error updating escalation category:", error);
      res.status(500).json({ success: false, error: "Failed to update category" } as ApiResponse);
    }
  }

  // Delete a Category
  static async deleteCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const existing = await prisma.escalationCategory.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Category not found" } as ApiResponse);
        return;
      }

      await prisma.escalationCategory.delete({ where: { id } });

      res.status(200).json({ success: true, message: "Category deleted successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error deleting escalation category:", error);
      res.status(500).json({ success: false, error: "Failed to delete category" } as ApiResponse);
    }
  }
}
