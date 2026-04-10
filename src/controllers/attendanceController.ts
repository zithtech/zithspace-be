import { Response } from "express";
import { tenantAwarePrisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
  CreateAttendanceData,
} from "@/types";

export class AttendanceController {
  /**
   * Get all attendance records with filtering and pagination (tenant-aware)
   */
  static async getAttendance(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const {
        page = 1,
        limit = 20,
        userId,
        member, // Alias for userId (used by frontend)
        date,
        status,
        startDate,
        endDate,
        search, // Search by member name
        sortBy = "date",
        sortOrder = "desc",
      } = req.query;

      // Build filter query
      const where: any = {
        tenantId: req.tenantId,
      };

      // Handle userId or member parameter (member is alias for userId)
      const targetUserId = userId || member;
      if (targetUserId) where.userId = targetUserId;

      if (status) where.status = status;

      // Handle search by member name
      if (search) {
        where.user = {
          name: {
            contains: search as string,
            mode: "insensitive",
          },
        };
      }

      if (date) {
        const targetDate = new Date(date as string);
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        where.date = {
          gte: startOfDay,
          lte: endOfDay,
        };
      } else if (startDate && endDate) {
        where.date = {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string),
        };
      }

      // Build sort object
      const orderBy: any = {};
      orderBy[sortBy as string] = sortOrder === "desc" ? "desc" : "asc";

      // Execute query with pagination
      const skip = (Number(page) - 1) * Number(limit);

