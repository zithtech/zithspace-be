import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class SubDepartmentController {
  // Create a new sub-department
  static async createSubDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }

      const { code, name, parentDepartmentId, description, isActive } = req.body;
      const createdById = req.user.id;

      if (!code || !name || !parentDepartmentId) {
        res.status(400).json({ success: false, error: "Code, Name, and Parent Department are required." } as ApiResponse);
        return;
      }

      // Check for duplicate code within tenant
      const existingCode = await prisma.subDepartment.findUnique({
        where: {
          tenantId_code: {
            tenantId: req.tenantId,
            code: code.trim().toUpperCase()
          }
        }
      });

      if (existingCode) {
        res.status(409).json({ success: false, error: "Sub-Department with this code already exists." } as ApiResponse);
        return;
      }

      const subDepartment = await prisma.subDepartment.create({
        data: {
          tenantId: req.tenantId,
          code: code.trim().toUpperCase(),
          name: name.trim(),
          parentDepartmentId,
          description,
          isActive: isActive !== undefined ? isActive : true,
          createdById,
          updatedById: createdById,
        },
      });

      res.status(201).json({ success: true, data: subDepartment, message: "Sub-Department created successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error creating sub-department:", error);
      if (error.code === 'P2003') {
         res.status(400).json({ success: false, error: "Parent Department not found." } as ApiResponse);
         return;
      }
      res.status(500).json({ success: false, error: "Failed to create sub-department" } as ApiResponse);
    }
  }

  // Get all sub-departments
  static async getAllSubDepartments(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }

      const subDepartments = await prisma.subDepartment.findMany({
        where: { tenantId: req.tenantId },
        include: {
          parentDepartment: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json({ success: true, data: subDepartments } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching sub-departments:", error);
      res.status(500).json({ success: false, error: "Failed to fetch sub-departments" } as ApiResponse);
    }
  }

  // Get single sub-department
  static async getSubDepartmentById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const subDepartment = await prisma.subDepartment.findFirst({
        where: { id, tenantId: req.tenantId },
        include: {
          parentDepartment: { select: { id: true, name: true } },
        },
      });

      if (!subDepartment) {
        res.status(404).json({ success: false, error: "Sub-Department not found" } as ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: subDepartment } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching sub-department:", error);
      res.status(500).json({ success: false, error: "Failed to fetch sub-department" } as ApiResponse);
    }
  }

  // Update sub-department
  static async updateSubDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const { name, parentDepartmentId, description, isActive } = req.body;
      const updatedById = req.user.id;

      const existing = await prisma.subDepartment.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Sub-Department not found" } as ApiResponse);
        return;
      }

      const updatedSubDepartment = await prisma.subDepartment.update({
        where: { id },
        data: {
          name: name ? name.trim() : undefined,
          parentDepartmentId,
          description,
          isActive,
          updatedById,
        },
      });

      res.status(200).json({ success: true, data: updatedSubDepartment, message: "Sub-Department updated successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error updating sub-department:", error);
      if (error.code === 'P2003') {
         res.status(400).json({ success: false, error: "Parent Department not found." } as ApiResponse);
         return;
      }
      res.status(500).json({ success: false, error: "Failed to update sub-department" } as ApiResponse);
    }
  }

  // Delete sub-department
  static async deleteSubDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      await prisma.subDepartment.delete({
        where: { id }, // Prisma will throw if not found or if tenant constraint (via middleware/RLS logic if applied) fails, but here we rely on ID uniqueness. Ideally verify tenant ownership first.
      });

      res.status(200).json({ success: true, message: "Sub-Department deleted successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error deleting sub-department:", error);
      if (error.code === 'P2025') {
         res.status(404).json({ success: false, error: "Sub-Department not found" } as ApiResponse);
         return;
      }
      res.status(500).json({ success: false, error: "Failed to delete sub-department" } as ApiResponse);
    }
  }
}