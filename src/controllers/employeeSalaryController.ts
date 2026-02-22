import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";

export class EmployeeSalaryController {
  /** =========================
   * GET ALL SALARIES
   ========================== */
  static async getSalaries(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { page = 1, limit = 10, search } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = { tenant_id: tenantId };

      if (search) {
        where.employee = {
          OR: [
            { first_name: { contains: search as string, mode: "insensitive" } },
            { last_name: { contains: search as string, mode: "insensitive" } },
            {
              employee_code: {
                contains: search as string,
                mode: "insensitive",
              },
            },
          ],
        };
      }

      const [salaries, total] = await Promise.all([
        prisma.employeeSalary.findMany({
          where,
          skip,
          take: parseInt(limit as string),
          include: {
            employee: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                employee_code: true,
              },
            },
            salary_structure: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { updated_at: "desc" },
        }),
        prisma.employeeSalary.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: salaries,
        pagination: {
          current: parseInt(page as string),
          pageSize: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    } catch (error) {
      console.error("Error fetching salaries:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }

  /** =========================
   * ADD SALARY
   ========================== */
  static async addSalary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;

      const {
        employee_id,
        salary_structure_id,
        current_annual_ctc,
        current_monthly_ctc,
        additional_pf_pct,
        is_additional_pf_active,
        nps_contribution_pct,
        insurance_topup,
        fbp_choices,
        note,
      } = req.body;

      if (
        !employee_id ||
        // !salary_structure_id ||
        !current_annual_ctc ||
        !current_monthly_ctc
      ) {
        throw new ValidationError(
          "employee_id, salary_structure_id, current_annual_ctc, and current_monthly_ctc are required",
        );
      }

      if (!tenantId) {
        throw new ValidationError("Tenant is required");
      }

      const timelineEntry = {
        action: "CREATED",
        current_annual_ctc,
        current_monthly_ctc,
        date: new Date().toISOString(),
        changed_by: userId,
        note: note || "Initial offer",
      };

      const salary = await prisma.employeeSalary.create({
        data: {
          tenant: {
            connect: { id: tenantId }, // REQUIRED
          },
          employee: {
            connect: { id: employee_id },
          },
          // salary_structure: {
          //   connect: { id: salary_structure_id },
          // },

          current_annual_ctc: current_annual_ctc,
          current_monthly_ctc: current_monthly_ctc,

          additional_pf_pct: additional_pf_pct || 0,
          is_additional_pf_active: is_additional_pf_active ?? false,

          nps_contribution_pct: nps_contribution_pct || 0,
          insurance_topup: insurance_topup || 0,

          fbp_choices: fbp_choices || {},
          salary_timeline: timelineEntry,

          is_active: true,
        },
        include: {
          employee: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              employee_code: true,
            },
          },
          salary_structure: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      res.status(201).json({
        success: true,
        data: salary,
        message: "Employee salary created successfully",
      } as ApiResponse);
    } catch (error: any) {
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      console.error("Error adding salary:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }

  /** =========================
   * UPDATE SALARY
   ========================== */
  static async updateSalary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.id;
      const { id } = req.params;

      if (!id) {
        throw new ValidationError("Salary id is required");
      }

      const existing = await prisma.employeeSalary.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundError("Employee salary");
      }

      const {
        salary_structure_id,
        current_annual_ctc,
        current_monthly_ctc,
        additional_pf_pct,
        is_additional_pf_active,
        nps_contribution_pct,
        insurance_topup,
        fbp_choices,
        is_active,
        note,
      } = req.body;

      // Build a changes object tracking what actually changed
      const changes: Record<string, { old: any; new: any }> = {};
      const updateData: any = {};

      const fieldsToCheck: { key: string; value: any }[] = [
        { key: "salary_structure_id", value: salary_structure_id },
        { key: "current_annual_ctc", value: current_annual_ctc },
        { key: "current_monthly_ctc", value: current_monthly_ctc },
        { key: "additional_pf_pct", value: additional_pf_pct },
        { key: "is_additional_pf_active", value: is_additional_pf_active },
        { key: "nps_contribution_pct", value: nps_contribution_pct },
        { key: "insurance_topup", value: insurance_topup },
        { key: "fbp_choices", value: fbp_choices },
        { key: "is_active", value: is_active },
      ];

      for (const field of fieldsToCheck) {
        if (field.value !== undefined) {
          const oldVal = (existing as any)[field.key];
          if (String(oldVal) !== String(field.value)) {
            changes[field.key] = { old: oldVal, new: field.value };
          }
          updateData[field.key] = field.value;
        }
      }

      // Append timeline entry
      const existingTimeline = (existing.salary_timeline as any[]) || [];
      const timelineEntry = {
        action: "UPDATED",
        current_annual_ctc: current_annual_ctc ?? existing.current_annual_ctc,
        current_monthly_ctc:
          current_monthly_ctc ?? existing.current_monthly_ctc,
        date: new Date().toISOString(),
        changed_by: userId,
        changes,
        note: note || "",
      };

      updateData.salary_timeline = [...existingTimeline, timelineEntry];
      updateData.updated_at = new Date();

      const updated = await prisma.employeeSalary.update({
        where: { id },
        data: updateData,
        include: {
          employee: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              employee_code: true,
            },
          },
          salary_structure: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      res.json({
        success: true,
        data: updated,
        message: "Employee salary updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        res
          .status(error.statusCode)
          .json({ success: false, error: error.message });
        return;
      }
      console.error("Error updating salary:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }

  /** =========================
   * DELETE SALARY
   ========================== */
  static async deleteSalary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      if (!id) {
        throw new ValidationError("Salary id is required");
      }

      const existing = await prisma.employeeSalary.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundError("Employee salary");
      }

      await prisma.employeeSalary.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: "Employee salary deleted successfully",
      } as ApiResponse);
    } catch (error: any) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        res
          .status(error.statusCode)
          .json({ success: false, error: error.message });
        return;
      }
      console.error("Error deleting salary:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }

  /** =========================
   * GET SALARY DASHBOARD STATS
   ========================== */
  static async getSalaryDashboard(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      const tenantId = req.tenantId;

      if (!tenantId) {
        throw new ValidationError("Tenant is required");
      }

      // Get all employee salaries for this tenant
      const allSalaries = await prisma.employeeSalary.findMany({
        where: { tenant_id: tenantId },
        select: {
          is_active: true,
          current_annual_ctc: true,
          current_monthly_ctc: true,
          is_additional_pf_active: true,
        },
      });

      const totalEmployees = allSalaries.length;
      const activeSalaries = allSalaries.filter((s) => s.is_active);
      const activeCount = activeSalaries.length;

      // Monthly payroll = sum of current_monthly_ctc for active employees
      const monthlyPayroll = activeSalaries.reduce(
        (sum, s) => sum + Number(s.current_monthly_ctc),
        0,
      );

      // Average CTC = average of current_annual_ctc for active employees
      const averageCTC =
        activeCount > 0
          ? activeSalaries.reduce(
            (sum, s) => sum + Number(s.current_annual_ctc),
            0,
          ) / activeCount
          : 0;

      // VPF active = employees with is_additional_pf_active = true among active
      const vpfActiveCount = activeSalaries.filter(
        (s) => s.is_additional_pf_active,
      ).length;

      res.json({
        success: true,
        data: {
          totalEmployees,
          activeCount,
          monthlyPayroll: Math.round(monthlyPayroll * 100) / 100,
          averageCTC: Math.round(averageCTC * 100) / 100,
          vpfActiveCount,
        },
      });
    } catch (error: any) {
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      console.error("Error fetching salary dashboard:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
}
