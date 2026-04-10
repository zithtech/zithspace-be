import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class TimeTrackingController {

  static async getEntries(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { ticketId, projectId, userId, allUsers, startDate, endDate } = req.query;

      const whereClause: any = { tenantId: req.tenantId };

      if (allUsers === 'true') {
        // No user filter (get all)
      } else if (userId) {
        whereClause.userId = String(userId);
      } else if (ticketId) {
        // Keep ticket-based view open to all members for that specific ticket
        whereClause.ticketId = String(ticketId);
      } else {
        // Default to current user
        whereClause.userId = req.user.id;
      }

      if (projectId) {
        whereClause.projectId = String(projectId);
      }

      if (startDate || endDate) {
        whereClause.startTime = {};
        if (startDate) whereClause.startTime.gte = new Date(startDate as string);
        if (endDate) whereClause.startTime.lte = new Date(endDate as string);
      }

      const entries = await prisma.timeTrackingEntry.findMany({
        where: whereClause,
        include: {
          project: { select: { id: true, name: true, code: true } },
          ticket: { select: { id: true, title: true, ticketNumber: true } },
          user: { select: { id: true, name: true, workEmail: true } },
          logs: { orderBy: { createdAt: 'desc' } }
        },
        orderBy: { startTime: 'desc' }
      });

      res.status(200).json({ success: true, data: entries } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message } as ApiResponse);
    }
  }

  static async createManualEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { projectId, ticketId, description, billable, billingRate, startTime, endTime, userId } = req.body;
      const targetUserId = userId || req.user.id;

      if (!startTime || !endTime) {
        res.status(400).json({ success: false, error: "Start and End times are required" } as ApiResponse);
        return;
      }

      const start = new Date(startTime);
      const end = new Date(endTime);
      const duration = Math.floor((end.getTime() - start.getTime()) / 1000);

      const newEntry = await prisma.timeTrackingEntry.create({
        data: {
          tenantId: req.tenantId,
          userId: targetUserId,
          projectId: projectId || null,
          ticketId: ticketId || null,
          description,
          billable: billable || false,
          billingRate: billingRate || null,
          startTime: start,
          endTime: end,
          duration,
          status: "MANUAL_UPDATED",
          logs: {
            createMany: {
              data: [
                { action: "STARTED", createdAt: start, tenantId: req.tenantId },
                { action: "STOPPED", createdAt: end, tenantId: req.tenantId }
              ]
            }
          }
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          ticket: { select: { id: true, title: true, ticketNumber: true } },
          logs: { orderBy: { createdAt: 'desc' } }
        }
      });

      res.status(201).json({ success: true, data: newEntry } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message } as ApiResponse);
    }
  }

  static async startTimer(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { projectId, ticketId, description, billable, billingRate } = req.body;

      /* 
      // Stop any running timers for this user
      const runningTimer = await prisma.timeTrackingEntry.findFirst({
        where: { tenantId: req.tenantId, userId: req.user.id, status: { in: ["RUNNING", "PAUSED"] } }
      });

      if (runningTimer) {
        const endTime = new Date();
        let additionalDuration = 0;
        
        if (runningTimer.status === "RUNNING") {
          const lastLog = await prisma.timeTrackingLog.findFirst({
            where: { timeTrackingId: runningTimer.id },
            orderBy: { createdAt: 'desc' }
          });
          const lastActiveTime = lastLog ? lastLog.createdAt : runningTimer.startTime;
          additionalDuration = Math.floor((endTime.getTime() - lastActiveTime.getTime()) / 1000);
        }
        
        const totalDuration = (runningTimer.duration || 0) + additionalDuration;

        await prisma.timeTrackingEntry.update({
          where: { id: runningTimer.id },
          data: { 
            status: "STOPPED", 
            endTime, 
            duration: totalDuration,
            logs: {
              create: { action: "STOPPED", tenantId: req.tenantId }
            }
          }
        });
      }
      */

      const newEntry = await prisma.timeTrackingEntry.create({
        data: {
          tenantId: req.tenantId,
          userId: req.user.id,
          projectId: projectId || null,
          ticketId: ticketId || null,
          description,
          billable: billable || false,
          billingRate: billingRate || null,
          startTime: new Date(),
          duration: 0,
          status: "RUNNING",
          logs: {
            create: { action: "STARTED", tenantId: req.tenantId }
          }
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          ticket: { select: { id: true, title: true, ticketNumber: true } },
          logs: { orderBy: { createdAt: 'desc' } }
        }
      });

      res.status(201).json({ success: true, data: newEntry } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message } as ApiResponse);
    }
  }

  static async pauseTimer(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const entry = await prisma.timeTrackingEntry.findUnique({
        where: { id, tenantId: req.tenantId }
      });

      if (!entry || entry.status !== "RUNNING") {
        res.status(400).json({ success: false, error: "Timer is not RUNNING." } as ApiResponse);
        return;
      }

      const pauseTime = new Date();
      const lastLog = await prisma.timeTrackingLog.findFirst({
        where: { timeTrackingId: id },
        orderBy: { createdAt: 'desc' }
      });
      const lastActiveTime = lastLog ? lastLog.createdAt : entry.startTime;
      const additionalDuration = Math.floor((pauseTime.getTime() - lastActiveTime.getTime()) / 1000);
      const totalDuration = (entry.duration || 0) + additionalDuration;

      const updatedEntry = await prisma.timeTrackingEntry.update({
        where: { id },
        data: {
          status: "PAUSED",
          duration: totalDuration,
          logs: {
            create: { action: "PAUSED", tenantId: req.tenantId }
          }
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          ticket: { select: { id: true, title: true, ticketNumber: true } },
          logs: { orderBy: { createdAt: 'desc' } }
        }
      });

      res.status(200).json({ success: true, data: updatedEntry } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message } as ApiResponse);
    }
  }

  static async resumeTimer(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const entry = await prisma.timeTrackingEntry.findUnique({
        where: { id, tenantId: req.tenantId }
      });

      if (!entry || entry.status !== "PAUSED") {
        res.status(400).json({ success: false, error: "Timer is not PAUSED." } as ApiResponse);
        return;
      }

      const updatedEntry = await prisma.timeTrackingEntry.update({
        where: { id },
        data: {
          status: "RUNNING",
          logs: {
            create: { action: "RESUMED", tenantId: req.tenantId }
          }
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          ticket: { select: { id: true, title: true, ticketNumber: true } },
          logs: { orderBy: { createdAt: 'desc' } }
        }
      });

      res.status(200).json({ success: true, data: updatedEntry } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message } as ApiResponse);
    }
  }

  static async stopTimer(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const entry = await prisma.timeTrackingEntry.findUnique({
        where: { id, tenantId: req.tenantId }
      });

      if (!entry || entry.status === "STOPPED") {
        res.status(400).json({ success: false, error: "No active timer found with this ID." } as ApiResponse);
        return;
      }

      const endTime = new Date();
      let additionalDuration = 0;

      if (entry.status === "RUNNING") {
        const lastLog = await prisma.timeTrackingLog.findFirst({
          where: { timeTrackingId: id },
          orderBy: { createdAt: 'desc' }
        });
        const lastActiveTime = lastLog ? lastLog.createdAt : entry.startTime;
        additionalDuration = Math.floor((endTime.getTime() - lastActiveTime.getTime()) / 1000);
      }

      const totalDuration = (entry.duration || 0) + additionalDuration;

      const updatedEntry = await prisma.timeTrackingEntry.update({
        where: { id },
        data: {
          status: "STOPPED",
          endTime,
          duration: totalDuration,
          logs: {
            create: { action: "STOPPED", tenantId: req.tenantId }
          }
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          ticket: { select: { id: true, title: true, ticketNumber: true } },
          logs: { orderBy: { createdAt: 'desc' } }
        }
      });

      res.status(200).json({ success: true, data: updatedEntry } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message } as ApiResponse);
    }
  }

  static async updateEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { projectId, ticketId, description, billable, billingRate, startTime, endTime, logId } = req.body;

      let duration = undefined;
      let newStartTime = startTime ? new Date(startTime) : undefined;
      let newEndTime = endTime ? new Date(endTime) : undefined;

      // Ensure valid dates
      if (newStartTime && isNaN(newStartTime.getTime())) newStartTime = undefined;
      if (newEndTime && isNaN(newEndTime.getTime())) newEndTime = undefined;

      const entry = await prisma.timeTrackingEntry.findUnique({
        where: { id, tenantId: req.tenantId }
      });

      if (!entry) {
        res.status(404).json({ success: false, error: "Entry not found" } as ApiResponse);
        return;
      }

      // Handle targeted log update OR broad truncation
      if (newEndTime) {
        const newEnd = new Date(newEndTime);

        if (logId) {
          // TARGETED UPDATE: Only update the specific log segment
          await prisma.timeTrackingLog.update({
            where: { id: logId, timeTrackingId: id },
            data: { createdAt: newEnd }
          });
        } else {
          // BROAD TRUNCATION: Delete all logs strictly after the new end time (manual entries)
          await prisma.timeTrackingLog.deleteMany({
            where: {
              timeTrackingId: id,
              createdAt: { gt: newEnd }
            }
          });

          // Check if we need to close an open session
          const lastLog = await prisma.timeTrackingLog.findFirst({
            where: { timeTrackingId: id },
            orderBy: { createdAt: 'desc' }
          });

          if (lastLog && (lastLog.action === 'STARTED' || lastLog.action === 'RESUMED')) {
            await prisma.timeTrackingLog.create({
              data: {
                timeTrackingId: id,
                tenantId: req.tenantId,
                action: 'STOPPED',
                createdAt: newEnd
              }
            });
          }
        }
      }

      // If newStartTime changed, update the earliest log
      if (newStartTime) {
        const earliestLog = await prisma.timeTrackingLog.findFirst({
          where: { timeTrackingId: id },
          orderBy: { createdAt: 'asc' }
        });
        if (earliestLog) {
          await prisma.timeTrackingLog.update({
            where: { id: earliestLog.id },
            data: { createdAt: new Date(newStartTime) }
          });
        }
      }

      // Recalculate duration from all logs
      const allLogs = await prisma.timeTrackingLog.findMany({
        where: { timeTrackingId: id },
        orderBy: { createdAt: 'asc' }
      });

      let totalDuration = 0;
      let currentStart: Date | null = null;
      for (const log of allLogs) {
        if (log.action === 'STARTED' || log.action === 'RESUMED') {
          currentStart = log.createdAt;
        } else if ((log.action === 'PAUSED' || log.action === 'STOPPED') && currentStart) {
          totalDuration += Math.floor((log.createdAt.getTime() - currentStart.getTime()) / 1000);
          currentStart = null;
        }
      }
      duration = totalDuration;

      // Determine if we should update the overall entry endTime & status
      let shouldUpdateOverallEndTime = !!newEndTime;
      if (logId && newEndTime) {
        const latestLog = await prisma.timeTrackingLog.findFirst({
          where: { timeTrackingId: id },
          orderBy: { createdAt: 'desc' }
        });
        if (latestLog && latestLog.id !== logId) {
          shouldUpdateOverallEndTime = false;
        }
      }

      const updatedEntry = await prisma.timeTrackingEntry.update({
        where: { id },
        data: {
          ...(projectId !== undefined && { projectId: projectId || null }),
          ...(ticketId !== undefined && { ticketId: ticketId || null }),
          ...(description !== undefined && { description }),
          ...(billable !== undefined && { billable }),
          ...(billingRate !== undefined && { billingRate }),
          ...(newStartTime && { startTime: new Date(newStartTime) }),
          ...(shouldUpdateOverallEndTime && { endTime: new Date(newEndTime) }),
          ...(duration !== undefined && { duration }),
          ...(shouldUpdateOverallEndTime && { status: "MANUAL_UPDATED" })
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          ticket: { select: { id: true, title: true, ticketNumber: true } },
          logs: { orderBy: { createdAt: 'desc' } }
        }
      });

      res.status(200).json({ success: true, data: updatedEntry } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message } as ApiResponse);
    }
  }

  static async deleteEntry(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { id } = req.params;

      await prisma.timeTrackingEntry.delete({
        where: { id, tenantId: req.tenantId }
      });

      res.status(200).json({ success: true, message: "Entry deleted successfully" } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message } as ApiResponse);
    }
  }
}
