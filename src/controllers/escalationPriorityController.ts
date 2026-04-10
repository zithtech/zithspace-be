import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class EscalationPriorityController {
  // Create a new Escalation Priority
  static async createPriority(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context is missing" } as ApiResponse);
        return;
      }

      const { name, weight, color, isActive } = req.body;

      if (!name) {
        res.status(400).json({ success: false, error: "Name is required." } as ApiResponse);
        return;
      }

      const newPriority = await prisma.escalationPriority.create({
        data: {
          tenantId: req.tenantId,
          name,
          weight: weight !== undefined ? weight : 0,
          color,
          isActive: isActive !== undefined ? isActive : true,
        },
      });

      res.status(201).json({ success: true, data: newPriority, message: "Priority created successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error creating escalation priority:", error);
      if (error.code === 'P2002') {
        res.status(409).json({ success: false, error: "A priority with this name already exists." } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to create priority" } as ApiResponse);
    }
  }

  // Get all Priorities for the tenant
  static async getAllPriorities(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }

      const priorities = await prisma.escalationPriority.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { weight: "desc" },
      });

      res.status(200).json({ success: true, data: priorities } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching escalation priorities:", error);
      res.status(500).json({ success: false, error: "Failed to fetch priorities" } as ApiResponse);
    }
  }

  // Update a Priority
  static async updatePriority(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context is missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const { name, weight, color, isActive } = req.body;

      const existing = await prisma.escalationPriority.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Priority not found" } as ApiResponse);
        return;
      }

      const updatedPriority = await prisma.escalationPriority.update({
        where: { id },
        data: { name, weight, color, isActive },
      });

      res.status(200).json({ success: true, data: updatedPriority, message: "Priority updated successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error updating escalation priority:", error);
      res.status(500).json({ success: false, error: "Failed to update priority" } as ApiResponse);
    }
  }

  // Delete a Priority
  static async deletePriority(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const existing = await prisma.escalationPriority.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Priority not found" } as ApiResponse);
        return;
      }

      await prisma.escalationPriority.delete({ where: { id } });

      res.status(200).json({ success: true, message: "Priority deleted successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error deleting escalation priority:", error);
      res.status(500).json({ success: false, error: "Failed to delete priority" } as ApiResponse);
    }
  }
}
