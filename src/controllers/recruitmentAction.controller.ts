import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class RecruitmentActionController {
  // Create a new Recruitment Action
  static async createAction(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }

      const { name, type, icon, color, isActive } = req.body;
      const createdById = req.user.id;

      if (!name || !type || !icon || !color) {
        res.status(400).json({ success: false, error: "Name, type, icon, and color are required." } as ApiResponse);
        return;
      }

      const newAction = await prisma.recruitmentAction.create({
        data: {
          tenantId: req.tenantId,
          name,
          type,
          icon,
          color,
          isActive: isActive ?? true,
          createdById,
        },
      });

      res.status(201).json({ success: true, data: newAction, message: "Action created successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error creating recruitment action:", error);
      if (error.code === 'P2002') {
        res.status(409).json({ success: false, error: "An action with this name already exists." } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to create action" } as ApiResponse);
    }
  }

  // Get all Recruitment Actions for the tenant
  static async getAllActions(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }

      const actions = await prisma.recruitmentAction.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { createdAt: "asc" },
        include: {
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } }
        }
      });

      res.status(200).json({ success: true, data: actions } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching recruitment actions:", error);
      res.status(500).json({ success: false, error: "Failed to fetch actions" } as ApiResponse);
    }
  }

  // Update a Recruitment Action
  static async updateAction(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const updatedById = req.user.id;
      const { name, type, icon, color, isActive } = req.body;

      const existing = await prisma.recruitmentAction.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Action not found" } as ApiResponse);
        return;
      }

      const updatedAction = await prisma.recruitmentAction.update({
        where: { id },
        data: { name, type, icon, color, isActive, updatedById },
      });

      res.status(200).json({ success: true, data: updatedAction, message: "Action updated successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error updating recruitment action:", error);
      if (error.code === 'P2002') {
        res.status(409).json({ success: false, error: "An action with this name already exists." } as ApiResponse);
        return;
      }
      if (error.code === 'P2025') {
        res.status(404).json({ success: false, error: "Action not found" } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to update action" } as ApiResponse);
    }
  }

  // Delete a Recruitment Action
  static async deleteAction(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const existing = await prisma.recruitmentAction.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Action not found" } as ApiResponse);
        return;
      }

      await prisma.recruitmentAction.delete({ where: { id } });
      res.status(200).json({ success: true, message: "Action deleted successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error deleting recruitment action:", error);
      res.status(500).json({ success: false, error: "Failed to delete action" } as ApiResponse);
    }
  }
}