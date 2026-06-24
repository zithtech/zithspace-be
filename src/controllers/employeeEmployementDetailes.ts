import { AuthRequest } from "@/types";
import { withTenant, TenantClient } from "@/db/onboardingPool";

/**
 * Run `fn` against the supplied tenant-scoped client when the orchestrator is
 * driving a shared transaction, otherwise open a standalone tenant transaction.
 * Mirrors the old `tx: any = prisma` default — a no-client call used to run on
 * the default (non-transactional) Prisma client.
 */
async function withClient<T>(
  req: AuthRequest,
  client: TenantClient | undefined,
  fn: (db: TenantClient) => Promise<T>,
): Promise<T> {
  if (client) return fn(client);
  return withTenant(req.tenantId as string, fn);
}

// Coerce a possibly-falsy/invalid value into a Date or null. Mirrors the old
// `new Date(x)` behavior but avoids inserting "Invalid Date".
function toDateOrNull(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// ✅ CREATE Employment Details

export async function createEmploymentDetails(
  req: AuthRequest,
  employeeId: string,
  client?: TenantClient,
) {
  try {
    const { employment } = req.body;

    return await withClient(req, client, async (db) => {
      await db.query(
        `INSERT INTO employee_work_details
           (employee_id, position_id, team, employee_type, work_type,
            hybrid_mode, fixed_days, total_days, total_hours, notice_period,
            work_joining_date, work_location, work_shift, created_by_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          employeeId,
          employment.positionId || null,
          employment.team || null,
          employment.employeeType || null,
          employment.workType || null,
          employment.hybridMode || null,
          employment.fixedDays || [],
          employment.totalDays || null,
          employment.totalHours || null,
          employment.noticePeriod || null,
          employment.employeeJoiningDate || "",
          employment.workLocation || null,
          employment.workShift ?? null,
          req.user?.id,
        ],
      );

      await db.query(
        `INSERT INTO employee_additional_details
           (id, employee_id, employee_grade, promotion_status, created_by_id, updated_by_id, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())`,
        [
          employeeId,
          employment.employeeGrade || null,
          employment.promotionStatus || null,
          employeeId,
          employeeId,
        ],
      );

      await db.query(
        `INSERT INTO employee_timelines
           (employee_id, joining_date, training_completion_date, created_by_id, updated_by_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          employeeId,
          toDateOrNull(employment.joiningDate),
          toDateOrNull(employment.trainingCompletion),
          employeeId,
          employeeId,
        ],
      );

      const projects: string[] = employment.projects || [];
      if (projects.length > 0) {
        const valuesSql: string[] = [];
        const params: any[] = [];
        for (const project of projects) {
          const base = params.length;
          valuesSql.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`,
          );
          params.push(
            employeeId,
            project || null,
            employment.reportingManager || null,
            employeeId,
            employeeId,
          );
        }
        await db.query(
          `INSERT INTO employee_project_mappings
             (employee_id, project_name, reporting_manager, created_by_id, updated_by_id)
           VALUES ${valuesSql.join(", ")}`,
          params,
        );
      }

      return {
        success: true,
        message: "Employment details created successfully",
      };
    });
  } catch (error) {
    console.error("Error in createEmploymentDetails:", error);
    throw error;
  }
}

// ✅ GET Employment Details
export async function getEmploymentDetails(
  req: AuthRequest,
  employeeId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    return await withTenant(req.tenantId, async (db) => {
      const [workRes, additionalRes, timelineRes, projectsRes] =
        await Promise.all([
          db.query(
            `SELECT * FROM employee_work_details
              WHERE employee_id = $1
              ORDER BY created_at ASC
              LIMIT 1`,
            [employeeId],
          ),
          db.query(
            `SELECT * FROM employee_additional_details
              WHERE employee_id = $1
              ORDER BY created_at ASC
              LIMIT 1`,
            [employeeId],
          ),
          db.query(
            `SELECT * FROM employee_timelines
              WHERE employee_id = $1
              ORDER BY created_at ASC
              LIMIT 1`,
            [employeeId],
          ),
          db.query(
            `SELECT * FROM employee_project_mappings WHERE employee_id = $1`,
            [employeeId],
          ),
        ]);

      const workDetails = workRes.rows[0];
      const additionalDetails = additionalRes.rows[0];
      const timeline = timelineRes.rows[0];
      const projects = projectsRes.rows;

      if (!workDetails) {
        throw new Error("Employment details not found");
      }

      let reportingManager: string | null = null;
      const managerId = projects[0]?.reporting_manager;
      if (managerId) {
        if (
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            managerId,
          )
        ) {
          const managerRes = await db.query(
            `SELECT name FROM users WHERE id = $1`,
            [managerId],
          );
          reportingManager = managerRes.rows[0]?.name || managerId;
        } else {
          reportingManager = managerId;
        }
      }

      return {
        positionId: workDetails.position_id,
        department: workDetails.department,
        team: workDetails.team,
        employeeType: workDetails.employee_type,
        workLocation: workDetails.work_location,
        workShift: workDetails.work_shift,
        workType: workDetails.work_type || null,
        hybridMode: workDetails.hybrid_mode || null,
        fixedDays: workDetails.fixed_days || [],
        totalDays: workDetails.total_days || null,
        totalHours: workDetails.total_hours || null,
        noticePeriod: workDetails.notice_period || null,
        employeeJoiningDate: workDetails.work_joining_date || null,
        employeeGrade: additionalDetails?.employee_grade || null,
        promotionStatus: additionalDetails?.promotion_status || null,
        joiningDate: timeline?.joining_date || null,
        trainingCompletion: timeline?.training_completion_date || null,
        projects: projects.map((p: any) => p.project_name),
        reportingManager,
      };
    });
  } catch (error) {
    console.error("Error in getEmploymentDetails:", error);
    throw error;
  }
}

export async function getAllEmploymentDetails(req: AuthRequest) {
  try {
    if (!req.user?.id || !req.tenantId) {
      throw new Error("Unauthorized");
    }

    return await withTenant(req.tenantId, async (db) => {
      const employeesRes = await db.query(
        `SELECT id, employee_code, first_name, last_name
           FROM employees
          WHERE tenant_id = $1 AND status = true`,
        [req.tenantId],
      );
      const employees = employeesRes.rows;

      if (employees.length === 0) return [];

      const employeeIds = employees.map((e: any) => e.id);

      const [workRes, additionalRes, timelineRes, projectsRes] =
        await Promise.all([
          db.query(
            `SELECT * FROM employee_work_details
              WHERE employee_id = ANY($1::uuid[])
              ORDER BY created_at ASC`,
            [employeeIds],
          ),
          db.query(
            `SELECT * FROM employee_additional_details
              WHERE employee_id = ANY($1::uuid[])
              ORDER BY created_at ASC`,
            [employeeIds],
          ),
          db.query(
            `SELECT * FROM employee_timelines
              WHERE employee_id = ANY($1::uuid[])
              ORDER BY created_at ASC`,
            [employeeIds],
          ),
          db.query(
            `SELECT * FROM employee_project_mappings
              WHERE employee_id = ANY($1::uuid[])`,
            [employeeIds],
          ),
        ]);

      // First-by-created_at-ASC mirrors the previous `[0]` selection.
      const workByEmp = new Map<string, any>();
      for (const w of workRes.rows) {
        if (!workByEmp.has(w.employee_id)) workByEmp.set(w.employee_id, w);
      }
      const additionalByEmp = new Map<string, any>();
      for (const a of additionalRes.rows) {
        if (!additionalByEmp.has(a.employee_id))
          additionalByEmp.set(a.employee_id, a);
      }
      const timelineByEmp = new Map<string, any>();
      for (const t of timelineRes.rows) {
        if (!timelineByEmp.has(t.employee_id))
          timelineByEmp.set(t.employee_id, t);
      }
      const projectsByEmp = new Map<string, any[]>();
      for (const p of projectsRes.rows) {
        const list = projectsByEmp.get(p.employee_id) || [];
        list.push(p);
        projectsByEmp.set(p.employee_id, list);
      }

      return employees.map((employee: any) => {
        const latestWorkDetail = workByEmp.get(employee.id) || null;
        const latestAdditionalDetail = additionalByEmp.get(employee.id) || null;
        const latestTimeline = timelineByEmp.get(employee.id) || null;
        const projectMappings = projectsByEmp.get(employee.id) || [];

        return {
          id: employee.id,
          employeeCode: employee.employee_code,
          firstName: employee.first_name,
          lastName: employee.last_name,

          positionId: latestWorkDetail?.position_id || null,
          team: latestWorkDetail?.team || null,
          employeeType: latestWorkDetail?.employee_type || null,
          workLocation: latestWorkDetail?.work_location || null,
          workShift: latestWorkDetail?.work_shift || null,
          employeeJoiningDate: latestWorkDetail?.work_joining_date || null,
          noticePeriod: latestWorkDetail?.notice_period || null,
          workType: latestWorkDetail?.work_type || null,
          hybridMode: latestWorkDetail?.hybrid_mode || null,
          fixedDays: latestWorkDetail?.fixed_days || [],
          totalDays: latestWorkDetail?.total_days || null,
          totalHours: latestWorkDetail?.total_hours || null,

          employeeGrade: latestAdditionalDetail?.employee_grade || null,
          promotionStatus: latestAdditionalDetail?.promotion_status || null,

          joiningDate: latestTimeline?.joining_date || null,
          trainingCompletion:
            latestTimeline?.training_completion_date || null,

          projects: projectMappings.map((project: any) => project.project_name),
          reportingManager: projectMappings[0]?.reporting_manager || null,
        };
      });
    });
  } catch (error) {
    console.error("Error in getAllEmploymentDetails:", error);
    throw error;
  }
}

// ✅ UPDATE Employment Details
export async function updateEmploymentDetails(
  req: AuthRequest,
  employeeId: string,
  client?: TenantClient,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const { employment } = req.body;

    if (!employment) {
      throw new Error("Employment details are missing from the request body");
    }

    return await withClient(req, client, async (db) => {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      // ✅ Update Work Details
      const existingWorkRes = await db.query(
        `SELECT id FROM employee_work_details
          WHERE employee_id = $1
          ORDER BY created_at ASC
          LIMIT 1`,
        [employeeId],
      );
      const existingWorkDetails = existingWorkRes.rows[0];

      if (existingWorkDetails) {
        await db.query(
          `UPDATE employee_work_details
              SET position_id = $1,
                  team = $2,
                  employee_type = $3,
                  work_location = $4,
                  work_shift = $5,
                  work_type = $6,
                  hybrid_mode = $7,
                  fixed_days = $8,
                  total_days = $9,
                  total_hours = $10,
                  work_joining_date = $11,
                  notice_period = $12,
                  updated_by_id = $13,
                  updated_at = now()
            WHERE id = $14`,
          [
            employment.positionId,
            employment.team,
            employment.employeeType,
            employment.workLocation,
            employment.workShift ?? null,
            employment.workType || null,
            employment.hybridMode || null,
            employment.fixedDays || [],
            employment.totalDays || null,
            employment.totalHours || null,
            employment.employeeJoiningDate || null,
            employment.noticePeriod || null,
            userId,
            existingWorkDetails.id,
          ],
        );
      } else {
        await db.query(
          `INSERT INTO employee_work_details
             (employee_id, position_id, team, employee_type, work_location,
              work_shift, work_type, hybrid_mode, fixed_days, total_days,
              total_hours, notice_period, work_joining_date, created_by_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            employeeId,
            employment.positionId || null,
            employment.team || null,
            employment.employeeType || null,
            employment.workLocation || null,
            employment.workShift ?? null,
            employment.workType || null,
            employment.hybridMode || null,
            employment.fixedDays || [],
            employment.totalDays || null,
            employment.totalHours || null,
            employment.noticePeriod || null,
            employment.employeeJoiningDate
              ? employment.employeeJoiningDate
              : null,
            userId,
          ],
        );
      }

      // ✅ Update Additional Details
      const existingAdditionalRes = await db.query(
        `SELECT id FROM employee_additional_details
          WHERE employee_id = $1
          ORDER BY created_at ASC
          LIMIT 1`,
        [employeeId],
      );
      const existingAdditionalDetails = existingAdditionalRes.rows[0];

      if (existingAdditionalDetails) {
        await db.query(
          `UPDATE employee_additional_details
              SET employee_grade = $1,
                  promotion_status = $2,
                  updated_by_id = $3,
                  updated_at = now()
            WHERE id = $4`,
          [
            employment.employeeGrade,
            employment.promotionStatus,
            employeeId,
            existingAdditionalDetails.id,
          ],
        );
      } else {
        await db.query(
          `INSERT INTO employee_additional_details
             (employee_id, employee_grade, promotion_status, created_by_id, updated_by_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            employeeId,
            employment.employeeGrade,
            employment.promotionStatus,
            employeeId,
            employeeId,
          ],
        );
      }

      // ✅ Update Timeline
      const existingTimelineRes = await db.query(
        `SELECT id FROM employee_timelines
          WHERE employee_id = $1
          ORDER BY created_at ASC
          LIMIT 1`,
        [employeeId],
      );
      const existingTimeline = existingTimelineRes.rows[0];

      if (existingTimeline) {
        await db.query(
          `UPDATE employee_timelines
              SET joining_date = $1,
                  training_completion_date = $2,
                  updated_by_id = $3,
                  updated_at = now()
            WHERE id = $4`,
          [
            toDateOrNull(employment.joiningDate),
            toDateOrNull(employment.trainingCompletion),
            userId,
            existingTimeline.id,
          ],
        );
      } else {
        await db.query(
          `INSERT INTO employee_timelines
             (employee_id, joining_date, training_completion_date, created_by_id, updated_by_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            employeeId,
            toDateOrNull(employment.joiningDate),
            toDateOrNull(employment.trainingCompletion),
            userId,
            userId,
          ],
        );
      }

      // ✅ Update Projects (Delete old and create new)
      await db.query(
        `DELETE FROM employee_project_mappings WHERE employee_id = $1`,
        [employeeId],
      );

      if (employment.projects && employment.projects.length > 0) {
        const valuesSql: string[] = [];
        const params: any[] = [];
        for (const project of employment.projects as string[]) {
          const base = params.length;
          valuesSql.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`,
          );
          params.push(
            employeeId,
            project,
            employment.reportingManager || null,
            employeeId,
            employeeId,
          );
        }
        await db.query(
          `INSERT INTO employee_project_mappings
             (employee_id, project_name, reporting_manager, created_by_id, updated_by_id)
           VALUES ${valuesSql.join(", ")}`,
          params,
        );
      }

      return {
        success: true,
        message: "Employment details updated successfully",
      };
    });
  } catch (error) {
    console.error("Error in updateEmploymentDetails:", error);
    throw error;
  }
}

// ✅ DELETE Employment Details (Soft delete - removes employment records but keeps employee)
export async function deleteEmploymentDetails(
  req: AuthRequest,
  employeeId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    return await withTenant(req.tenantId, async (db) => {
      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, req.tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      // Delete all employment-related records
      await db.query(
        `DELETE FROM employee_work_details WHERE employee_id = $1`,
        [employeeId],
      );
      await db.query(
        `DELETE FROM employee_additional_details WHERE employee_id = $1`,
        [employeeId],
      );
      await db.query(
        `DELETE FROM employee_timelines WHERE employee_id = $1`,
        [employeeId],
      );
      await db.query(
        `DELETE FROM employee_project_mappings WHERE employee_id = $1`,
        [employeeId],
      );

      return {
        success: true,
        message: "Employment details deleted successfully",
      };
    });
  } catch (error) {
    console.error("Error in deleteEmploymentDetails:", error);
    throw error;
  }
}

// ✅ DELETE Specific Project Mapping
export async function deleteProjectMapping(
  req: AuthRequest,
  employeeId: string,
  projectName: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    return await withTenant(req.tenantId, async (db) => {
      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, req.tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      await db.query(
        `DELETE FROM employee_project_mappings
          WHERE employee_id = $1 AND project_name = $2`,
        [employeeId, projectName],
      );

      return {
        success: true,
        message: "Project mapping deleted successfully",
      };
    });
  } catch (error) {
    console.error("Error in deleteProjectMapping:", error);
    throw error;
  }
}
