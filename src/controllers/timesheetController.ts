import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse, NotFoundError, ValidationError, CreateTimesheetData, UpdateTimesheetData } from "@/types";

export class TimesheetController {
  
  /**
   * Create a new timesheet
   */
  static async createTimesheet(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) throw new ValidationError("Tenant context and authentication required");

      const data: CreateTimesheetData = req.body;

      // Check if timesheet for same week exists
      const existing = await prisma.timesheet.findFirst({
        where: {
          tenantId: req.tenantId,
          userId: req.user.id,
          weekStart: new Date(data.weekStart),
        }
      });

      if (existing) throw new ValidationError("Timesheet for this week already exists");

      // Calculate total hours
      const totalHours = data.rows.reduce((sum, row) => sum + row.hours, 0);

      const timesheet = await prisma.timesheet.create({
        data: {
          tenantId: req.tenantId,
          userId: req.user.id,
          weekStart: new Date(data.weekStart),
          weekEnd: new Date(data.weekEnd),
          totalHours,
          status: "DRAFT",
          createdById: req.user.id,
          rows: {
            create: data.rows.map(row => ({
              tenantId: req.tenantId,
              day: new Date(row.day),
              projectName: row.projectName,
              taskName: row.taskName,
              description: row.description,
              hours: row.hours,
              billable: row.billable || false,
              createdById: req.user.id,
            }))
          }
        },
        include: { rows: true }
      });

      res.status(201).json({ success: true, data: timesheet } as ApiResponse);

    } catch (error: any) {
      console.error("Create timesheet error:", error);
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        error: error.message || "Failed to create timesheet"
      } as ApiResponse);
    }
  }

  /**
   * Get all timesheets for current tenant with pagination
   */
  static async getTimesheets(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) throw new ValidationError("Tenant context and authentication required");

      const { page = 1, limit = 20, status, userId } = req.query;

      const where: any = { tenantId: req.tenantId };
      if (status) where.status = status;
      if (userId) where.userId = userId;

      const skip = (Number(page) - 1) * Number(limit);

      const [timesheets, total] = await Promise.all([
        prisma.timesheet.findMany({
          where,
          include: { rows: true, user: { select: { id: true, name: true } }, approvedBy: { select: { id: true, name: true } } },
          orderBy: { weekStart: "desc" },
          skip,
          take: Number(limit)
        }),
        prisma.timesheet.count({ where })
      ]);

      const totalPages = Math.ceil(total / Number(limit));

      res.status(200).json({
        success: true,
        data: timesheets,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: totalPages,
          hasNext: Number(page) < totalPages,
          hasPrev: Number(page) > 1
        }
      } as ApiResponse);

    } catch (error: any) {
      console.error("Get timesheets error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch timesheets" } as ApiResponse);
    }
  }

  /**
   * Get timesheet by ID
   */
  static async getTimesheetById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) throw new ValidationError("Tenant context and authentication required");

      const { id } = req.params;

      const timesheet = await prisma.timesheet.findFirst({
        where: { id, tenantId: req.tenantId },
        include: { rows: true, user: { select: { id: true, name: true } }, approvedBy: { select: { id: true, name: true } } }
      });

      if (!timesheet) throw new NotFoundError("Timesheet not found");

      res.status(200).json({ success: true, data: timesheet } as ApiResponse);

    } catch (error: any) {
      console.error("Get timesheet by ID error:", error);
      res.status(error instanceof NotFoundError ? 404 : 500).json({ success: false, error: error.message } as ApiResponse);
    }
  }

  /**
   * Approve or reject a timesheet
   */
  static async approveTimesheet(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) throw new ValidationError("Tenant context and authentication required");

      const { id } = req.params;
      const { status, rejectReason } = req.body;

      if (!["APPROVED", "REJECTED"].includes(status)) {
        throw new ValidationError("Status must be APPROVED or REJECTED");
      }

      const timesheet = await prisma.timesheet.findFirst({
        where: { id, tenantId: req.tenantId }
      });

      if (!timesheet) throw new NotFoundError("Timesheet not found");

      const updated = await prisma.timesheet.update({
        where: { id },
        data: {
          status,
          rejectReason: status === "REJECTED" ? rejectReason : null,
          approvedById: req.user.id,
          updatedById: req.user.id,
          updatedAt: new Date()
        },
        include: { rows: true }
      });

      res.status(200).json({ success: true, data: updated, message: `Timesheet ${status.toLowerCase()}` } as ApiResponse);

    } catch (error: any) {
      console.error("Approve timesheet error:", error);
      res.status(error instanceof ValidationError ? 400 : error instanceof NotFoundError ? 404 : 500).json({ success: false, error: error.message } as ApiResponse);
    }
  }

  /**
   * Update timesheet rows or basic info
   */
  static async updateTimesheet(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) throw new ValidationError("Tenant context and authentication required");

      const { id } = req.params;
      const data: UpdateTimesheetData = req.body;

      const timesheet = await prisma.timesheet.findFirst({ where: { id, tenantId: req.tenantId }, include: { rows: true } });
      if (!timesheet) throw new NotFoundError("Timesheet not found");

      // Update rows if provided
      if (data.rows && data.rows.length) {
        for (const rowData of data.rows) {
          await prisma.timesheetRow.updateMany({
            where: { timesheetId: id, day: new Date(rowData.day) },
            data: { ...rowData, updatedById: req.user.id, updatedAt: new Date() }
          });
        }
      }

      // Update basic info
      const updated = await prisma.timesheet.update({
        where: { id },
        data: {
          weekStart: data.weekStart ? new Date(data.weekStart) : undefined,
          weekEnd: data.weekEnd ? new Date(data.weekEnd) : undefined,
          status: data.status,
          rejectReason: data.rejectReason,
          updatedById: req.user.id,
          updatedAt: new Date()
        },
        include: { rows: true }
      });

      res.status(200).json({ success: true, data: updated, message: "Timesheet updated successfully" } as ApiResponse);

    } catch (error: any) {
      console.error("Update timesheet error:", error);
      res.status(error instanceof ValidationError ? 400 : error instanceof NotFoundError ? 404 : 500).json({ success: false, error: error.message } as ApiResponse);
    }
  }

  /**
   * Delete timesheet (soft delete or permanent)
   */
  static async deleteTimesheet(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) throw new ValidationError("Tenant context and authentication required");

      const { id } = req.params;

      const timesheet = await prisma.timesheet.findFirst({ where: { id, tenantId: req.tenantId } });
      if (!timesheet) throw new NotFoundError("Timesheet not found");

      await prisma.timesheetRow.deleteMany({ where: { timesheetId: id } });
      await prisma.timesheet.delete({ where: { id } });

      res.status(200).json({ success: true, message: "Timesheet deleted successfully" } as ApiResponse);

    } catch (error: any) {
      console.error("Delete timesheet error:", error);
      res.status(error instanceof NotFoundError ? 404 : 500).json({ success: false, error: error.message } as ApiResponse);
    }
  }
  /**
 * Get user projects & tasks for timesheet
 */
