import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class CompanyLocationController {
  // Create a new Company Location
  static async createLocation(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }

      const { flatNumber, street, area, city, state, pincode, country } = req.body;
      const createdById = req.user.id;
      const updatedById = req.user.id;

      const newLocation = await prisma.companyLocation.create({
        data: {
          tenantId: req.tenantId,
          flatNumber,
          street,
          area,
          city,
          state,
          pincode,
          country,
          createdById,
          updatedById,
        },
      });

      res.status(201).json({ success: true, data: newLocation, message: "Company location created successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error creating company location:", error);
      res.status(500).json({ success: false, error: "Failed to create company location" } as ApiResponse);
    }
  }

  // Get all Company Locations for the tenant
  static async getAllLocations(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }

      const locations = await prisma.companyLocation.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } },
        },
      });

      res.status(200).json({ success: true, data: locations } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching company locations:", error);
      res.status(500).json({ success: false, error: "Failed to fetch company locations" } as ApiResponse);
    }
  }

  // Get a single Company Location by ID
  static async getLocationById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const location = await prisma.companyLocation.findFirst({
        where: { id, tenantId: req.tenantId },
        include: {
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } },
        },
      });

      if (!location) {
        res.status(404).json({ success: false, error: "Company location not found" } as ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: location } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching company location:", error);
      res.status(500).json({ success: false, error: "Failed to fetch company location" } as ApiResponse);
    }
  }

  // Update a Company Location
  static async updateLocation(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const updatedById = req.user.id;
      const { flatNumber, street, area, city, state, pincode, country } = req.body;

      const existing = await prisma.companyLocation.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Company location not found" } as ApiResponse);
        return;
      }

      const updatedLocation = await prisma.companyLocation.update({
        where: { id },
        data: {
          flatNumber,
          street,
          area,
          city,
          state,
          pincode,
          country,
          updatedById,
        },
      });

      res.status(200).json({ success: true, data: updatedLocation, message: "Company location updated successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error updating company location:", error);
      res.status(500).json({ success: false, error: "Failed to update company location" } as ApiResponse);
    }
  }

  // Delete a Company Location
  static async deleteLocation(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const existing = await prisma.companyLocation.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Company location not found" } as ApiResponse);
        return;
      }

      await prisma.companyLocation.delete({ where: { id } });

      res.status(200).json({ success: true, message: "Company location deleted successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error deleting company location:", error);
      res.status(500).json({ success: false, error: "Failed to delete company location" } as ApiResponse);
    }
  }
}