      const [attendanceRecords, total] = await Promise.all([
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.attendance.findMany({
            where,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  workEmail: true,
                  position: true,
                },
              },
            },
            orderBy: [orderBy, { createdAt: "desc" }],
            skip,
            take: Number(limit),
          });
        }),
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.attendance.count({ where });
        }),
      ]);

      const attendance = attendanceRecords.map((record: any) => ({
        ...record,
        member: record.user,
        user: undefined,
      }));

      const totalPages = Math.ceil(total / Number(limit));

      res.status(200).json({
        success: true,
        data: attendance,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: totalPages,
          hasNext: Number(page) < totalPages,
          hasPrev: Number(page) > 1,
        },
      } as ApiResponse);
    } catch (error) {
      console.error("Get attendance error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch attendance records",
      } as ApiResponse);
    }
  }

  /**
   * Get attendance record by ID (tenant-aware)
   */
  static async getAttendanceById(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const attendanceRecord = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          return await client.attendance.findFirst({
            where: {
              id,
              tenantId: req.tenantId,
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  workEmail: true,
                  position: true,
                },
              },
            },
          });
        },
      );

      if (!attendanceRecord) {
        res.status(404).json({
          success: false,
          error: "Attendance record not found",
        } as ApiResponse);
        return;
      }

      // Transform data to use 'member' instead of 'user'
      const attendance = {
        ...attendanceRecord,
        member: attendanceRecord.user,
        user: undefined,
      };

      res.status(200).json({
        success: true,
        data: attendance,
      } as ApiResponse);
    } catch (error) {
      console.error("Get attendance by ID error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch attendance record",
      } as ApiResponse);
    }
  }

  /**
   * Clock in (tenant-aware)
   */
  static async clockIn(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { userId: targetUserId } = req.body;
      const userId = targetUserId || req.user.id;

      const today = new Date();
      const startOfToday = new Date(today);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Check if already clocked in today
        const existingAttendance = await client.attendance.findFirst({
          where: {
            userId,
            tenantId: req.tenantId,
            date: { gte: startOfToday, lte: endOfToday },
          },
          include: {
            shift: true,
            user: {
              include: {
                assignedShift: true,
              },
            },
          },
        });

        if (existingAttendance && existingAttendance.clockIn) {
          throw new ValidationError("Already clocked in today");
        }

        // Validate user exists and belongs to tenant
        const user = await client.user.findFirst({
          where: {
            id: userId,
            tenantId: req.tenantId,
            isActive: true,
          },
        });

        if (!user) {
          throw new NotFoundError("User not found in this tenant");
        }

        const clockInTime = new Date();

        let attendanceRecord;
        if (existingAttendance) {
          // Update existing record
          attendanceRecord = await client.attendance.update({
            where: { id: existingAttendance.id },
            data: {
              clockIn: clockInTime,
              status: "present",
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  workEmail: true,
                  position: true,
                },
              },
            },
          });
        } else {
          // Create new attendance record
          attendanceRecord = await client.attendance.create({
            data: {
              tenantId: req.tenantId,
              userId,
              date: startOfToday,
              clockIn: clockInTime,
              status: "present",
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  workEmail: true,
                  position: true,
                },
              },
            },
          });
        }

        // Get formatted today attendance for consistent response
        const formattedAttendance = await AttendanceController.getFormattedTodayAttendance(
          client,
          userId,
          req.tenantId!,
          today,
        );

        res.status(200).json({
          success: true,
          data: formattedAttendance,
          message: "Clocked in successfully",
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error("Clock in error:", error);

      if (error instanceof ValidationError || error instanceof NotFoundError) {
        res.status(error instanceof NotFoundError ? 404 : 400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to clock in",
      } as ApiResponse);
    }
  }

  /**
   * Clock out (tenant-aware)
   */
  static async clockOut(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { userId: targetUserId } = req.body;
      const userId = targetUserId || req.user.id;

      const today = new Date();
      const startOfToday = new Date(today);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Find today's attendance record
        const attendance = await client.attendance.findFirst({
          where: {
            userId,
            tenantId: req.tenantId,
            date: { gte: startOfToday, lte: endOfToday },
          },
        });

        if (!attendance || !attendance.clockIn) {
          throw new ValidationError("No clock in record found for today");
        }

        if (attendance.clockOut) {
          throw new ValidationError("Already clocked out today");
        }

        const clockOutTime = new Date();

        // Calculate work minutes
        const totalWorkMinutes = Math.floor(
          (clockOutTime.getTime() - attendance.clockIn.getTime()) / 60000,
        );

        // Calculate effective work minutes (total - breaks)
        const effectiveWorkMinutes =
          totalWorkMinutes - attendance.totalBreakMinutes;

        const attendanceRecord = await client.attendance.update({
          where: { id: attendance.id },
          data: {
            clockOut: clockOutTime,
            totalWorkMinutes,
            effectiveWorkMinutes,
          },
          include: {
            user: {
              select: { id: true, name: true, workEmail: true, position: true },
            },
          },
        });

        // Get formatted today attendance for consistent response
        const formattedAttendance = await AttendanceController.getFormattedTodayAttendance(
          client,
          userId,
          req.tenantId!,
          today,
        );

        res.status(200).json({
          success: true,
          data: formattedAttendance,
          message: "Clocked out successfully",
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error("Clock out error:", error);

      if (error instanceof ValidationError || error instanceof NotFoundError) {
        res.status(error instanceof NotFoundError ? 404 : 400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to clock out",
      } as ApiResponse);
    }
  }

  /**
   * Get today's attendance for current user (tenant-aware)
   */
  static async getTodayAttendance(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const userId = req.user.id;

      const today = new Date();
      const startOfToday = new Date(today);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);

      const result = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          return await AttendanceController.getFormattedTodayAttendance(
            client,
            userId,
            req.tenantId!,
            today,
          );
        },
      );

      res.status(200).json({
        success: true,
        data: result,
      } as ApiResponse);
    } catch (error) {
      console.error("Get today attendance error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch today's attendance",
      } as ApiResponse);
    }
  }

  /**
   * Get attendance dashboard summary (tenant-aware)
   */
  static async getDashboardSummary(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const today = new Date();
      const startOfToday = new Date(today);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);

      const summary = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          // Get total active members
          const totalMembers = await client.user.count({
            where: {
              tenantId: req.tenantId,
              isActive: true,
            },
          });

          // Get today's attendance summary
          const todaySummary = await client.attendance.groupBy({
            by: ["status"],
            where: {
              tenantId: req.tenantId,
              date: { gte: startOfToday, lte: endOfToday },
            },
            _count: true,
          });

          // Format summary counts
          const statusCounts = {
            present: 0,
            absent: 0,
            late: 0,
            halfDay: 0,
            wfh: 0,
          };

          todaySummary.forEach((item: any) => {
            const status = item.status.toLowerCase();
            switch (status) {
              case "present":
                statusCounts.present = item._count;
                break;
              case "absent":
                statusCounts.absent = item._count;
                break;
              case "late":
                statusCounts.late = item._count;
                break;
              case "half-day":
                statusCounts.halfDay = item._count;
                break;
              case "wfh":
                statusCounts.wfh = item._count;
                break;
            }
          });

          // Calculate metrics
          const presentToday =
            statusCounts.present + statusCounts.late + statusCounts.wfh;
          const absentToday = statusCounts.absent;
          const expectedToday = totalMembers; // Could be refined based on work days
          const attendanceRate =
            expectedToday > 0
              ? Number(((presentToday / expectedToday) * 100).toFixed(2))
              : 0;

          return {
            totalMembers,
            expectedToday,
            presentToday,
            absentToday,
            lateToday: statusCounts.late,
            wfhToday: statusCounts.wfh,
            attendanceRate,
          };
        },
      );

      res.status(200).json({
        success: true,
        data: summary,
      } as ApiResponse);
    } catch (error) {
      console.error("Get dashboard summary error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch dashboard summary",
      } as ApiResponse);
    }
  }

  /**
   * Get present members (tenant-aware)
   */
  static async getPresentMembers(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const today = new Date();
      const startOfToday = new Date(today);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);

      const presentMembers = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          const records = await client.attendance.findMany({
            where: {
              tenantId: req.tenantId,
              date: { gte: startOfToday, lte: endOfToday },
              status: { in: ["present", "late", "wfh"] },
              clockIn: { not: null },
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  workEmail: true,
                  position: true,
                },
              },
              shift: true,
            },
            orderBy: { clockIn: "asc" },
          });

          // Transform to match frontend expectations
          return records.map((record) => {
            // Calculate work hours
            const workMinutes = record.clockOut
              ? Math.floor(
                  (record.clockOut.getTime() - record.clockIn!.getTime()) /
                    60000,
                )
              : Math.floor(
                  (new Date().getTime() - record.clockIn!.getTime()) / 60000,
                );

            return {
              id: record.user.id,
              name: record.user.name,
              position: record.user.position,
              status: record.status.toLowerCase(),
              clockInTime: record.clockIn,
              clockOutTime: record.clockOut,
              shift: record.shift
                ? {
                    name: record.shift.name,
                    startTime: record.shift.startTime,
                    endTime: record.shift.endTime,
                  }
                : null,
              workHours: workMinutes,
            };
          });
        },
      );

      res.status(200).json({
        success: true,
        data: presentMembers,
      } as ApiResponse);
    } catch (error) {
      console.error("Get present members error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch present members",
      } as ApiResponse);
    }
  }

  /**
   * Get my attendance summary (tenant-aware)
   */
  static async getMyAttendanceSummary(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const userId = req.user.id;
      const { month, year } = req.query;

      const targetDate = new Date(
        Number(year) || new Date().getFullYear(),
        Number(month) - 1 || new Date().getMonth(),
      );
      const startOfMonth = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        1,
      );
      const endOfMonth = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth() + 1,
        0,
      );
      endOfMonth.setHours(23, 59, 59, 999);

      const data = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          const attendanceRecords = await client.attendance.findMany({
            where: {
              userId,
              tenantId: req.tenantId,
              date: { gte: startOfMonth, lte: endOfMonth },
            },
            orderBy: { date: "asc" },
          });

          // Calculate summary
          const summary = {
            totalDays: attendanceRecords.length,
            present: 0,
            absent: 0,
            late: 0,
            halfDay: 0,
            wfh: 0,
          };

          attendanceRecords.forEach((record) => {
            switch (record.status) {
              case "PRESENT":
                summary.present++;
                break;
              case "ABSENT":
                summary.absent++;
                break;
              case "LATE":
                summary.late++;
                break;
              case "HALF_DAY":
                summary.halfDay++;
                break;
              case "WFH":
                summary.wfh++;
                break;
            }
          });

          return {
            summary,
            records: attendanceRecords,
            month: targetDate.getMonth() + 1,
            year: targetDate.getFullYear(),
          };
        },
      );

      res.status(200).json({
        success: true,
        data,
      } as ApiResponse);
    } catch (error) {
      console.error("Get my attendance summary error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch attendance summary",
      } as ApiResponse);
    }
  }

  /**
   * Update attendance record (tenant-aware)
   */
  static async updateAttendance(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const updateData = req.body;

      // Remove fields that shouldn't be updated directly
      delete updateData.tenantId;
      delete updateData.userId;
      delete updateData.createdAt;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Check if attendance record exists and belongs to tenant
        const existingRecord = await client.attendance.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          },
        });

        if (!existingRecord) {
          throw new NotFoundError("Attendance record not found in this tenant");
        }

        // Convert date strings if provided
        if (updateData.clockIn)
          updateData.clockIn = new Date(updateData.clockIn);
        if (updateData.clockOut)
          updateData.clockOut = new Date(updateData.clockOut);
        if (updateData.date) updateData.date = new Date(updateData.date);

        const attendanceRecord = await client.attendance.update({
          where: { id },
          data: {
            ...updateData,
            updatedAt: new Date(),
          },
          include: {
            user: {
              select: { id: true, name: true, workEmail: true, position: true },
            },
          },
        });

        // Recalculate work minutes if clock-in or clock-out changed
        if (updateData.clockIn || updateData.clockOut) {
          const finalClockIn = updateData.clockIn || attendanceRecord.clockIn;
          const finalClockOut = updateData.clockOut || attendanceRecord.clockOut;

          if (finalClockIn && finalClockOut) {
            const totalWorkMinutes = Math.floor(
              (new Date(finalClockOut).getTime() - new Date(finalClockIn).getTime()) / 60000
            );
            const effectiveWorkMinutes = totalWorkMinutes - (attendanceRecord.totalBreakMinutes || 0);

            // Update with calculated minutes
            await client.attendance.update({
              where: { id: attendanceRecord.id },
              data: {
                totalWorkMinutes,
                effectiveWorkMinutes,
              }
            });

            // Update the record in memory for response
            attendanceRecord.totalWorkMinutes = totalWorkMinutes;
            attendanceRecord.effectiveWorkMinutes = effectiveWorkMinutes;
          }
        }

        // Transform data to use 'member' instead of 'user'
        const attendance = {
          ...attendanceRecord,
          member: attendanceRecord.user,
          user: undefined,
        };

        res.status(200).json({
          success: true,
          data: attendance,
          message: "Attendance record updated successfully",
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error("Update attendance error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to update attendance record",
      } as ApiResponse);
    }
  }

  /**
   * Delete attendance record (tenant-aware)
   */
  static async deleteAttendance(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Check if attendance record exists and belongs to tenant
        const record = await client.attendance.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          },
        });

        if (!record) {
          throw new NotFoundError("Attendance record not found in this tenant");
        }

        await client.attendance.delete({
          where: { id },
        });

        res.status(200).json({
          success: true,
          message: "Attendance record deleted successfully",
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error("Delete attendance error:", error);
      res.status(error instanceof NotFoundError ? 404 : 500).json({
        success: false,
        error: error.message || "Failed to delete attendance record",
      } as ApiResponse);
    }
  }

  /**
   * Get last 5 working days average for current user
   */

  static async getLast5DaysAverage(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        });
        return;
      }

      const userId = req.user.id;

      const result = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          const records = await client.attendance.findMany({
            where: {
              userId,
              tenantId: req.tenantId,
              clockIn: { not: null },
              clockOut: { not: null }, // only completed days
            },
            orderBy: { date: "desc" },
            take: 5,
          });

          if (records.length === 0) {
            return {
              last5Days: [],
              averageMinutes: 0,
              averageHours: 0,
            };
          }

          const processedRecords = records.map((record) => {
            const minutes = Math.floor(
              (record.clockOut!.getTime() - record.clockIn!.getTime()) / 60000,
            );

            return {
              date: record.date,
              clockIn: record.clockIn,
              clockOut: record.clockOut,
              minutes,
              hours: Number((minutes / 60).toFixed(2)),
            };
          });

          const totalMinutes = processedRecords.reduce(
            (sum, r) => sum + r.minutes,
            0,
          );

          const averageMinutes = Math.floor(
            totalMinutes / processedRecords.length,
          );
          const averageHours = Number((averageMinutes / 60).toFixed(2));

          return {
            last5Days: processedRecords,
            averageMinutes,
            averageHours,
          };
        },
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Last 5 days average error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch last 5 days average",
      });
    }
  }

  /**
   * Create manual attendance entry (tenant-aware)
   */
  static async createAttendance(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const attendanceData: CreateAttendanceData = req.body;

      // Validate required fields
      if (!attendanceData.userId || !attendanceData.date) {
        res.status(400).json({
          success: false,
          error: "User ID and date are required",
        } as ApiResponse);
        return;
      }

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Validate user exists and belongs to tenant
        const user = await client.user.findFirst({
          where: {
            id: attendanceData.userId,
            tenantId: req.tenantId,
            isActive: true,
          },
        });

        if (!user) {
          throw new ValidationError("User not found in this tenant");
        }

        // Check if attendance already exists for this date
        const targetDate = new Date(attendanceData.date);
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const existingAttendance = await client.attendance.findFirst({
          where: {
            userId: attendanceData.userId,
            tenantId: req.tenantId,
            date: { gte: startOfDay, lte: endOfDay },
          },
        });

        if (existingAttendance) {
          throw new ValidationError(
            "Attendance record already exists for this date",
          );
        }

        // Create attendance record
        const attendanceRecord = await client.attendance.create({
          data: {
            tenantId: req.tenantId,
            userId: attendanceData.userId,
            date: startOfDay,
            clockIn: attendanceData.clockIn
              ? new Date(attendanceData.clockIn)
              : null,
            clockOut: attendanceData.clockOut
              ? new Date(attendanceData.clockOut)
              : null,
            status: attendanceData.status || "present",
            notes: attendanceData.notes,
          },
          include: {
            user: {
              select: { id: true, name: true, workEmail: true, position: true },
            },
          },
        });

        // Transform data to use 'member' instead of 'user'
        const attendance = {
          ...attendanceRecord,
          member: attendanceRecord.user,
          user: undefined,
        };

        res.status(201).json({
          success: true,
          data: attendance,
          message: "Attendance record created successfully",
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error("Create attendance error:", error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to create attendance record",
      } as ApiResponse);
    }
  }

  /**
   * Helper to get formatted today's attendance data for a user
   * Consistent response format for clock-in, clock-out, and today status
   */
  private static async getFormattedTodayAttendance(
    client: any,
    userId: string,
    tenantId: string,
    targetDate: Date,
  ) {
    const startOfToday = new Date(targetDate);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(targetDate);
    endOfToday.setHours(23, 59, 59, 999);

    // Get user info with assigned shift
    const user = await client.user.findUnique({
      where: { id: userId },
      include: {
        assignedShift: true,
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Get attendance with shift data
    const attendance = await client.attendance.findFirst({
      where: {
        userId,
        tenantId,
        date: { gte: startOfToday, lte: endOfToday },
      },
      include: {
        shift: true,
      },
    });

    // Get shift info (from attendance or user's assigned shift)
    const shift = attendance?.shift || user.assignedShift;

    // Calculate work minutes if clocked in
    let totalWorkMinutes = 0;
    if (attendance?.clockIn) {
      const endTime = attendance.clockOut || new Date();
      totalWorkMinutes = Math.floor(
        (endTime.getTime() - attendance.clockIn.getTime()) / 60000,
      );
    }

    // Standardized response object
    return {
      id: attendance?.id || null,
      userId: userId,
      date: startOfToday,
      clockIn: attendance?.clockIn || null,
      clockOut: attendance?.clockOut || null,
      status: attendance?.status?.toLowerCase() || "not_clocked_in",
      shift: shift
        ? {
            id: shift.id,
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            isFlexible: false,
          }
        : null,
      totalWorkMinutes,
      isClockIn: !!attendance?.clockIn,
      clockInTime: attendance?.clockIn || null,
      clockOutTime: attendance?.clockOut || null,
      canClockIn: !attendance?.clockIn,
      canClockOut: !!attendance?.clockIn && !attendance?.clockOut,
    };
  }
}

export default AttendanceController;
