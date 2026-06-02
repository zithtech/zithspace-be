import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from "../utils/transactionHistory";

export class GradeController {
  // Create a new Grade
  static async createGrade(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }

      const { name, code, codes, levelOrder, description, isActive } = req.body;
      const createdById = req.user.id;

      if (!name || !code || levelOrder === undefined) {
        res.status(400).json({ success: false, error: "Name, code, and levelOrder are required." } as ApiResponse);
        return;
      }

      const newGrade = await prisma.grade.create({
        data: {
          tenantId: req.tenantId,
          name,
          code,
          codes,
          levelOrder,
          description,
          isActive,
          createdById,
        },
      });

      res.status(201).json({ success: true, data: newGrade, message: "Grade created successfully" } as ApiResponse);

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.ORG_STRUCTURE,
        page: Page.ORG_STRUCTURE_GRADES,
        action: Action.CREATE,
        actionLabel: `Created grade "${newGrade.name}"`,
        entityType: EntityType.ORG_GRADE,
        entityId: newGrade.id,
        entityLabel: newGrade.name,
        afterData: {
          name: newGrade.name,
          code: newGrade.code,
          codes: newGrade.codes,
          levelOrder: newGrade.levelOrder,
          description: newGrade.description,
          isActive: newGrade.isActive,
        },
      });
    } catch (error: any) {
      console.error("Error creating grade:", error);
      if (error.code === 'P2002') {
        res.status(409).json({ success: false, error: "A grade with this code already exists." } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to create grade" } as ApiResponse);
    }
  }

  // Get all Grades for the tenant
  static async getAllGrades(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }

      const grades = await prisma.grade.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { levelOrder: "asc" },
        include: {
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } }
        }
      });

      res.status(200).json({ success: true, data: grades } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching grades:", error);
      res.status(500).json({ success: false, error: "Failed to fetch grades" } as ApiResponse);
    }
  }

  // Get a single Grade by ID
  static async getGradeById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const grade = await prisma.grade.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!grade) {
        res.status(404).json({ success: false, error: "Grade not found" } as ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: grade } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching grade:", error);
      res.status(500).json({ success: false, error: "Failed to fetch grade" } as ApiResponse);
    }
  }

  // Update a Grade
  static async updateGrade(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const updatedById = req.user.id;
      const { name, code, codes, levelOrder, description, isActive } = req.body;

      const existing = await prisma.grade.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Grade not found" } as ApiResponse);
        return;
      }

      if (code && code !== existing.code) {
        const duplicate = await prisma.grade.findUnique({
          where: { tenantId_code: { tenantId: req.tenantId, code } }
        });
        if (duplicate) {
          res.status(409).json({ success: false, error: "A grade with this code already exists." } as ApiResponse);
          return;
        }
      }

      const updatedGrade = await prisma.grade.update({
        where: { id },
        data: { name, code, codes, levelOrder, description, isActive, updatedById },
      });

      res.status(200).json({ success: true, data: updatedGrade, message: "Grade updated successfully" } as ApiResponse);

      // ─── Activity log ───────────────────────────────────────────────
      if (existing) {
        const beforeSnap = {
          name: existing.name,
          code: existing.code,
          codes: existing.codes,
          levelOrder: existing.levelOrder,
          description: existing.description,
          isActive: existing.isActive,
        };
        const afterSnap = {
          name: updatedGrade.name,
          code: updatedGrade.code,
          codes: updatedGrade.codes,
          levelOrder: updatedGrade.levelOrder,
          description: updatedGrade.description,
          isActive: updatedGrade.isActive,
        };
        const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);

        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.ORG_STRUCTURE,
          page: Page.ORG_STRUCTURE_GRADES,
          action: Action.UPDATE,
          actionLabel: `Updated grade "${updatedGrade.name}"`,
          entityType: EntityType.ORG_GRADE,
          entityId: id,
          entityLabel: updatedGrade.name,
          beforeData: before,
          afterData: after,
          changedFields,
        });
      }
    } catch (error: any) {
      console.error("Error updating grade:", error);
      res.status(500).json({ success: false, error: "Failed to update grade" } as ApiResponse);
    }
  }

  // Delete a Grade
  static async deleteGrade(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const existing = await prisma.grade.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Grade not found" } as ApiResponse);
        return;
      }

      await prisma.grade.delete({ where: { id } });

      res.status(200).json({ success: true, message: "Grade deleted successfully" } as ApiResponse);

      // ─── Activity log ───────────────────────────────────────────────
      if (existing) {
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.ORG_STRUCTURE,
          page: Page.ORG_STRUCTURE_GRADES,
          action: Action.DELETE,
          actionLabel: `Deleted grade "${existing.name}"`,
          entityType: EntityType.ORG_GRADE,
          entityId: id,
          entityLabel: existing.name,
        });
      }
    } catch (error: any) {
      console.error("Error deleting grade:", error);
      if (error.code === 'P2003') {
        res.status(400).json({ success: false, error: "Cannot delete grade because it is in use." } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to delete grade" } as ApiResponse);
    }
  }
}