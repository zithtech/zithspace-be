import { Response } from "express";
import { withTenant } from "@/db/onboardingPool";
import { AuthRequest, ApiResponse } from "@/types";

/**
 * Map a raw `employee_work_details` row (snake_case columns) onto the
 * camelCase shape Prisma previously returned, so response payloads are
 * byte-for-byte compatible with the old implementation.
 */
function mapWorkDetail(row: any) {
  if (!row) return row;
  return {
    id: row.id,
    employeeId: row.employee_id,
    department: row.department,
    team: row.team,
    employeeType: row.employee_type,
    workLocation: row.work_location,
    workShift: row.work_shift,
    createdById: row.created_by_id,
    updatedById: row.updated_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workType: row.work_type,
    hybridMode: row.hybrid_mode,
    fixedDays: row.fixed_days,
    totalDays: row.total_days,
    totalHours: row.total_hours,
    workJoiningDate: row.work_joining_date,
    positionId: row.position_id,
    notice_period: row.notice_period,
  };
}

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
        positionId,
        department,
        team,
        employeeType,
        workLocation,
        workShift,

      } = req.body;

      if (
        !employeeId ||
        !positionId ||
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

      await withTenant(req.tenantId as string, async (db) => {
        // check employee exists
        const employeeRes = await db.query(
          `SELECT * FROM employees WHERE id = $1 LIMIT 1`,
          [employeeId],
        );
        const employee = employeeRes.rows[0];

        if (!employee) {
          res.status(404).json({
            success: false,
            error: "Employee not found",
          } as ApiResponse);
          return;
        }

        const workDetailRes = await db.query(
          `INSERT INTO employee_work_details
             (employee_id, department, team, employee_type, work_location,
              work_shift, position_id, created_by_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            employeeId,
            department,
            team,
            employeeType,
            workLocation,
            workShift,
            positionId,
            req.user!.id,
          ],
        );
        const workDetail = mapWorkDetail(workDetailRes.rows[0]);

        res.status(201).json({
          success: true,
          data: workDetail,
          message: "Employee work detail created successfully",
        } as ApiResponse);
      });
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
      const { employeeId: inputId } = req.params;
      const tenantId = req.headers["x-tenant-id"] as string;

      if (!tenantId) {
        res.status(400).json({ success: false, error: "Tenant ID is required" });
        return;
      }

      console.log(`[Autofill] Processing request for ID: ${inputId}`);

      await withTenant(req.tenantId as string, async (db) => {
        // 1. Try to find the User first (as the frontend often sends User.id)
        const userRes = await db.query(
          `SELECT id, name, employee_id, reports_to_id, position_id
             FROM users
            WHERE id = $1
            LIMIT 1`,
          [inputId],
        );
        const user = userRes.rows[0] || null;

        // Resolve the user's position (+ department) when present.
        let position: any = null;
        if (user?.position_id) {
          const posRes = await db.query(
            `SELECT p.*, d.id AS d_id, d.name AS d_name, d.code AS d_code,
                    d.tenant_id AS d_tenant_id, d.employment_type AS d_employment_type,
                    d.description AS d_description, d.head_id AS d_head_id,
                    d.is_active AS d_is_active, d.created_by_id AS d_created_by_id,
                    d.updated_by_id AS d_updated_by_id, d.created_at AS d_created_at,
                    d.updated_at AS d_updated_at
               FROM positions p
               LEFT JOIN departments d ON d.id = p.department_id
              WHERE p.id = $1
              LIMIT 1`,
            [user.position_id],
          );
          const pr = posRes.rows[0];
          if (pr) {
            position = {
              id: pr.id,
              tenantId: pr.tenant_id,
              code: pr.code,
              title: pr.title,
              departmentId: pr.department_id,
              subDepartmentId: pr.sub_department_id,
              gradeId: pr.grade_id,
              description: pr.description,
              isActive: pr.is_active,
              createdById: pr.created_by_id,
              updatedById: pr.updated_by_id,
              createdAt: pr.created_at,
              updatedAt: pr.updated_at,
              department: pr.d_id
                ? {
                    id: pr.d_id,
                    tenantId: pr.d_tenant_id,
                    code: pr.d_code,
                    name: pr.d_name,
                    employmentType: pr.d_employment_type,
                    description: pr.d_description,
                    headId: pr.d_head_id,
                    isActive: pr.d_is_active,
                    createdById: pr.d_created_by_id,
                    updatedById: pr.d_updated_by_id,
                    createdAt: pr.d_created_at,
                    updatedAt: pr.d_updated_at,
                  }
                : null,
            };
          }
        }

        let employeeId = inputId;
        let reportingManagerId = user?.reports_to_id || null;
        let reportingManagerName: string | null = null;

        // Resolve reportsTo name (mirror Prisma `reportsTo: { name }`).
        if (user?.reports_to_id) {
          const reportsToRes = await db.query(
            `SELECT name FROM users WHERE id = $1 LIMIT 1`,
            [user.reports_to_id],
          );
          reportingManagerName = reportsToRes.rows[0]?.name || null;
        }

        if (user) {
          console.log(`[Autofill] Found user: ${user.name}, linked employeeId: ${user.employee_id}`);
          if (user.employee_id) {
            employeeId = user.employee_id;
          }
        }

        // 2. Get work details from EmployeeWorkDetail table
        const workDetailRes = await db.query(
          `SELECT * FROM employee_work_details WHERE employee_id = $1 LIMIT 1`,
          [employeeId],
        );
        const workDetailRow = workDetailRes.rows[0] || null;

        // If user didn't have a position, take it from workDetails
        if (!position && workDetailRow?.position_id) {
          const wdPosRes = await db.query(
            `SELECT p.*, d.id AS d_id, d.name AS d_name, d.code AS d_code,
                    d.tenant_id AS d_tenant_id, d.employment_type AS d_employment_type,
                    d.description AS d_description, d.head_id AS d_head_id,
                    d.is_active AS d_is_active, d.created_by_id AS d_created_by_id,
                    d.updated_by_id AS d_updated_by_id, d.created_at AS d_created_at,
                    d.updated_at AS d_updated_at
               FROM positions p
               LEFT JOIN departments d ON d.id = p.department_id
              WHERE p.id = $1
              LIMIT 1`,
            [workDetailRow.position_id],
          );
          const pr = wdPosRes.rows[0];
          if (pr) {
            position = {
              id: pr.id,
              tenantId: pr.tenant_id,
              code: pr.code,
              title: pr.title,
              departmentId: pr.department_id,
              subDepartmentId: pr.sub_department_id,
              gradeId: pr.grade_id,
              description: pr.description,
              isActive: pr.is_active,
              createdById: pr.created_by_id,
              updatedById: pr.updated_by_id,
              createdAt: pr.created_at,
              updatedAt: pr.updated_at,
              department: pr.d_id
                ? {
                    id: pr.d_id,
                    tenantId: pr.d_tenant_id,
                    code: pr.d_code,
                    name: pr.d_name,
                    employmentType: pr.d_employment_type,
                    description: pr.d_description,
                    headId: pr.d_head_id,
                    isActive: pr.d_is_active,
                    createdById: pr.d_created_by_id,
                    updatedById: pr.d_updated_by_id,
                    createdAt: pr.d_created_at,
                    updatedAt: pr.d_updated_at,
                  }
                : null,
            };
          }
        }

        // 3. Get reporting manager from employee_project_mappings as a fallback
        if (!reportingManagerName) {
          const projectMappingRes = await db.query(
            `SELECT * FROM employee_project_mappings
              WHERE employee_id = $1
              ORDER BY created_at DESC
              LIMIT 1`,
            [employeeId],
          );
          const projectMapping = projectMappingRes.rows[0];

          if (projectMapping?.reporting_manager) {
            reportingManagerId = projectMapping.reporting_manager;
            // Try to find the manager's name (check User first, then Employee)
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectMapping.reporting_manager);

            if (isUuid) {
              // Check User table first
              const userManagerRes = await db.query(
                `SELECT name FROM users WHERE id = $1 LIMIT 1`,
                [projectMapping.reporting_manager],
              );
              const userManager = userManagerRes.rows[0];

              if (userManager) {
                reportingManagerName = userManager.name;
              } else {
                // Fallback to Employee table
                const empManagerRes = await db.query(
                  `SELECT first_name, last_name FROM employees WHERE id = $1 LIMIT 1`,
                  [projectMapping.reporting_manager],
                );
                const empManager = empManagerRes.rows[0];
                if (empManager) {
                  reportingManagerName = `${empManager.first_name} ${empManager.last_name}`;
                }
              }
            } else {
              reportingManagerName = projectMapping.reporting_manager;
            }
          }
        }

        // 4. Get Notice Period from ExitNoticePolicy
        const noticePolicyRes = await db.query(
          `SELECT * FROM exit_notice_policies
            WHERE tenant_id = $1
              AND (
                (level_type = 'Positions' AND level_id = $2)
                OR (level_type = 'Grades' AND level_id = $3)
              )
            LIMIT 1`,
          [tenantId, position?.id || "", position?.gradeId || ""],
        );
        const noticePolicy = noticePolicyRes.rows[0];

        const workDetail = workDetailRow ? mapWorkDetail(workDetailRow) : null;

        // Construct the unified response
        res.status(200).json({
          success: true,
          data: {
            ...(workDetail || {}),
            employeeId: employeeId,
            positionId: position?.id || null,
            position: position,
            department: position?.department || null,
            departmentId: position?.department?.id || null,
            reportingManagerId: reportingManagerId,
            reportingManagerName: reportingManagerName,
            noticePeriodDays: noticePolicy?.notice_period_days || 0
          },
        } as ApiResponse);
      });
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

      await withTenant(req.tenantId as string, async (db) => {
        const workDetailRes = await db.query(
          `SELECT * FROM employee_work_details WHERE id = $1 LIMIT 1`,
          [id],
        );
        const workDetail = mapWorkDetail(workDetailRes.rows[0]);

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
      });
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

      await withTenant(req.tenantId as string, async (db) => {
        const existingRes = await db.query(
          `SELECT * FROM employee_work_details WHERE id = $1 LIMIT 1`,
          [id],
        );
        const existing = existingRes.rows[0];

        if (!existing) {
          res.status(404).json({
            success: false,
            error: "Work detail not found",
          } as ApiResponse);
          return;
        }

        const updatedRes = await db.query(
          `UPDATE employee_work_details
              SET position_id = $1,
                  team = $2,
                  employee_type = $3,
                  work_location = $4,
                  work_shift = $5,
                  updated_by_id = $6,
                  updated_at = now()
            WHERE id = $7
          RETURNING *`,
          [
            req.body.positionId,
            req.body.team,
            req.body.employeeType,
            req.body.workLocation,
            req.body.workShift,
            req.user!.id,
            id,
          ],
        );
        const updated = mapWorkDetail(updatedRes.rows[0]);

        res.status(200).json({
          success: true,
          data: updated,
          message: "Employee work detail updated successfully",
        } as ApiResponse);
      });
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

      await withTenant(req.tenantId as string, async (db) => {
        const existingRes = await db.query(
          `SELECT id FROM employee_work_details WHERE id = $1 LIMIT 1`,
          [id],
        );
        const existing = existingRes.rows[0];

        if (!existing) {
          res.status(404).json({
            success: false,
            error: "Work detail not found",
          } as ApiResponse);
          return;
        }

        await db.query(
          `DELETE FROM employee_work_details WHERE id = $1`,
          [id],
        );

        res.status(200).json({
          success: true,
          message: "Employee work detail deleted successfully",
        } as ApiResponse);
      });
    } catch (error) {
      console.error("Error deleting work detail:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete employee work detail",
      } as ApiResponse);
    }
  }
}
