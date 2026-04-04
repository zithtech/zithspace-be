import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class OpeningManagementController {
  // Create a new Opening Management record
  static async createOpening(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }

      const createdById = req.user.id;
      const updatedById = req.user.id;

      const {
        jobTitle, roleType, departmentId, hiringManagerId,
        minExperience, maxExperience, primarySkills, noticePeriod,
        jobDescription, baseLocation, workArrangement, employmentType,
        totalOpenings, minSalary, maxSalary, currency,
        priorityLevel, currentStatus
      } = req.body;

      const newOpening = await prisma.openingManagement.create({
        data: {
          jobTitle, roleType, departmentId, hiringManagerId,
          minExperience, maxExperience, primarySkills, noticePeriod,
          jobDescription, baseLocation, workArrangement, employmentType,
          totalOpenings, minSalary, maxSalary, currency,
          priorityLevel, currentStatus,
          tenantId: req.tenantId,
          createdById,
          updatedById,
        },
      });

      res.status(201).json({ success: true, data: newOpening, message: "Opening created successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error creating opening:", error);
      res.status(500).json({ success: false, error: "Failed to create opening" } as ApiResponse);
    }
  }

  // Get all Openings for the tenant
  static async getOpenings(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }

      const openings = await prisma.openingManagement.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } },
        },
      });

      res.status(200).json({ success: true, data: openings } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching openings:", error);
      res.status(500).json({ success: false, error: "Failed to fetch openings" } as ApiResponse);
    }
  }

  // Get a single Opening by ID
  static async getOpeningById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const opening = await prisma.openingManagement.findFirst({
        where: { id, tenantId: req.tenantId },
        include: {
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } },
        },
      });

      if (!opening) {
        res.status(404).json({ success: false, error: "Opening not found" } as ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: opening } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching opening:", error);
      res.status(500).json({ success: false, error: "Failed to fetch opening" } as ApiResponse);
    }
  }

  // Update an Opening
  static async updateOpening(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const updatedById = req.user.id;

      const existing = await prisma.openingManagement.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Opening not found" } as ApiResponse);
        return;
      }

      const {
        jobTitle, roleType, departmentId, hiringManagerId,
        minExperience, maxExperience, primarySkills, noticePeriod,
        jobDescription, baseLocation, workArrangement, employmentType,
        totalOpenings, minSalary, maxSalary, currency,
        priorityLevel, currentStatus
      } = req.body;

      const updatedOpening = await prisma.openingManagement.update({
        where: { id },
        data: {
          jobTitle, roleType, departmentId, hiringManagerId,
          minExperience, maxExperience, primarySkills, noticePeriod,
          jobDescription, baseLocation, workArrangement, employmentType,
          totalOpenings, minSalary, maxSalary, currency,
          priorityLevel, currentStatus,
          updatedById,
        },
      });

      res.status(200).json({ success: true, data: updatedOpening, message: "Opening updated successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error updating opening:", error);
      res.status(500).json({ success: false, error: "Failed to update opening" } as ApiResponse);
    }
  }

  // Delete an Opening
  static async deleteOpening(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const existing = await prisma.openingManagement.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Opening not found" } as ApiResponse);
        return;
      }

      await prisma.openingManagement.delete({ where: { id } });

      res.status(200).json({ success: true, message: "Opening deleted successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error deleting opening:", error);
      res.status(500).json({ success: false, error: "Failed to delete opening" } as ApiResponse);
    }
  }
}