static async getTimesheetMeta(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user || !req.tenantId) {
      throw new ValidationError("Unauthorized");
    }

    // 1️⃣ User projects only
    const projects = await prisma.project.findMany({
      where: {
        tenantId: req.tenantId,
        members: {
          some: {
            userId: req.user.id
          }
        }
      },
      select: {
        id: true,
        name: true
      }
    });

    // 2️⃣ User assigned tasks only
    const tasks = await prisma.ticket.findMany({
      where: {
        tenantId: req.tenantId,
        assigneeId: req.user.id
      },
      select: {
        id: true,
        title: true,
        projectId: true
      }
    });

    res.status(200).json({
      success: true,
      data: {
        projects,
        tasks
      }
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}


// timesheetController.ts
static async submitTimesheet(req: AuthRequest, res: Response) {
  const { id } = req.params;

  try {
    // 1️⃣ Find the timesheet
    const timesheet = await prisma.timesheet.findUnique({ where: { id } });
    if (!timesheet) return res.status(404).json({ message: "Timesheet not found" });

    // 2️⃣ Only allow submitting DRAFT timesheets
    if (timesheet.status !== 'DRAFT') {
      return res.status(400).json({ message: "Only DRAFT timesheets can be submitted" });
    }

    // 3️⃣ Update status to SUBMITTED
    const updated = await prisma.timesheet.update({
      where: { id },
      data: { status: 'SUBMITTED' },
    });

    return res.json(updated); // return updated timesheet
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to submit timesheet" });
  }
}


}

export default TimesheetController;
