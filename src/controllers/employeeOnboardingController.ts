import { Response } from "express";
import { AuthRequest, ApiResponse } from "@/types";
import { withTenant } from "@/db/onboardingPool";

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
import {
  createEmployeeDocumentsBulk,
  getEmployeeDocuments,
} from "./employeeDocumentController";
import { recordTransaction, Section, Module, Page, Action, EntityType } from "@/utils/transactionHistory";

const empName = (r: any) => [r?.first_name, r?.last_name].filter(Boolean).join(" ").trim();
const empLabel = (r: any) =>
  `${r?.employee_code ?? ""}${r?.employee_code && empName(r) ? " · " : ""}${empName(r)}`.trim() || "Employee";

export class EmployeeOnboardingController {
  // ✅ CREATE Employee (Full Onboarding)
  static async create(req: AuthRequest, res: Response) {
    try {
      const { personal, employment, bank, history, assets, documents } = req.body;

      if (!req.tenantId) throw new Error("Unauthorized");

      const result = await withTenant(req.tenantId, async (client) => {
        let employee: any = null;

        // 1️⃣ Personal Details (Mandatory)
        if (personal) {
          employee = await createPersonalDetails(
            {
              ...req,
              body: { personal },
            } as AuthRequest,
            undefined,
            client,
          );
        } else {
          throw new Error("Personal details are required to create employee");
        }

        // 2️⃣ Employment Details (Optional)
        if (employment) {
          await createEmploymentDetails(
            { ...req, body: { employment } } as AuthRequest,
            employee.id,
            client,
          );
        }

        // 3️⃣ Bank & Payroll (Optional)
        if (bank) {
          await createBankPayrollDetails(
            { ...req, body: { bank } } as AuthRequest,
            employee.id,
            client,
          );
        }

        // 4️⃣ Employee History (Optional)
        if (history?.length) {
          await createEmployeeHistory(
            { ...req, body: { history } } as AuthRequest,
            employee.id,
            client,
          );
        }

        // 5️⃣ Assets (Optional)
        if (assets?.length) {
          await createEmployeeAssets(
            { ...req, body: { assets } } as AuthRequest,
            employee.id,
            client,
          );
        }

        // 6️⃣ Documents (Optional)
        if (documents?.length) {
          await createEmployeeDocumentsBulk(
            { ...req, body: { documents } } as AuthRequest,
            employee.id,
            client,
          );
        }

        return employee;
      });

      const sections = ["personal", employment && "employment", bank && "bank", history?.length && "history", assets?.length && "assets", documents?.length && "documents"].filter(Boolean);
      recordTransaction({
        req,
        section: Section.HR,
        module: Module.ONBOARDING,
        page: Page.ONBOARDING_EMPLOYEES,
        action: Action.CREATE,
        actionLabel: `Created employee ${empLabel(result)} (sections: ${sections.join(", ")})`,
        entityType: EntityType.EMPLOYEE,
        entityId: result?.id,
        entityLabel: empLabel(result),
        afterData: {
          employeeCode: result?.employee_code,
          firstName: result?.first_name,
          lastName: result?.last_name,
          workEmail: result?.work_email,
          sections,
        },
      });

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
      const { search, limit, offset, status } = req.query;
      
      const opts: any = {};
      if (typeof search === 'string' && search.trim() !== '') opts.search = search;
      if (typeof limit === 'string') opts.limit = parseInt(limit, 10);
      if (typeof offset === 'string') opts.offset = parseInt(offset, 10);
      if (typeof status === 'string') opts.status = status;

      const payload = await getAllEmployees(req, opts);
      res.status(200).json({
        success: true,
        data: payload.data,
        total: payload.total,
        stats: payload.stats,
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
      const [personal, employment, bank, history, assets, documents] = await Promise.all([
        getPersonalDetails(req, employeeId).catch(() => null),
        getEmploymentDetails(req, employeeId).catch(() => null),
        getBankPayrollDetails(req, employeeId).catch(() => null),
        getEmployeeHistory(req, employeeId).catch(() => []),
        getEmployeeAssets(req, employeeId).catch(() => []),
        getEmployeeDocuments(req, employeeId).catch(() => []),
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
          documents,
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

      if (!employeeId || employeeId === "undefined" || employeeId === "null") {
        return res.status(400).json({
          success: false,
          error: "Invalid or missing Employee ID",
        });
      }

      const { personal, employment, bank, history, assets, documents } = req.body;

      if (!req.tenantId) throw new Error("Unauthorized");

      const result = await withTenant(req.tenantId, async (client) => {
        let employee: any = null;

        // 1️⃣ Update Personal Details
        if (personal) {
          employee = await updatePersonalDetails(
            { ...req, body: { personal } } as AuthRequest,
            employeeId,
            client,
          );
        }

        // 2️⃣ Update Employment Details
        if (employment) {
          await updateEmploymentDetails(
            { ...req, body: { employment } } as AuthRequest,
            employeeId,
            client,
          );
        }

        // 3️⃣ Update Bank & Payroll
        if (bank) {
          await updateBankPayrollDetails(
            { ...req, body: { bank } } as AuthRequest,
            employeeId,
            client,
          );
        }

        // 4️⃣ Update History (Delete All & Re-create)
        if (history) {
          await deleteAllEmployeeHistory(req, employeeId, client);
          if (history.length > 0) {
            await createEmployeeHistory(
              { ...req, body: { history } } as AuthRequest,
              employeeId,
              client,
            );
          }
        }

        // 5️⃣ Update Assets (Delete All & Re-create)
        if (assets) {
          await deleteAllEmployeeAssets(req, employeeId, client);
          if (assets.length > 0) {
            await createEmployeeAssets(
              { ...req, body: { assets } } as AuthRequest,
              employeeId,
              client,
            );
          }
        }

        // 6️⃣ Documents (Append Only)
        if (documents && documents.length > 0) {
          await createEmployeeDocumentsBulk(
            { ...req, body: { documents } } as AuthRequest,
            employeeId,
            client,
          );
        }

        return employee;
      });

      const sections = [personal && "personal", employment && "employment", bank && "bank", history && "history", assets && "assets", documents && "documents"].filter(Boolean);
      recordTransaction({
        req,
        section: Section.HR,
        module: Module.ONBOARDING,
        page: Page.ONBOARDING_EMPLOYEES,
        action: Action.UPDATE,
        actionLabel: `Updated employee onboarding${result ? ` ${empLabel(result)}` : ""} (sections: ${sections.join(", ")})`,
        entityType: EntityType.EMPLOYEE,
        entityId: employeeId,
        entityLabel: result ? empLabel(result) : `Employee ${employeeId}`,
        afterData: { updatedSections: sections },
        metadata: { sections },
      });

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

      const emp = (result as any)?.employee;
      recordTransaction({
        req,
        section: Section.HR,
        module: Module.ONBOARDING,
        page: Page.ONBOARDING_EMPLOYEES,
        action: Action.DELETE,
        actionLabel: `Deleted employee ${empLabel(emp)}`,
        entityType: EntityType.EMPLOYEE,
        entityId: employeeId,
        entityLabel: empLabel(emp),
        beforeData: { status: true },
        afterData: { status: false },
        changedFields: ["status"],
      });

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

  // ✅ PROMOTE Employee
  static async promote(req: AuthRequest, res: Response) {
    try {
      const { employeeId } = req.params;
      const { positionId, subDepartmentId, promotionDate } = req.body;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      if (!positionId || !promotionDate) {
        return res.status(400).json({ success: false, message: "Position and Promotion Date are required." });
      }

      await withTenant(tenantId, async (db) => {
        // 1. Get Employee
        const empRes = await db.query(
          `SELECT id, first_name, last_name, employee_code FROM employees WHERE id = $1 AND tenant_id = $2`,
          [employeeId, tenantId]
        );
        if (empRes.rowCount === 0) throw new Error("Employee not found");
        const emp = empRes.rows[0];

        // 2. Get New Position Title
        const posRes = await db.query(`SELECT title FROM positions WHERE id = $1`, [positionId]);
        const newRoleName = posRes.rows[0]?.title || "Unknown Role";

        // 3. Update Current Role History (set end_date)
        await db.query(
          `UPDATE employee_role_history 
           SET end_date = $1 
           WHERE employee_id = $2 AND end_date IS NULL`,
          [promotionDate, employeeId]
        );

        // 4. Insert New Role History
        await db.query(
          `INSERT INTO employee_role_history (tenant_id, employee_id, role_name, start_date) 
           VALUES ($1, $2, $3, $4)`,
          [tenantId, employeeId, newRoleName, promotionDate]
        );

        // 5. Update Employment Details (Position & Sub Department)
        await db.query(
          `UPDATE employee_work_details 
           SET position_id = $1, updated_by_id = $2, updated_at = now() 
           WHERE employee_id = $3`,
          [positionId, userId, employeeId]
        );

        // Record Activity
        recordTransaction({
          req,
          module: Module.ONBOARDING,
          page: Page.ONBOARDING_EMPLOYEES,
          section: Section.HR,
          action: Action.UPDATE,
          actionLabel: `Promoted employee ${empLabel(emp)} to ${newRoleName}`,
          entityType: EntityType.EMPLOYEE,
          entityId: employeeId,
          entityLabel: empLabel(emp),
        });
      });

      res.status(200).json({ success: true, message: "Employee promoted successfully!" });
    } catch (err: any) {
      console.error("Promote Employee Error:", err);
      res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
    }
  }
}
