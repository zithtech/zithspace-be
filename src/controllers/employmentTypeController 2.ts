import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class EmploymentTypeController {
  // Create a new employment type
  static async createEmploymentType(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }

      const { name, code, description, isActive } = req.body;
      const createdById = req.user.id;

      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ success: false, error: "A valid name is required." } as ApiResponse);
        return;
      }

      if (!code || typeof code !== 'string' || code.trim() === '') {
        res.status(400).json({ success: false, error: "A valid code is required." } as ApiResponse);
        return;
      }

      // Check if name already exists for this tenant
      const existing = await prisma.employmentType.findUnique({
        where: {
          tenantId_name: {
            tenantId: req.tenantId,
            name: name.trim()
          }
        }
      });

      if (existing) {
        res.status(409).json({ success: false, error: "Employment type with this name already exists for this tenant." } as ApiResponse);
        return;
      }

      // Check if code already exists for this tenant
      const existingCode = await prisma.employmentType.findUnique({
        where: {
          tenantId_code: {
            tenantId: req.tenantId,
            code: code.trim()
          }
        }
      });

      if (existingCode) {
        res.status(409).json({ success: false, error: "Employment type with this code already exists for this tenant." } as ApiResponse);
        return;
      }

      const employmentType = await prisma.employmentType.create({
        data: {
          tenantId: req.tenantId,
          code: code.trim(),
          name: name.trim(),
          description,
          isActive: isActive !== undefined ? isActive : true,
          createdById: createdById,
          updatedById: createdById,
        },
      });

      res.status(201).json({ success: true, data: employmentType, message: "Employment type created successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error creating employment type:", error);
      if (error.code === 'P2002') {
        res.status(409).json({ success: false, error: "An employment type with this name already exists." } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: "Failed to create employment type" } as ApiResponse);
    }
  }

  // Get all employment types for the tenant
  static async getAllEmploymentTypes(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }

      const employmentTypes = await prisma.employmentType.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { createdAt: 'desc' },
        include: {
            createdBy: { select: { name: true, id: true } },
            updatedBy: { select: { name: true, id: true } }
        }
      });

      res.status(200).json({ success: true, data: employmentTypes } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching employment types:", error);
      res.status(500).json({ success: false, error: "Failed to fetch employment types" } as ApiResponse);
    }
  }

  // Get a single employment type by ID
  static async getEmploymentTypeById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;
 
      const employmentType = await prisma.employmentType.findFirst({
        where: { id, tenantId: req.tenantId },
        include: {
          createdBy: { select: { name: true, id: true } },
          updatedBy: { select: { name: true, id: true } },
        },
      });

      if (!employmentType) {
        res.status(404).json({ success: false, error: "Employment type not found" } as ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: employmentType } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching employment type:", error);
      res.status(500).json({ success: false, error: "Failed to fetch employment type" } as ApiResponse);
    }
  }

  // Update an employment type
  static async updateEmploymentType(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Tenant context and user are missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const updatedById = req.user.id;
      const { name, code, description, isActive } = req.body;

      const employmentTypeToUpdate = await prisma.employmentType.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!employmentTypeToUpdate) {
        res.status(404).json({ success: false, error: "Employment type not found" } as ApiResponse);
        return;
      }

      if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
        res.status(400).json({ success: false, error: "If provided, name must be a valid string." } as ApiResponse);
        return;
      }

      if (code !== undefined && (typeof code !== 'string' || code.trim() === '')) {
        res.status(400).json({ success: false, error: "If provided, code must be a valid string." } as ApiResponse);
        return;
      }

      // Check for duplicate name if name is being updated
      if (name && name.trim() !== employmentTypeToUpdate.name) {
         const duplicate = await prisma.employmentType.findUnique({
            where: {
                tenantId_name: {
                    tenantId: req.tenantId,
                    name: name.trim()
                }
            }
         });
         if (duplicate) {
             res.status(409).json({ success: false, error: "Employment type with this name already exists for this tenant." } as ApiResponse);
             return;
         }
      }

      // Check for duplicate code if code is being updated
      if (code && code.trim() !== employmentTypeToUpdate.code) {
         const duplicateCode = await prisma.employmentType.findUnique({
            where: {
                tenantId_code: {
                    tenantId: req.tenantId,
                    code: code.trim()
                }
            }
         });
         if (duplicateCode) {
             res.status(409).json({ success: false, error: "Employment type with this code already exists for this tenant." } as ApiResponse);
             return;
         }
      }

      const updatedEmploymentType = await prisma.employmentType.update({
        where: { id },
        data: {
          code: code ? code.trim() : undefined,
          name: name ? name.trim() : undefined,
          description,
          isActive: isActive !== undefined ? isActive : undefined,
          updatedById: updatedById,
        },
      });

      res.status(200).json({ success: true, data: updatedEmploymentType, message: "Employment type updated successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error updating employment type:", error);
      res.status(500).json({ success: false, error: "Failed to update employment type" } as ApiResponse);
    }
  }

  // Delete an employment type
  static async deleteEmploymentType(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context missing" } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const employmentTypeToDelete = await prisma.employmentType.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!employmentTypeToDelete) {
        res.status(404).json({ success: false, error: "Employment type not found" } as ApiResponse);
        return;
      }

      await prisma.employmentType.delete({
        where: { id },
      });

      res.status(200).json({ success: true, message: "Employment type deleted successfully" } as ApiResponse);
    } catch (error: any) {
      console.error("Error deleting employment type:", error);
      // Handle foreign key constraint errors (P2003)
      if (error.code === 'P2003') {
          res.status(400).json({ success: false, error: "Cannot delete employment type because it is in use." } as ApiResponse);
          return;
      }
      res.status(500).json({ success: false, error: "Failed to delete employment type" } as ApiResponse);
    }
  }
}