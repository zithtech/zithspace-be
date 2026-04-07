import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";
import dayjs from "dayjs";

export class MilestoneController {
  /**
   * Get all milestones for a tenant/project
   */
  static async getMilestones(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }

      const { projectId, page = 1, limit = 10 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {
        tenantId: req.tenantId,
      };

      if (projectId) {
        where.projectId = projectId;
      }

      const [milestones, total] = await Promise.all([
        prisma.milestone.findMany({
          where,
          include: {
            project: {
              select: { id: true, name: true, code: true },
            },
            sprints: {
              select: { id: true, version: true },
            },
            createdBy: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: Number(limit),
        }),
        prisma.milestone.count({ where }),
      ]);

      const totalPages = Math.ceil(total / Number(limit));

      res.status(200).json({
        success: true,
        data: milestones,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: totalPages,
        },
      } as ApiResponse);
    } catch (error) {
      console.error("Get milestones error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch milestones",
      } as ApiResponse);
    }
  }

  /**
   * Create a new milestone (Decoupled from sprint)
   */
  static async createMilestone(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Authentication and tenant context required",
        } as ApiResponse);
        return;
      }

      const {
        title,
        points,
        projectId,
        description,
        startDate,
        endDate,
        sprintIds,
      } = req.body;

      if (!title || !projectId || !startDate || !endDate) {
        throw new ValidationError("Missing required fields");
      }

      const milestone = await prisma.milestone.create({
        data: {
          tenantId: req.tenantId,
          projectId,
          title,
          points: points || [],
          description,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          createdById: req.user.id,
          sprints: sprintIds?.length ? {
            connect: sprintIds.map((id: string) => ({ id }))
          } : undefined
        },
        include: {
          project: {
            select: { id: true, name: true },
          },
          sprints: {
            select: { id: true, version: true }
          }
        },
      });

      res.status(201).json({
        success: true,
        data: milestone,
        message: "Milestone created successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Create milestone error:", error);
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to create milestone",
      } as ApiResponse);
    }
  }

  /**
   * Assign milestone to multiple sprints
   */
  static async updateSprints(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Authentication and tenant context required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { sprintIds } = req.body;

      if (!Array.isArray(sprintIds)) {
        throw new ValidationError("sprintIds must be an array");
      }

      const updatedMilestone = await prisma.milestone.update({
        where: { id, tenantId: req.tenantId },
        data: {
          sprints: {
            set: sprintIds.map(sid => ({ id: sid }))
          }
        },
        include: {
          sprints: {
            select: { id: true, version: true }
          }
        }
      });

      res.status(200).json({
        success: true,
        data: updatedMilestone,
        message: "Milestone sprints updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update milestone sprints error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update milestone sprints",
      } as ApiResponse);
    }
  }

  /**
   * Update milestone
   */
  static async updateMilestone(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { tenantId } = req;

      const existing = await prisma.milestone.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        throw new NotFoundError("Milestone not found");
      }

      const milestone = await prisma.milestone.update({
        where: { id },
        data: {
          ...req.body,
          startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
          endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        },
      });

      res.status(200).json({
        success: true,
        data: milestone,
        message: "Milestone updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update milestone error:", error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to update milestone",
      } as ApiResponse);
    }
  }

  /**
   * Delete milestone
   */
  static async deleteMilestone(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { tenantId } = req;

      const existing = await prisma.milestone.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        throw new NotFoundError("Milestone not found");
      }

      await prisma.milestone.delete({
        where: { id },
      });

      res.status(200).json({
        success: true,
        message: "Milestone deleted successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Delete milestone error:", error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to delete milestone",
      } as ApiResponse);
    }
  }
}
