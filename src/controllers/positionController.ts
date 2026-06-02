import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from "../utils/transactionHistory";

export class PositionController {
  // Create a new Position
  static async createPosition(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }

      const {
        code,
        title,
        departmentId,
        subDepartmentId,
        gradeId,
        description,
        isActive,
      } = req.body;
      const createdById = req.user.id;

      // Basic validation
      if (!code || !title || !departmentId || !gradeId) {
        res.status(400).json({ success: false, error: "Code, Title, Department, and Grade are required." } as ApiResponse);
        return;
      }

      const position = await prisma.position.create({
        data: {
          tenantId: req.tenantId,
          code,
          title,
          departmentId,
          subDepartmentId,
          gradeId,
          description,
          isActive: isActive !== undefined ? isActive : true,
          createdById,
          updatedById: createdById,
        },
      });

      res.status(201).json({ success: true, data: position, message: "Position created successfully" } as ApiResponse);

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.ORG_STRUCTURE,
        page: Page.ORG_STRUCTURE_POSITIONS,
        action: Action.CREATE,
        actionLabel: `Created position "${position.title}"`,
        entityType: EntityType.ORG_POSITION,
        entityId: position.id,
        entityLabel: position.title,
        afterData: {
          title: position.title,
          code: position.code,
          departmentId: position.departmentId,
          subDepartmentId: position.subDepartmentId,
          gradeId: position.gradeId,
          description: position.description,
          isActive: position.isActive,
        },
      });
    } catch (error: any) {
      console.error("Error creating position:", error);
      // Handle unique constraint violation (P2002)
      if (error.code === 'P2002') {
        res.status(409).json({ success: false, error: "Position code already exists" } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to create position" } as ApiResponse);
    }
  }

  // Get all Positions
  static async getPositions(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }

      const positions = await prisma.position.findMany({
        where: { tenantId: req.tenantId },
        include: {
          department: { select: { id: true, name: true } },
          subDepartment: { select: { id: true, name: true } },
          grade: { select: { id: true, name: true } },
          createdBy: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json({ success: true, data: positions } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching positions:", error);
      res.status(500).json({ success: false, error: "Failed to fetch positions" } as ApiResponse);
    }
  }

  // Get Position by ID
  static async getPositionById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const position = await prisma.position.findFirst({
        where: { id, tenantId: req.tenantId },
        include: {
          department: true,
          subDepartment: true,
          grade: true,
        },
      });

      if (!position) {
        res.status(404).json({ success: false, error: "Position not found" } as ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: position } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching position:", error);
      res.status(500).json({ success: false, error: "Failed to fetch position" } as ApiResponse);
    }
  }

  // Update Position
  static async updatePosition(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const updatedById = req.user.id;
      const {
        code,
        title,
        departmentId,
        subDepartmentId,
        gradeId,
        description,
        isActive,
      } = req.body;

      const existing = await prisma.position.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Position not found" } as ApiResponse);
        return;
      }

      const updatedPosition = await prisma.position.update({
        where: { id },
        data: {
          code,
          title,
          departmentId,
          subDepartmentId,
          gradeId,
          description,
          isActive,
          updatedById,
        },
      });

      res.status(200).json({ success: true, data: updatedPosition, message: "Position updated successfully" } as ApiResponse);

      // ─── Activity log ───────────────────────────────────────────────
      if (existing) {
        const beforeSnap = {
          title: existing.title,
          code: existing.code,
          departmentId: existing.departmentId,
          subDepartmentId: existing.subDepartmentId,
          gradeId: existing.gradeId,
          description: existing.description,
          isActive: existing.isActive,
        };
        const afterSnap = {
          title: updatedPosition.title,
          code: updatedPosition.code,
          departmentId: updatedPosition.departmentId,
          subDepartmentId: updatedPosition.subDepartmentId,
          gradeId: updatedPosition.gradeId,
          description: updatedPosition.description,
          isActive: updatedPosition.isActive,
        };
        const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);

        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.ORG_STRUCTURE,
          page: Page.ORG_STRUCTURE_POSITIONS,
          action: Action.UPDATE,
          actionLabel: `Updated position "${updatedPosition.title}"`,
          entityType: EntityType.ORG_POSITION,
          entityId: id,
          entityLabel: updatedPosition.title,
          beforeData: before,
          afterData: after,
          changedFields,
        });
      }
    } catch (error: any) {
      console.error("Error updating position:", error);
      if (error.code === 'P2002') {
        res.status(409).json({ success: false, error: "Position code already exists" } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to update position" } as ApiResponse);
    }
  }

  // Delete Position
  static async deletePosition(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const existing = await prisma.position.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Position not found" } as ApiResponse);
        return;
      }

      await prisma.position.delete({
        where: { id },
      });

      res.status(200).json({ success: true, message: "Position deleted successfully" } as ApiResponse);

      // ─── Activity log ───────────────────────────────────────────────
      if (existing) {
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.ORG_STRUCTURE,
          page: Page.ORG_STRUCTURE_POSITIONS,
          action: Action.DELETE,
          actionLabel: `Deleted position "${existing.title}"`,
          entityType: EntityType.ORG_POSITION,
          entityId: id,
          entityLabel: existing.title,
        });
      }
    } catch (error: any) {
      console.error("Error deleting position:", error);
      res.status(500).json({ success: false, error: "Failed to delete position" } as ApiResponse);
    }
  }
}
