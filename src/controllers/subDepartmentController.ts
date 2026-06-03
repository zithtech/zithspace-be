import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from "../utils/transactionHistory";

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

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.ORG_STRUCTURE,
        page: Page.ORG_STRUCTURE_SUB_DEPARTMENTS,
        action: Action.CREATE,
        actionLabel: `Created sub-department "${subDepartment.name}"`,
        entityType: EntityType.ORG_SUB_DEPARTMENT,
        entityId: subDepartment.id,
        entityLabel: subDepartment.name,
        afterData: {
          name: subDepartment.name,
          code: subDepartment.code,
          parentDepartmentId: subDepartment.parentDepartmentId,
          description: subDepartment.description,
          isActive: subDepartment.isActive,
        },
      });
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

      // ─── Activity log ───────────────────────────────────────────────
      if (existing) {
        const beforeSnap = {
          name: existing.name,
          parentDepartmentId: existing.parentDepartmentId,
          description: existing.description,
          isActive: existing.isActive,
        };
        const afterSnap = {
          name: updatedSubDepartment.name,
          parentDepartmentId: updatedSubDepartment.parentDepartmentId,
          description: updatedSubDepartment.description,
          isActive: updatedSubDepartment.isActive,
        };
        const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);

        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.ORG_STRUCTURE,
          page: Page.ORG_STRUCTURE_SUB_DEPARTMENTS,
          action: Action.UPDATE,
          actionLabel: `Updated sub-department "${updatedSubDepartment.name}"`,
          entityType: EntityType.ORG_SUB_DEPARTMENT,
          entityId: id,
          entityLabel: updatedSubDepartment.name,
          beforeData: before,
          afterData: after,
          changedFields,
        });
      }
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

      const existing = await prisma.subDepartment.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Sub-Department not found" } as ApiResponse);
        return;
      }

      await prisma.subDepartment.delete({
        where: { id },
      });

      res.status(200).json({ success: true, message: "Sub-Department deleted successfully" } as ApiResponse);

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.ORG_STRUCTURE,
        page: Page.ORG_STRUCTURE_SUB_DEPARTMENTS,
        action: Action.DELETE,
        actionLabel: `Deleted sub-department "${existing.name}"`,
        entityType: EntityType.ORG_SUB_DEPARTMENT,
        entityId: id,
        entityLabel: existing.name,
      });
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