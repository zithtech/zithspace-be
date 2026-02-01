import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class EmployeeTimelineController {
  /* ================= CREATE EMPLOYEE TIMELINE ================= */
  static async createTimeline(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        } as ApiResponse);
        return;
      }

      const { employeeId, joiningDate, trainingCompletionDate } = req.body;

      if (!employeeId || !joiningDate || !trainingCompletionDate) {
        res.status(400).json({
          success: false,
          error: "Missing required fields",
        } as ApiResponse);
        return;
      }

      // 🔎 check employee exists
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

      // 🔁 one timeline per employee check (optional but recommended)
      const existingTimeline = await prisma.employeeTimeline.findFirst({
        where: { employeeId },
      });

      if (existingTimeline) {
        res.status(400).json({
          success: false,
          error: "Employee timeline already exists",
        } as ApiResponse);
        return;
      }

      const timeline = await prisma.employeeTimeline.create({
        data: {
          employeeId,
          joiningDate: new Date(joiningDate),
          trainingCompletionDate: new Date(trainingCompletionDate),
          createdById: req.user.id,
        },
      });

      res.status(201).json({
        success: true,
        data: timeline,
        message: "Employee timeline created successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error creating employee timeline:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create employee timeline",
      } as ApiResponse);
    }
  }

  /* ================= GET TIMELINE BY EMPLOYEE ================= */
  static async getTimelineByEmployee(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { employeeId } = req.params;

      const timeline = await prisma.employeeTimeline.findFirst({
        where: { employeeId },
      });

      if (!timeline) {
        res.status(404).json({
          success: false,
          error: "Employee timeline not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: timeline,
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching employee timeline:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch employee timeline",
      } as ApiResponse);
    }
  }

  /* ================= GET TIMELINE BY ID ================= */
  static async getTimelineById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const timeline = await prisma.employeeTimeline.findUnique({
        where: { id },
      });

      if (!timeline) {
        res.status(404).json({
          success: false,
          error: "Employee timeline not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: timeline,
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching employee timeline:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch employee timeline",
      } as ApiResponse);
    }
  }

  /* ================= UPDATE EMPLOYEE TIMELINE ================= */
  static async updateTimeline(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const existing = await prisma.employeeTimeline.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Employee timeline not found",
        } as ApiResponse);
        return;
      }

      const updated = await prisma.employeeTimeline.update({
        where: { id },
        data: {
          joiningDate: req.body.joiningDate
            ? new Date(req.body.joiningDate)
            : undefined,
          trainingCompletionDate: req.body.trainingCompletionDate
            ? new Date(req.body.trainingCompletionDate)
            : undefined,
          updatedById: req.user.id,
        },
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: "Employee timeline updated successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error updating employee timeline:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update employee timeline",
      } as ApiResponse);
    }
  }

  /* ================= DELETE EMPLOYEE TIMELINE ================= */
  static async deleteTimeline(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const existing = await prisma.employeeTimeline.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Employee timeline not found",
        } as ApiResponse);
        return;
      }

      await prisma.employeeTimeline.delete({
        where: { id },
      });

      res.status(200).json({
        success: true,
        message: "Employee timeline deleted successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error deleting employee timeline:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete employee timeline",
      } as ApiResponse);
    }
  }
}
