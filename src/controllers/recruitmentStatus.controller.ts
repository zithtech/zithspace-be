import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class RecruitmentStatusController {
  // Create a new Recruitment Status
  static async createStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }

      const { name, category, color, appliesTo, isDefault, isFinalStage, isActive } = req.body;
      const createdById = req.user.id;

      if (!name || !category || !color) {
        res.status(400).json({ success: false, error: "Name, category, and color are required." } as ApiResponse);
        return;
      }

      const newStatus = await prisma.recruitmentStatus.create({
        data: {
          tenantId: req.tenantId,
          name,
          category,
          color,
          appliesTo: appliesTo || [],
          isDefault: isDefault ?? false,
          isFinalStage: isFinalStage ?? false,
          isActive: isActive ?? true,
          createdById,
        },
      });

      res.status(201).json({ success: true, data: newStatus, message: "Status created successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error creating recruitment status:", error);
      if (error.code === 'P2002') {
        res.status(409).json({ success: false, error: "A status with this name already exists." } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to create status" } as ApiResponse);
    }
  }

  // Get all Recruitment Statuses for the tenant
  static async getAllStatuses(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }

      const statuses = await prisma.recruitmentStatus.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { createdAt: "asc" },
        include: {
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } }
        }
      });

      res.status(200).json({ success: true, data: statuses } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching recruitment statuses:", error);
      res.status(500).json({ success: false, error: "Failed to fetch statuses" } as ApiResponse);
    }
  }

  // Update a Recruitment Status
  static async updateStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const updatedById = req.user.id;
      const { name, category, color, appliesTo, isDefault, isFinalStage, isActive } = req.body;

      const existing = await prisma.recruitmentStatus.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Status not found" } as ApiResponse);
        return;
      }

      const updatedStatus = await prisma.recruitmentStatus.update({
        where: { id },
        data: { name, category, color, appliesTo, isDefault, isFinalStage, isActive, updatedById },
      });

      res.status(200).json({ success: true, data: updatedStatus, message: "Status updated successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error updating recruitment status:", error);
      if (error.code === 'P2002') {
        res.status(409).json({ success: false, error: "A status with this name already exists." } as ApiResponse);
        return;
      }
      if (error.code === 'P2025') {
        res.status(404).json({ success: false, error: "Status not found" } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to update status" } as ApiResponse);
    }
  }

  // Delete a Recruitment Status
  static async deleteStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const existing = await prisma.recruitmentStatus.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Status not found" } as ApiResponse);
        return;
      }

      await prisma.recruitmentStatus.delete({ where: { id } });
      res.status(200).json({ success: true, message: "Status deleted successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error deleting recruitment status:", error);
      res.status(500).json({ success: false, error: "Failed to delete status" } as ApiResponse);
    }
  }
}