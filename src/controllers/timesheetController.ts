
import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
  CreateTimesheetData,
  UpdateTimesheetData,
} from "@/types";
// import { getSundayToSaturdayWeek } from "@/utils/week.util";

export class TimesheetController {
  /**
   * Create a new timesheet
   */
  static async createTimesheet(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const data: CreateTimesheetData = req.body;

      // Check if timesheet for same week exists
      const existing = await prisma.timesheet.findFirst({
        where: {
          tenantId: req.tenantId,
          userId: req.user.id,
          weekStart: new Date(data.weekStart),
          //  weekStart,
        },
      });

      if (existing)
        throw new ValidationError("Timesheet for this week already exists");

      // Calculate total hours
      const totalHours = data.rows.reduce((sum, row) => sum + row.hours, 0);
      
      // ✅ Get leaveCount from request body (default to 0 if not provided)
      const leaveCount = data.leaveCount !== undefined ? data.leaveCount : 0;
      console.log("leaveCount",leaveCount);

      const timesheet = await prisma.timesheet.create({
        data: {
          tenantId: req.tenantId,
          userId: req.user.id,
          weekStart: new Date(data.weekStart),
          weekEnd: new Date(data.weekEnd),
          //  weekStart, // ✅ Sun
          //  weekEnd,
          totalHours,
          // ✅ Save leave count
          // leaveCount,
           leaveCount: leaveCount,
          status: "DRAFT",
          createdById: req.user.id,
          rows: {
            create: data.rows.map((row) => ({
              tenantId: req.tenantId,
              day: new Date(row.day),
              updatedById: req.user.id,

              projectName: row.projectName,
              taskName: row.taskName,
              description: row.description,
              hours: row.hours,
              billable: row.billable || false,
              createdById: req.user.id,
            })),
          },
        },
        include: { rows: true },
      });
      console.log("data1",data)

      res.status(201).json({ success: true, data: timesheet } as ApiResponse);
    } catch (error: any) {
      console.error("Create timesheet error:", error);
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        error: error.message || "Failed to create timesheet",
      } as ApiResponse);
    }
  }


//   static async createTimesheet(req: AuthRequest, res: Response): Promise<void> {
//   try {
//     if (!req.user || !req.tenantId)
//       throw new ValidationError("Tenant context and authentication required");

//     const data: CreateTimesheetData = req.body;
    
//     // Log received data
//     console.log("Received data:", {
//       leaveCount: data.leaveCount,
//       totalRows: data.rows?.length
//     });

//     // Check if timesheet for same week exists
//     const existing = await prisma.timesheet.findFirst({
//       where: {
//         tenantId: req.tenantId,
//         userId: req.user.id,
//         weekStart: new Date(data.weekStart),
//       },
//     });

//     if (existing)
//       throw new ValidationError("Timesheet for this week already exists");

//     // Calculate total hours
//     const totalHours = data.rows.reduce((sum, row) => sum + (row.hours || 0), 0);
    
//     // IMPORTANT: Ensure leaveCount is a number
//     const leaveCount = data.leaveCount !== undefined ? Number(data.leaveCount) : 0;
    
//     console.log("📤 Saving leaveCount:", leaveCount);

//     const timesheet = await prisma.timesheet.create({
//       data: {
//         tenantId: req.tenantId,
//         userId: req.user.id,
//         weekStart: new Date(data.weekStart),
//         weekEnd: new Date(data.weekEnd),
//         totalHours,
//         leaveCount: leaveCount, // Make sure this is explicitly set
//         status: "DRAFT",
//         createdById: req.user.id,
//         rows: {
//           create: data.rows.map((row) => ({
//             tenantId: req.tenantId,
//             day: new Date(row.day),
//             updatedById: req.user.id,
//             projectName: row.projectName || '',
//             taskName: row.taskName || '',
//             description: row.description || '',
//             hours: row.hours || 0,
//             billable: row.billable || false,
//             createdById: req.user.id,
//           })),
//         },
//       },
//       include: { rows: true },
//     });

//     console.log("✅ Timesheet created with leaveCount:", timesheet.leaveCount);

