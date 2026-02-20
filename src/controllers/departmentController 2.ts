import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class DepartmentController {
  // Create a new Department
  static async createDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }

      const { name, code, employmentType, description, headId, isActive } = req.body;
      const createdById = req.user.id;

      if (!name || !code) {
        res.status(400).json({ success: false, error: "Name and code are required." } as ApiResponse);
        return;
      }

      // Check for duplicate code
      const existingCode = await prisma.department.findUnique({
        where: {
          tenantId_code: {
            tenantId: req.tenantId,
            code,
          },
        },
      });

      if (existingCode) {
        res.status(409).json({ success: false, error: "A department with this code already exists." } as ApiResponse);
        return;
      }

      // Check for duplicate name
      const existingName = await prisma.department.findUnique({
        where: {
          tenantId_name: {
            tenantId: req.tenantId,
            name,
          },
        },
      });

      if (existingName) {
        res.status(409).json({ success: false, error: "A department with this name already exists." } as ApiResponse);
        return;
      }

      const newDepartment = await prisma.department.create({
        data: {
          tenantId: req.tenantId,
          name,
          code,
          employmentType,
          description,
          headId,
          isActive,
          createdById,
        },
      });

      res.status(201).json({ success: true, data: newDepartment, message: "Department created successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error creating department:", error);
      res.status(500).json({ success: false, error: "Failed to create department" } as ApiResponse);
    }
  }

  // Get all Departments for the tenant
  static async getAllDepartments(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }

      const departments = await prisma.department.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { name: "asc" },
        include: {
          head: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } },
        },
      });

      res.status(200).json({ success: true, data: departments } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ success: false, error: "Failed to fetch departments" } as ApiResponse);
    }
  }

  // Get a single Department by ID
  static async getDepartmentById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const department = await prisma.department.findFirst({
        where: { id, tenantId: req.tenantId },
        include: {
          head: { select: { id: true, name: true } },
        },
      });

      if (!department) {
        res.status(404).json({ success: false, error: "Department not found" } as ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: department } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching department:", error);
      res.status(500).json({ success: false, error: "Failed to fetch department" } as ApiResponse);
    }
  }

  // Update a Department
  static async updateDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const updatedById = req.user.id;
      const { name, code, employmentType, description, headId, isActive } = req.body;

      const existing = await prisma.department.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Department not found" } as ApiResponse);
        return;
      }

      // Check for duplicate code if changed
      if (code && code !== existing.code) {
        const duplicateCode = await prisma.department.findUnique({
          where: { tenantId_code: { tenantId: req.tenantId, code } },
        });
        if (duplicateCode) {
          res.status(409).json({ success: false, error: "A department with this code already exists." } as ApiResponse);
          return;
        }
      }

      // Check for duplicate name if changed
      if (name && name !== existing.name) {
        const duplicateName = await prisma.department.findUnique({
          where: { tenantId_name: { tenantId: req.tenantId, name } },
        });
        if (duplicateName) {
          res.status(409).json({ success: false, error: "A department with this name already exists." } as ApiResponse);
          return;
        }
      }

      const updatedDepartment = await prisma.department.update({
        where: { id },
        data: {
          name,
          code,
          employmentType,
          description,
          headId,
          isActive,
          updatedById,
        },
      });

      res.status(200).json({ success: true, data: updatedDepartment, message: "Department updated successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error updating department:", error);
      res.status(500).json({ success: false, error: "Failed to update department" } as ApiResponse);
    }
  }

  // Delete a Department
  static async deleteDepartment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const existing = await prisma.department.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Department not found" } as ApiResponse);
        return;
      }

      await prisma.department.delete({ where: { id } });

      res.status(200).json({ success: true, message: "Department deleted successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error deleting department:", error);
      if (error.code === 'P2003') {
        res.status(400).json({ success: false, error: "Cannot delete department because it is in use." } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to delete department" } as ApiResponse);
    }
  }
}
