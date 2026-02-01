import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class EmployeeIdentityController {
  /* ================= CREATE EMPLOYEE IDENTITY ================= */
  static async createIdentity(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        } as ApiResponse);
        return;
      }

      const { employeeId, aadhaarNumber, panNumber, passportNumber } = req.body;

      if (!employeeId || !aadhaarNumber || !panNumber) {
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

      // optional: one identity per employee check
      const existingIdentity = await prisma.employeeIdentity.findFirst({
        where: { employeeId },
      });

      if (existingIdentity) {
        res.status(400).json({
          success: false,
          error: "Employee identity already exists",
        } as ApiResponse);
        return;
      }

      const identity = await prisma.employeeIdentity.create({
        data: {
          employeeId,
          aadhaarNumber,
          panNumber,
          passportNumber,
          createdById: req.user.id,
        },
      });

      res.status(201).json({
        success: true,
        data: identity,
        message: "Employee identity created successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error creating employee identity:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create employee identity",
      } as ApiResponse);
    }
  }

  /* ================= GET IDENTITY BY EMPLOYEE ================= */
  static async getIdentityByEmployee(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { employeeId } = req.params;

      const identity = await prisma.employeeIdentity.findFirst({
        where: { employeeId },
      });

      if (!identity) {
        res.status(404).json({
          success: false,
          error: "Employee identity not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: identity,
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching employee identity:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch employee identity",
      } as ApiResponse);
    }
  }

  /* ================= GET IDENTITY BY ID ================= */
  static async getIdentityById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const identity = await prisma.employeeIdentity.findUnique({
        where: { id },
      });

      if (!identity) {
        res.status(404).json({
          success: false,
          error: "Employee identity not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: identity,
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching employee identity:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch employee identity",
      } as ApiResponse);
    }
  }

  /* ================= UPDATE EMPLOYEE IDENTITY ================= */
  static async updateIdentity(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const existing = await prisma.employeeIdentity.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Employee identity not found",
        } as ApiResponse);
        return;
      }

      const updated = await prisma.employeeIdentity.update({
        where: { id },
        data: {
          aadhaarNumber: req.body.aadhaarNumber,
          panNumber: req.body.panNumber,
          passportNumber: req.body.passportNumber,
          updatedById: req.user.id,
        },
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: "Employee identity updated successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error updating employee identity:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update employee identity",
      } as ApiResponse);
    }
  }

  /* ================= DELETE EMPLOYEE IDENTITY ================= */
  static async deleteIdentity(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const existing = await prisma.employeeIdentity.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Employee identity not found",
        } as ApiResponse);
        return;
      }

      await prisma.employeeIdentity.delete({
        where: { id },
      });

      res.status(200).json({
        success: true,
        message: "Employee identity deleted successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error deleting employee identity:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete employee identity",
      } as ApiResponse);
    }
  }
}
