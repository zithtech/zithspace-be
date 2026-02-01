import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class EmployeeController {
  /* ================= CREATE EMPLOYEE ================= */
  static async createEmployee(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context missing",
        } as ApiResponse);
        return;
      }

      if (!req.user?.id) {
        res
          .status(401)
          .json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const {
        employee_code,
        first_name,
        last_name,
        gender,
        date_of_birth,
        blood_group,
        mobile,
        work_email,
        personal_email,
        status,
      } = req.body;

      if (
        !employee_code ||
        !first_name ||
        !last_name ||
        !gender ||
        !date_of_birth ||
        !mobile ||
        !work_email
      ) {
        res.status(400).json({
          success: false,
          error: "Missing required fields",
        } as ApiResponse);
        return;
      }

      const employee = await prisma.employee.create({
        data: {
          tenantId: req.tenantId,
          employee_code,
          first_name,
          last_name,
          gender,
          date_of_birth: new Date(date_of_birth),
          blood_group,
          mobile,
          work_email,
          personal_email,
          status: status ?? true,
          created_by: req.user.id,
        },
      });

      res.status(201).json({
        success: true,
        data: employee,
        message: "Employee created successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error creating employee:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create employee",
      } as ApiResponse);
    }
  }

  /* ================= GET ALL EMPLOYEES ================= */
  static async getEmployees(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context missing",
        } as ApiResponse);
        return;
      }

      const employees = await prisma.employee.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { created_at: "desc" },
      });

      res.status(200).json({ success: true, data: employees } as ApiResponse);
    } catch (error) {
      console.error("Error fetching employees:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch employees",
      } as ApiResponse);
    }
  }

  /* ================= GET EMPLOYEE BY ID ================= */
  static async getEmployeeById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context missing",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const employee = await prisma.employee.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
      });

      if (!employee) {
        res
          .status(404)
          .json({ success: false, error: "Employee not found" } as ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: employee } as ApiResponse);
    } catch (error) {
      console.error("Error fetching employee:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch employee",
      } as ApiResponse);
    }
  }

  /* ================= UPDATE EMPLOYEE ================= */
  static async updateEmployee(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context missing",
        } as ApiResponse);
        return;
      }

      if (!req.user?.id) {
        res
          .status(401)
          .json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const existing = await prisma.employee.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res
          .status(404)
          .json({ success: false, error: "Employee not found" } as ApiResponse);
        return;
      }

      const updatedEmployee = await prisma.employee.update({
        where: { id },
        data: {
          ...req.body,
          date_of_birth: req.body.date_of_birth
            ? new Date(req.body.date_of_birth)
            : undefined,
          updated_by: req.user.id,
        },
      });

      res.status(200).json({
        success: true,
        data: updatedEmployee,
        message: "Employee updated successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error updating employee:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update employee",
      } as ApiResponse);
    }
  }

  /* ================= DELETE EMPLOYEE ================= */
  static async deleteEmployee(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context missing",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const existing = await prisma.employee.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res
          .status(404)
          .json({ success: false, error: "Employee not found" } as ApiResponse);
        return;
      }

      await prisma.employee.delete({ where: { id } });

      res.status(200).json({
        success: true,
        message: "Employee deleted successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error deleting employee:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete employee",
      } as ApiResponse);
    }
  }
}
