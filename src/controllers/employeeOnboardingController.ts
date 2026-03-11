import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

import {
  createPersonalDetails,
  getPersonalDetails,
  getAllEmployees,
  getUpcomingBirthdays,
  updatePersonalDetails,
  deletePersonalDetails,
} from "./createEmployeeDetailes";
import {
  createEmploymentDetails,
  getEmploymentDetails,
  updateEmploymentDetails,
} from "./employeeEmployementDetailes";
import {
  createBankPayrollDetails,
  getBankPayrollDetails,
  updateBankPayrollDetails,
} from "./bankAndPayrolllController";
import {
  createEmployeeHistory,
  getEmployeeHistory,
  deleteAllEmployeeHistory,
} from "./employeeHistoryController";
import {
  createEmployeeAssets,
  getEmployeeAssets,
  deleteAllEmployeeAssets,
} from "./employeeAssets";

export class EmployeeOnboardingController {
  // ✅ CREATE Employee (Full Onboarding)
  static async create(req: AuthRequest, res: Response) {
    try {
      const { personal, employment, bank, history, assets } = req.body;

      const result = await prisma.$transaction(
        async (tx) => {
          let employee: any = null;

          // 1️⃣ Personal Details (Mandatory)
          if (personal) {
            employee = await createPersonalDetails(
              {
                ...req,
                body: { personal },
              } as AuthRequest,
              undefined,
              tx,
            );
          } else {
            throw new Error("Personal details are required to create employee");
          }

          // 2️⃣ Employment Details (Optional)
          if (employment) {
            await createEmploymentDetails(
              { ...req, body: { employment } } as AuthRequest,
              employee.id,
              tx,
            );
          }

          // 3️⃣ Bank & Payroll (Optional)
          if (bank) {
            await createBankPayrollDetails(
              { ...req, body: { bank } } as AuthRequest,
              employee.id,
              tx,
            );
          }

          // 4️⃣ Employee History (Optional)
          if (history?.length) {
            await createEmployeeHistory(
              { ...req, body: { history } } as AuthRequest,
              employee.id,
              tx,
            );
          }

          // 5️⃣ Assets (Optional)
          if (assets?.length) {
            await createEmployeeAssets(
              { ...req, body: { assets } } as AuthRequest,
              employee.id,
              tx,
            );
          }

          return employee;
        },
        { timeout: 30000 },
      );

      res.status(201).json({
        success: true,
        data: result,
        message: "Employee data saved successfully",
      });
    } catch (err: any) {
      console.error("Onboarding Error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Internal Server Error",
      });
    }
  }

  // ✅ GET All Employees (List View)
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const employees = await getAllEmployees(req);
      res.status(200).json({
        success: true,
        data: employees,
      });
    } catch (err: any) {
      console.error("Get All Employees Error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Internal Server Error",
      });
    }
  }

  // ✅ GET Upcoming Birthdays (Current Month)
  static async getUpcomingBirthdays(req: AuthRequest, res: Response) {
    try {
      const birthdays = await getUpcomingBirthdays(req);
      res.status(200).json({
        success: true,
        data: birthdays,
      });
    } catch (err: any) {
      console.error("Get Upcoming Birthdays Error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Internal Server Error",
      });
    }
  }

  // ✅ GET Employee By ID (Full Details)
  static async getById(req: AuthRequest, res: Response) {
    try {
      const { employeeId } = req.params;

      // Fetch all details in parallel
      const [personal, employment, bank, history, assets] = await Promise.all([
        getPersonalDetails(req, employeeId).catch(() => null),
        getEmploymentDetails(req, employeeId).catch(() => null),
        getBankPayrollDetails(req, employeeId).catch(() => null),
        getEmployeeHistory(req, employeeId).catch(() => []),
        getEmployeeAssets(req, employeeId).catch(() => []),
      ]);

      if (!personal) {
        return res.status(404).json({
          success: false,
          error: "Employee not found",
        });
      }

      res.status(200).json({
        success: true,
        data: {
          personal,
          employment,
          bank,
          history,
          assets,
        },
      });
    } catch (err: any) {
      console.error("Get Employee By ID Error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Internal Server Error",
      });
    }
  }

  // ✅ UPDATE Employee (Full Update)
  static async update(req: AuthRequest, res: Response) {
    try {
      const { employeeId } = req.params;
      const { personal, employment, bank, history, assets } = req.body;

      const result = await prisma.$transaction(
        async (tx) => {
          let employee: any = null;

          // 1️⃣ Update Personal Details
          if (personal) {
            employee = await updatePersonalDetails(
              { ...req, body: { personal } } as AuthRequest,
              employeeId,
              tx,
            );
          }

          // 2️⃣ Update Employment Details
          if (employment) {
            await updateEmploymentDetails(
              { ...req, body: { employment } } as AuthRequest,
              employeeId,
              tx,
            );
          }

          // 3️⃣ Update Bank & Payroll
          if (bank) {
            await updateBankPayrollDetails(
              { ...req, body: { bank } } as AuthRequest,
              employeeId,
              tx,
            );
          }

          // 4️⃣ Update History (Delete All & Re-create)
          if (history) {
            await deleteAllEmployeeHistory(req, employeeId, tx);
            if (history.length > 0) {
              await createEmployeeHistory(
                { ...req, body: { history } } as AuthRequest,
                employeeId,
                tx,
              );
            }
          }

          // 5️⃣ Update Assets (Delete All & Re-create)
          if (assets) {
            await deleteAllEmployeeAssets(req, employeeId, tx);
            if (assets.length > 0) {
              await createEmployeeAssets(
                { ...req, body: { assets } } as AuthRequest,
                employeeId,
                tx,
              );
            }
          }

          return employee;
        },
        { timeout: 30000 },
      );

      res.status(200).json({
        success: true,
        data: result || { id: employeeId },
        message: "Employee updated successfully",
      });
    } catch (err: any) {
      console.error("Update Employee Error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Internal Server Error",
      });
    }
  }

  // ✅ DELETE Employee (Soft Delete)
  static async delete(req: AuthRequest, res: Response) {
    try {
      const { employeeId } = req.params;
      const result = await deletePersonalDetails(req, employeeId);

      res.status(200).json({
        success: true,
        message: "Employee deleted successfully",
        data: result,
      });
    } catch (err: any) {
      console.error("Delete Employee Error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Internal Server Error",
      });
    }
  }
}