//     res.status(201).json({ success: true, data: timesheet } as ApiResponse);
//   } catch (error: any) {
//     console.error("❌ Create timesheet error:", error);
//     res.status(error instanceof ValidationError ? 400 : 500).json({
//       success: false,
//       error: error.message || "Failed to create timesheet",
//     } as ApiResponse);
//   }
// }




 
/**
 * Create a new timesheet
 */

  /**
   * Get all timesheets for current tenant with pagination
   */
  static async getTimesheets(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");
      // const { page = 1, limit = 20, status, userId } = req.query;
      const {
        page = 1,
        limit = 20,
        status,
        userId,
        fromDate,
        toDate,
        forApproval,
      } = req.query;

      const where: any = { tenantId: req.tenantId };
      if (status) where.status = status;
      if (userId) where.userId = userId;
      if (forApproval === 'true') {
        where.user = { reportsToId: req.user.id };
      }
      // if (fromDate && toDate) {
      //   where.weekStart = {
      //     gte: new Date(fromDate as string),
      //     lte: new Date(toDate as string),
      //   };
      // }
      if (fromDate && toDate) {
        where.AND = [
          { weekStart: { lte: new Date(toDate as string) } },
          { weekEnd: { gte: new Date(fromDate as string) } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [timesheets, total] = await Promise.all([
        prisma.timesheet.findMany({
          where,
          include: {
            rows: true,
            user: { select: { id: true, name: true, avatarUrl: true } },
            approvedBy: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { weekStart: "desc" },
          skip,
          take: Number(limit),
        }),
        prisma.timesheet.count({ where }),
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
          hasPrev: Number(page) > 1,
        },
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get timesheets error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch timesheets",
      } as ApiResponse);
    }
  }

  // In TimesheetController.ts - Update getTimesheets method


  /**
   * Get timesheet by ID
   */
  static async getTimesheetById(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const { id } = req.params;

      const timesheet = await prisma.timesheet.findFirst({
        where: { id, tenantId: req.tenantId },
        include: {
          rows: true,
          user: { select: { id: true, name: true, avatarUrl: true } },
          approvedBy: { select: { id: true, name: true, avatarUrl: true } },
        },
      });

      if (!timesheet) throw new NotFoundError("Timesheet not found");

      res.status(200).json({ success: true, data: timesheet } as ApiResponse);
    } catch (error: any) {
      console.error("Get timesheet by ID error:", error);
      res
        .status(error instanceof NotFoundError ? 404 : 500)
        .json({ success: false, error: error.message } as ApiResponse);
    }
  }

  /**
   * Approve or reject a timesheet
   */
  static async approveTimesheet(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const { id } = req.params;
      console.log("REQ BODY 👉", req.body);

      const { status, rejectReason } = req.body;

      if (!["APPROVED", "REJECTED"].includes(status)) {
        throw new ValidationError("Status must be APPROVED or REJECTED");
      }

      const timesheet = await prisma.timesheet.findFirst({
        where: { id, tenantId: req.tenantId },
        include: { user: true },
      });

      if (!timesheet) throw new NotFoundError("Timesheet not found");

      if (timesheet.user?.reportsToId !== req.user.id) {
        throw new ValidationError("Only the reporting manager can approve this timesheet");
      }

      const updated = await prisma.timesheet.update({
        where: { id },
        data: {
          status,
          rejectReason: status === "REJECTED" ? rejectReason : null,
          approvedById: req.user.id,
          updatedById: req.user.id,
          updatedAt: new Date(),
        },
        include: { rows: true, approvedBy: true },
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: `Timesheet ${status.toLowerCase()}`,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Approve timesheet error:", error);
      res
        .status(
          error instanceof ValidationError
            ? 400
            : error instanceof NotFoundError
              ? 404
              : 500,
        )
        .json({ success: false, error: error.message } as ApiResponse);
    }
  }

  /**
   * Update timesheet rows or basic info
   */
  static async updateTimesheet(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const { id } = req.params;
      const data: UpdateTimesheetData = req.body;

      console.log("data", data);

      const timesheet = await prisma.timesheet.findFirst({
        where: { id, tenantId: req.tenantId },
        include: { rows: true },
      });
      console.log("ROWS FROM DB 👉", timesheet.rows);
      if (!timesheet) throw new NotFoundError("Timesheet not found");
      if (data.rows && data.rows.length) {
        for (const rowData of data.rows) {
          if (!rowData.id) continue;

          await prisma.timesheetRow.update({
            where: { id: rowData.id },
            data: {
              day: rowData.day,
              description: rowData.description,
              hours: rowData.hours,
              billable: rowData.billable,
              // updatedById: req.user.id,
              updatedAt: new Date(),
              // projectId: rowData.projectId ?? null,
              // taskId: rowData.taskId ?? null,

              taskName: rowData.taskName,
              projectName: rowData.projectName,
              updatedById: req.user.id,
            },
          });
        }
      }
      // ✅ Recalculate total hours
      const updatedRows = await prisma.timesheetRow.findMany({
        where: { timesheetId: id },
      });

      const totalHours = updatedRows.reduce(
        (sum, r) => sum + Number(r.hours || 0),
        0,
      );
      console.log("TOTAL HOURS 👉", totalHours);
      
      // ✅ Get leaveCount from request body (preserve existing if not provided)
      const leaveCount = data.leaveCount !== undefined 
        ? data.leaveCount 
        : timesheet.leaveCount || 0;

      // Update basic info
      const updated = await prisma.timesheet.update({
        where: { id },
        data: {
          weekStart: data.weekStart ? new Date(data.weekStart) : undefined,
          weekEnd: data.weekEnd ? new Date(data.weekEnd) : undefined,
          // weekStart: weekRange?.weekStart,
          // weekEnd: weekRange?.weekEnd,
          status: data.status,
          rejectReason: data.rejectReason,
          updatedById: req.user.id,
          updatedAt: new Date(),
          totalHours: totalHours,
          // ✅ Update leave count
          leaveCount: leaveCount,
        },
        include: { rows: true },
      });
      res.status(200).json({
        success: true,
        data: updated,
        message: "Timesheet updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update timesheet error:", error);
      res
        .status(
          error instanceof ValidationError
            ? 400
            : error instanceof NotFoundError
              ? 404
              : 500,
        )
        .json({ success: false, error: error.message } as ApiResponse);
    }
  }

//   static async updateTimesheet(req: AuthRequest, res: Response): Promise<void> {
//   try {
//     if (!req.user || !req.tenantId)
//       throw new ValidationError("Tenant context and authentication required");

//     const { id } = req.params;
//     const data: UpdateTimesheetData = req.body;

//     const timesheet = await prisma.timesheet.findFirst({
//       where: { id, tenantId: req.tenantId },
//       include: { rows: true },
//     });

//     if (!timesheet) throw new NotFoundError("Timesheet not found");

//     // Update rows if provided
//     if (data.rows && data.rows.length) {
//       for (const rowData of data.rows) {
//         if (!rowData.id) continue;
//         await prisma.timesheetRow.update({
//           where: { id: rowData.id },
//           data: {
//             day: rowData.day,
//             description: rowData.description,
//             hours: rowData.hours,
//             billable: rowData.billable,
//             updatedAt: new Date(),
//             taskName: rowData.taskName,
//             projectName: rowData.projectName,
//             updatedBy: { connect: { id: req.user.id } },
//           },
//         });
//       }
//     }

//     // Recalculate total hours
//     const updatedRows = await prisma.timesheetRow.findMany({
//       where: { timesheetId: id },
//     });

//     const totalHours = updatedRows.reduce(
//       (sum, r) => sum + Number(r.hours || 0),
//       0,
//     );
    
//     // IMPORTANT: Get leaveCount from request and ensure it's a number
//     const leaveCount = data.leaveCount !== undefined ? Number(data.leaveCount) : timesheet.leaveCount || 0;

//     const updated = await prisma.timesheet.update({
//       where: { id },
//       data: {
//         weekStart: data.weekStart ? new Date(data.weekStart) : undefined,
//         weekEnd: data.weekEnd ? new Date(data.weekEnd) : undefined,
//         status: data.status,
//         rejectReason: data.rejectReason,
//         updatedById: req.user.id,
//         updatedAt: new Date(),
//         totalHours: totalHours,
//         leaveCount: leaveCount, // Make sure this is set
//       },
//       include: { rows: true },
//     });

//     console.log("✅ Updated timesheet leaveCount:", updated.leaveCount);

//     res.status(200).json({
//       success: true,
//       data: updated,
//       message: "Timesheet updated successfully",
//     } as ApiResponse);
//   } catch (error: any) {
//     console.error("Update timesheet error:", error);
//     res.status(500).json({ success: false, error: error.message } as ApiResponse);
//   }
// }
  /**
   * Delete timesheet (soft delete or permanent)
   */
  static async deleteTimesheet(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const { id } = req.params;

      const timesheet = await prisma.timesheet.findFirst({
        where: { id, tenantId: req.tenantId },
      });
      if (!timesheet) throw new NotFoundError("Timesheet not found");

      await prisma.timesheetRow.deleteMany({ where: { timesheetId: id } });
      await prisma.timesheet.delete({ where: { id } });

      res.status(200).json({
        success: true,
        message: "Timesheet deleted successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Delete timesheet error:", error);
      res
        .status(error instanceof NotFoundError ? 404 : 500)
        .json({ success: false, error: error.message } as ApiResponse);
    }
  }
  
  static async getTimesheetMeta(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.user || !req.tenantId) {
        throw new ValidationError("Unauthorized");
      }

      // 1️⃣ User projects
      const projects = await prisma.project.findMany({
        where: {
          tenantId: req.tenantId,
          members: {
            some: {
              userId: req.user.id,
            },
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      // 2️⃣ User assigned tasks
      const rawTasks = await prisma.ticket.findMany({
        where: {
          tenantId: req.tenantId,
          assigneeId: req.user.id,
        },
        select: {
          id: true,
          title: true,
          projectId: true,
        },
      });

      // 🔥 Map title → name (Frontend requirement)
      const tasks = rawTasks.map((t) => ({
        id: t.id,
        name: t.title,
        projectId: t.projectId,
      }));

      res.status(200).json({
        success: true,
        data: {
          projects,
          tasks,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // static async submitTimesheet(req: AuthRequest, res: Response) {
  //   const { id } = req.params;

  //   try {
  //     // 1️⃣ Find the timesheet with related data
  //     const timesheet = await prisma.timesheet.findUnique({
  //       where: { id },
  //       include: {
  //         user: true,
  //         rows: true,
  //       },
  //     });

  //     if (!timesheet) {
  //       return res.status(404).json({ message: "Timesheet not found" });
  //     }
  //     if (!timesheet.rows || timesheet.rows.length === 0) {
  //       return res.status(400).json({
  //         message: "Cannot submit empty timesheet",
  //       });
  //     }

  //     // 4️⃣ Validate: Check total hours
  //     const totalHours = timesheet.rows.reduce(
  //       (sum, row) => sum + row.hours,
  //       0,
  //     );
  //     if (totalHours <= 0) {
  //       return res.status(400).json({
  //         message: "Timesheet must have positive hours",
  //       });
  //     }

  //     // 5️⃣ Update status to SUBMITTED
  //     const updated = await prisma.timesheet.update({
  //       where: { id },
  //       data: {
  //         status: "SUBMITTED",
  //         //submittedAt: new Date() // Add submission timestamp
  //       },
  //       include: {
  //         user: true,
  //         rows: true,
  //       },
  //     });

  //     // 6️⃣ Optional: Send notification
  //     // await sendTimesheetSubmittedNotification(updated);

  //     return res.json(updated);
  //   } catch (err) {
  //     console.error("Submit timesheet error:", err);
  //     return res.status(500).json({
  //       message: "Failed to submit timesheet",
  //       error: process.env.NODE_ENV === "development" ? err.message : undefined,
  //     });
  //   }
  // }
  static async submitTimesheet(req: AuthRequest, res: Response) {
  const { id } = req.params;

  try {
    // 1️⃣ Find the timesheet with related data
    const timesheet = await prisma.timesheet.findUnique({
      where: { id },
      include: {
        user: true,
        rows: true,
      },
    });

    if (!timesheet) {
      return res.status(404).json({ message: "Timesheet not found" });
    }
    if (!timesheet.rows || timesheet.rows.length === 0) {
      return res.status(400).json({
        message: "Cannot submit empty timesheet",
      });
    }

    // 4️⃣ Validate: Check total hours
    const totalHours = timesheet.rows.reduce(
      (sum, row) => sum + row.hours,
      0,
    );
    if (totalHours <= 0) {
      return res.status(400).json({
        message: "Timesheet must have positive hours",
      });
    }

    // 5️⃣ Update status to SUBMITTED
    const updated = await prisma.timesheet.update({
      where: { id },
      data: {
        status: "SUBMITTED",
      },
      include: {
        user: true,
        rows: true,
        // ✅ Include all fields including leaveCount
      },
    });

    console.log("✅ SUBMITTED TIMESHEET:", {
      id: updated.id,
      status: updated.status,
      leaveCount: updated.leaveCount, // This should now show the value
    });

    return res.json(updated);
  } catch (err) {
    console.error("Submit timesheet error:", err);
    return res.status(500).json({
      message: "Failed to submit timesheet",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}
}

export default TimesheetController;
