import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class EscalationStatusController {
  // Create a new Escalation Status
  static async createStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context is missing" } as ApiResponse);
        return;
      }

      const { name, color, isActive, isDefault, isFinal } = req.body;

      if (!name) {
        res.status(400).json({ success: false, error: "Name is required." } as ApiResponse);
        return;
      }

      // If this status is set as default, unset other defaults for this tenant
      if (isDefault) {
        await prisma.escalationStatus.updateMany({
          where: { tenantId: req.tenantId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const newStatus = await prisma.escalationStatus.create({
        data: {
          tenantId: req.tenantId,
          name,
          color,
          isActive: isActive !== undefined ? isActive : true,
          isDefault: !!isDefault,
          isFinal: !!isFinal,
        },
      });

      res.status(201).json({ success: true, data: newStatus, message: "Status created successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error creating escalation status:", error);
      if (error.code === 'P2002') {
        res.status(409).json({ success: false, error: "A status with this name already exists." } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to create status" } as ApiResponse);
    }
  }

  // Get all Statuses for the tenant
  static async getAllStatuses(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }

      const statuses = await prisma.escalationStatus.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json({ success: true, data: statuses } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching escalation statuses:", error);
      res.status(500).json({ success: false, error: "Failed to fetch statuses" } as ApiResponse);
    }
  }

  // Update a Status
  static async updateStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context is missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const { name, color, isActive, isDefault, isFinal } = req.body;

      const existing = await prisma.escalationStatus.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Status not found" } as ApiResponse);
        return;
      }

      // If this status is being set as default, unset other defaults
      if (isDefault && !existing.isDefault) {
        await prisma.escalationStatus.updateMany({
          where: { tenantId: req.tenantId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      const updatedStatus = await prisma.escalationStatus.update({
        where: { id },
        data: { 
          name, 
          color, 
          isActive,
          isDefault: isDefault !== undefined ? !!isDefault : existing.isDefault,
          isFinal: isFinal !== undefined ? !!isFinal : existing.isFinal,
        },
      });

      res.status(200).json({ success: true, data: updatedStatus, message: "Status updated successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error updating escalation status:", error);
      res.status(500).json({ success: false, error: "Failed to update status" } as ApiResponse);
    }
  }

  // Delete a Status
  static async deleteStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const existing = await prisma.escalationStatus.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Status not found" } as ApiResponse);
        return;
      }

      await prisma.escalationStatus.delete({ where: { id } });

      res.status(200).json({ success: true, message: "Status deleted successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error deleting escalation status:", error);
      res.status(500).json({ success: false, error: "Failed to delete status" } as ApiResponse);
    }
  }
}
