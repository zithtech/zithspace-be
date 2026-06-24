import { Response } from "express";
import { withTenant } from "@/db/onboardingPool";
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

      const timeline = await withTenant(req.tenantId as string, async (db) => {
        // 🔎 check employee exists
        const employeeRes = await db.query(
          `SELECT id FROM employees WHERE id = $1`,
          [employeeId],
        );

        if (!employeeRes.rows[0]) {
          return { error: "Employee not found" as const };
        }

        // 🔁 one timeline per employee check (optional but recommended)
        const existingRes = await db.query(
          `SELECT id FROM employee_timelines WHERE employee_id = $1 LIMIT 1`,
          [employeeId],
        );

        if (existingRes.rows[0]) {
          return { error: "Employee timeline already exists" as const };
        }

        const insertRes = await db.query(
          `INSERT INTO employee_timelines
             (employee_id, joining_date, training_completion_date, created_by_id)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [
            employeeId,
            joiningDate ? new Date(joiningDate) : null,
            trainingCompletionDate ? new Date(trainingCompletionDate) : null,
            req.user!.id,
          ],
        );

        return { row: insertRes.rows[0] };
      });

      if ("error" in timeline) {
        const status = timeline.error === "Employee not found" ? 404 : 400;
        res.status(status).json({
          success: false,
          error: timeline.error,
        } as ApiResponse);
        return;
      }

      res.status(201).json({
        success: true,
        data: timeline.row,
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

      const timeline = await withTenant(req.tenantId as string, async (db) => {
        const result = await db.query(
          `SELECT * FROM employee_timelines WHERE employee_id = $1 LIMIT 1`,
          [employeeId],
        );
        return result.rows[0];
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

      const timeline = await withTenant(req.tenantId as string, async (db) => {
        const result = await db.query(
          `SELECT * FROM employee_timelines WHERE id = $1`,
          [id],
        );
        return result.rows[0];
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

      const result = await withTenant(req.tenantId as string, async (db) => {
        const existingRes = await db.query(
          `SELECT id FROM employee_timelines WHERE id = $1`,
          [id],
        );

        if (!existingRes.rows[0]) {
          return { error: "Employee timeline not found" as const };
        }

        // Build dynamic update mirroring the previous `undefined` skip semantics.
        const sets: string[] = [];
        const params: any[] = [];
        const push = (col: string, val: any) => {
          params.push(val);
          sets.push(`${col} = $${params.length}`);
        };

        if (req.body.joiningDate) {
          push("joining_date", new Date(req.body.joiningDate));
        }
        if (req.body.trainingCompletionDate) {
          push(
            "training_completion_date",
            new Date(req.body.trainingCompletionDate),
          );
        }

        push("updated_by_id", req.user!.id);

        params.push(id);
        const updateRes = await db.query(
          `UPDATE employee_timelines
              SET ${sets.join(", ")}, updated_at = now()
            WHERE id = $${params.length}
          RETURNING *`,
          params,
        );

        return { row: updateRes.rows[0] };
      });

      if ("error" in result) {
        res.status(404).json({
          success: false,
          error: result.error,
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: result.row,
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

      const notFound = await withTenant(req.tenantId as string, async (db) => {
        const existingRes = await db.query(
          `SELECT id FROM employee_timelines WHERE id = $1`,
          [id],
        );

        if (!existingRes.rows[0]) {
          return true;
        }

        await db.query(`DELETE FROM employee_timelines WHERE id = $1`, [id]);
        return false;
      });

      if (notFound) {
        res.status(404).json({
          success: false,
          error: "Employee timeline not found",
        } as ApiResponse);
        return;
      }

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
