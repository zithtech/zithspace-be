import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class EmployeeWorkDetailController {
  /* ================= CREATE WORK DETAIL ================= */
  static async createWorkDetail(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        res
          .status(401)
          .json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const {
        employeeId,
        department,
        team,
        employeeType,
        workLocation,
        workShift,
        positionId
      } = req.body;

      if (
        !employeeId ||
        !department ||
        !team ||
        !employeeType ||
        !workLocation ||
        !workShift
      ) {
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

      const workDetail = await prisma.employeeWorkDetail.create({
        data: {
          employee: { connect: { id: employeeId } },
          department,
          team,
          employeeType,
          workLocation,
          workShift,
          createdById: req.user.id,
          position: { connect: { id: positionId }
    }
        },
      });

      res.status(201).json({
        success: true,
        data: workDetail,
        message: "Employee work detail created successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error creating work detail:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create employee work detail",
      } as ApiResponse);
    }
  }

  /* ================= GET WORK DETAIL BY EMPLOYEE ================= */
  static async getWorkDetailByEmployee(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { employeeId } = req.params;

      const workDetail = await prisma.employeeWorkDetail.findFirst({
        where: { employeeId },
      });

      if (!workDetail) {
        res.status(404).json({
          success: false,
          error: "Work detail not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: workDetail,
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching work detail:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch employee work detail",
      } as ApiResponse);
    }
  }

  /* ================= GET WORK DETAIL BY ID ================= */
  static async getWorkDetailById(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { id } = req.params;

      const workDetail = await prisma.employeeWorkDetail.findUnique({
        where: { id },
      });

      if (!workDetail) {
        res.status(404).json({
          success: false,
          error: "Work detail not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: workDetail,
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching work detail:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch employee work detail",
      } as ApiResponse);
    }
  }

  /* ================= UPDATE WORK DETAIL ================= */
  static async updateWorkDetail(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        res
          .status(401)
          .json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const existing = await prisma.employeeWorkDetail.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Work detail not found",
        } as ApiResponse);
        return;
      }

      const updated = await prisma.employeeWorkDetail.update({
        where: { id },
        data: {
          department: req.body.department,
          team: req.body.team,
          employeeType: req.body.employeeType,
          workLocation: req.body.workLocation,
          workShift: req.body.workShift,
          updatedById: req.user.id,
        },
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: "Employee work detail updated successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error updating work detail:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update employee work detail",
      } as ApiResponse);
    }
  }

  /* ================= DELETE WORK DETAIL ================= */
  static async deleteWorkDetail(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { id } = req.params;

      const existing = await prisma.employeeWorkDetail.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Work detail not found",
        } as ApiResponse);
        return;
      }

      await prisma.employeeWorkDetail.delete({
        where: { id },
      });

      res.status(200).json({
        success: true,
        message: "Employee work detail deleted successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error deleting work detail:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete employee work detail",
      } as ApiResponse);
    }
  }
}
