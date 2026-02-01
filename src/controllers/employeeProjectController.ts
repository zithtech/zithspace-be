import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class EmployeeProjectMappingController {
  /* ================= CREATE EMPLOYEE PROJECT MAPPING ================= */
  static async createMapping(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        } as ApiResponse);
        return;
      }

      const { employeeId, projectName, reportingManager } = req.body;

      if (!employeeId || !projectName || !reportingManager) {
        res.status(400).json({
          success: false,
          error: "Missing required fields",
        } as ApiResponse);
        return;
      }

      // check employee exists
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
      });

      if (!employee) {
        res.status(404).json({
          success: false,
          error: "Employee not found",
        } as ApiResponse);
        return;
      }

      // check reporting manager exists
      const manager = await prisma.employee.findUnique({
        where: { id: reportingManager },
      });

      if (!manager) {
        res.status(404).json({
          success: false,
          error: "Reporting manager not found",
        } as ApiResponse);
        return;
      }

      const mapping = await prisma.employeeProjectMapping.create({
        data: {
          employeeId,
          projectName,
          reportingManager,
          createdById: req.user.id,
        },
      });

      res.status(201).json({
        success: true,
        data: mapping,
        message: "Employee project mapping created successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error creating employee project mapping:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create employee project mapping",
      } as ApiResponse);
    }
  }

  /* ================= GET PROJECTS BY EMPLOYEE ================= */
  static async getByEmployee(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { employeeId } = req.params;

      const mappings = await prisma.employeeProjectMapping.findMany({
        where: { employeeId },
      });

      if (!mappings.length) {
        res.status(404).json({
          success: false,
          error: "No project mappings found for this employee",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: mappings,
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching project mappings:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch project mappings",
      } as ApiResponse);
    }
  }

  /* ================= GET PROJECT MAPPING BY ID ================= */
  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const mapping = await prisma.employeeProjectMapping.findUnique({
        where: { id },
      });

      if (!mapping) {
        res.status(404).json({
          success: false,
          error: "Employee project mapping not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: mapping,
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching project mapping:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch project mapping",
      } as ApiResponse);
    }
  }

  /* ================= UPDATE EMPLOYEE PROJECT MAPPING ================= */
  static async updateMapping(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const existing = await prisma.employeeProjectMapping.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Employee project mapping not found",
        } as ApiResponse);
        return;
      }

      const updated = await prisma.employeeProjectMapping.update({
        where: { id },
        data: {
          projectName: req.body.projectName,
          reportingManager: req.body.reportingManager,
          updatedById: req.user.id,
        },
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: "Employee project mapping updated successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error updating project mapping:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update employee project mapping",
      } as ApiResponse);
    }
  }

  /* ================= DELETE EMPLOYEE PROJECT MAPPING ================= */
  static async deleteMapping(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const existing = await prisma.employeeProjectMapping.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Employee project mapping not found",
        } as ApiResponse);
        return;
      }

      await prisma.employeeProjectMapping.delete({
        where: { id },
      });

      res.status(200).json({
        success: true,
        message: "Employee project mapping deleted successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error deleting project mapping:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete employee project mapping",
      } as ApiResponse);
    }
  }
}
