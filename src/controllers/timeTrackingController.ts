import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";
import { RBACService } from "@/modules/rbac/rbac.service";
import { Permissions } from "@/types/permissions";
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from "../utils/transactionHistory";

/**
 * Performance status tiers for tracked weekday hours (lower-inclusive, upper-exclusive).
 * `max: null` means "and above". Mirrors the Performance Tracker legend shown in the UI.
 */
const PERFORMANCE_TIERS: { label: string; min: number; max: number | null }[] = [
  { label: "Minimal Activity", min: 0, max: 3 },
  { label: "Low Activity", min: 3, max: 4.5 },
  { label: "Moderate Activity", min: 4.5, max: 6 },
  { label: "Expected Hours", min: 6, max: 7 },
  { label: "High Engagement", min: 7, max: 8 },
  { label: "Outstanding", min: 8, max: 9 },
  { label: "Exceptional", min: 9, max: 10 },
  { label: "Champion", min: 10, max: 11 },
  { label: "Elite Performer", min: 11, max: 12 },
  { label: "Power Contributor", min: 12, max: null },
];

/** Special status applied when a member tracks any time on a weekend day. */
const WEEKEND_STATUS: Record<string, string> = {
  Saturday: "Weekend Warrior",
  Sunday: "Weekend Warrior",
};

/**
 * Classify a day's tracked hours into a performance status label.
 * Weekend days with any tracked time get a dedicated weekend status regardless of hours.
 */
function classifyPerformance(hours: number, weekdayName: string): string {
  if (WEEKEND_STATUS[weekdayName]) {
    return WEEKEND_STATUS[weekdayName];
  }
  for (const tier of PERFORMANCE_TIERS) {
    if (hours >= tier.min && (tier.max === null || hours < tier.max)) {
      return tier.label;
    }
  }
  return PERFORMANCE_TIERS[0].label;
}

type PerfEntry = {
  id: string;
  startTime: Date;
  duration: number | null;
  status: string;
  logs?: { action: string; createdAt: Date }[];
};

/**
 * Port of the frontend `calculateNetDuration` so the Performance Tracker reports the
 * exact same net hours as the Team Tracking table. Entries started within `sessionWindowMs`
 * of each other are treated as one session (multi-ticket timers) to avoid double-counting.
 * Returns net seconds plus the number of distinct sessions (used for the Activity column).
 */
function computeNetDuration(
  entries: PerfEntry[],
  nowMs: number,
  sessionWindowMs = 5000
): { netSeconds: number; sessionCount: number } {
  if (!entries || entries.length === 0) return { netSeconds: 0, sessionCount: 0 };

  const sorted = [...entries].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  let totalNetSeconds = 0;
  let sessionCount = 0;
  const processedIds = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    if (processedIds.has(entry.id)) continue;

    const group = [entry];
    processedIds.add(entry.id);
    const baseStart = new Date(entry.startTime).getTime();

    for (let j = i + 1; j < sorted.length; j++) {
      const other = sorted[j];
      const otherStart = new Date(other.startTime).getTime();
      if (Math.abs(otherStart - baseStart) < sessionWindowMs) {
        group.push(other);
        processedIds.add(other.id);
      } else {
        break;
      }
    }

    sessionCount += 1;

    // 1. Max recorded duration across the simultaneous group
    totalNetSeconds += Math.max(...group.map((e) => e.duration || 0));

    // 2. Add live time once for any RUNNING entry in the group
    const runningEntries = group.filter(
      (e) => e.status === "RUNNING" && e.logs && e.logs.length > 0
    );
    if (runningEntries.length > 0) {
      let maxLiveSeconds = 0;
      runningEntries.forEach((re) => {
        const lastLog = [...(re.logs || [])].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
        if (lastLog && (lastLog.action === "STARTED" || lastLog.action === "RESUMED")) {
          const start = new Date(lastLog.createdAt).getTime();
          const live = Math.max(0, Math.floor((nowMs - start) / 1000));
          if (live > maxLiveSeconds) maxLiveSeconds = live;
        }
      });
      totalNetSeconds += maxLiveSeconds;
    }
  }

  return { netSeconds: totalNetSeconds, sessionCount };
}

/** Format seconds as "Xh Ym". */
function formatHoursMinutes(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

/** Validate an IANA timezone string; fall back to UTC if unsupported. */
function safeTimeZone(tz?: unknown): string {
  if (typeof tz === "string" && tz.trim()) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {
      // fall through to UTC
    }
  }
  return "UTC";
}

export class TimeTrackingController {

  static async getEntries(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { ticketId, projectId, userId, allUsers, startDate, endDate, page, limit } = req.query;

      const whereClause: any = { tenantId: req.tenantId };

      if (ticketId) {
        // Viewing specific ticket details: anyone who views a ticket should see all time entries for that ticket
        if (userId) {
          whereClause.userId = String(userId);
        }
      } else {
        // Global time tracking listing: enforce standard security permissions
        if (allUsers === 'true' || (userId && userId !== req.user.id)) {
          const canReadTeam = await RBACService.hasPermission(req.user.id, req.tenantId, Permissions.TIME_TRACKING_TEAM_READ);
          if (canReadTeam) {
            if (userId) whereClause.userId = String(userId);
          } else {
            whereClause.userId = req.user.id;
          }
        } else {
          whereClause.userId = req.user.id;
        }
      }

      if (ticketId) {
        whereClause.ticketId = String(ticketId);
      }

      if (projectId) {
        whereClause.projectId = String(projectId);
      }

      if (startDate || endDate) {
        whereClause.startTime = {};
        if (startDate) whereClause.startTime.gte = new Date(startDate as string);
        if (endDate) whereClause.startTime.lte = new Date(endDate as string);
      }

      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 0;

      const queryOptions: any = {
        where: whereClause,
        include: {
          project: { select: { id: true, name: true, code: true } },
          ticket: { select: { id: true, title: true, ticketNumber: true, estimateHours: true } },
          user: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
          logs: { orderBy: { createdAt: 'desc' } }
        },
        orderBy: { startTime: 'desc' }
      };

      if (limitNum > 0) {
        queryOptions.skip = (pageNum - 1) * limitNum;
        queryOptions.take = limitNum;
      }

      const entries = await prisma.timeTrackingEntry.findMany(queryOptions);

      let responsePayload: any = { success: true, serverTime: new Date().toISOString(), data: entries };

      if (limitNum > 0) {
        const total = await prisma.timeTrackingEntry.count({ where: whereClause });
        responsePayload.pagination = {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        };
      }

      res.status(200).json(responsePayload as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message } as ApiResponse);
    }
  }

  /**
   * Performance Tracker.
   * Aggregates tracked time per member, per day for a given project + members + date range,
   * and classifies each day into a performance status (with dedicated weekend statuses).
   * Day bucketing and weekend detection use the caller-supplied `timezone` (IANA, default UTC).
   *
   * Query params:
   *   - projectId  (optional) single project filter
   *   - userIds    (optional) comma-separated member ids; or `userId` for a single member
   *   - startDate / endDate (optional ISO) — filters by entry startTime
   *   - timezone   (optional IANA, e.g. "Asia/Kolkata") — day/weekend bucketing, default UTC
   */
  static async getPerformance(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { projectId, userId, userIds, startDate, endDate, timezone } = req.query;

      const whereClause: any = { tenantId: req.tenantId };

      // Members filter: userIds (comma-separated) takes precedence, else single userId.
      const memberIds = typeof userIds === "string" && userIds.trim()
        ? userIds.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      if (memberIds.length > 0) {
        whereClause.userId = { in: memberIds };
      } else if (userId) {
        whereClause.userId = String(userId);
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
          ticket: { select: { id: true, title: true, ticketNumber: true, estimateHours: true } },
          user: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
          logs: { orderBy: { createdAt: "desc" } },
        },
        orderBy: { startTime: "desc" },
      });

      const tz = safeTimeZone(timezone);
      const dateFmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" });
      const nowMs = Date.now();

      // Group entries by member + local calendar day.
      const groups = new Map<string, { userId: string; user: any; dateKey: string; weekday: string; entries: any[] }>();
      for (const entry of entries) {
        const start = new Date(entry.startTime);
        const dateKey = dateFmt.format(start); // YYYY-MM-DD in tz
        const weekday = weekdayFmt.format(start); // e.g. "Saturday"
        const key = `${entry.userId}_${dateKey}`;
        if (!groups.has(key)) {
          groups.set(key, { userId: entry.userId, user: entry.user, dateKey, weekday, entries: [] });
        }
        groups.get(key)!.entries.push(entry);
      }

      const rows = Array.from(groups.values()).map((g) => {
        const { netSeconds, sessionCount } = computeNetDuration(g.entries as PerfEntry[], nowMs);
        const hours = netSeconds / 3600;
        const isWeekend = g.weekday === "Saturday" || g.weekday === "Sunday";
        const status = classifyPerformance(hours, g.weekday);

        // Unique tickets worked on that day
        const ticketIds = new Set<string>();
        // Raw per-project breakdown (auxiliary; net hours above is authoritative)
        const projectMap = new Map<string, { projectId: string; projectName: string; seconds: number }>();
        for (const e of g.entries) {
          if (e.ticketId) ticketIds.add(e.ticketId);
          const pid = e.projectId || "none";
          const pname = e.project?.name || "No Project";
          if (!projectMap.has(pid)) projectMap.set(pid, { projectId: pid, projectName: pname, seconds: 0 });
          projectMap.get(pid)!.seconds += e.duration || 0;
        }

        return {
          userId: g.userId,
          user: g.user,
          date: g.dateKey,
          weekday: g.weekday,
          isWeekend,
          totalSeconds: netSeconds,
          totalHours: Number(hours.toFixed(2)),
          formattedDuration: formatHoursMinutes(netSeconds),
          status,
          sessionCount,
          ticketCount: ticketIds.size,
          projectBreakdown: Array.from(projectMap.values()).sort((a, b) => b.seconds - a.seconds),
          entries: g.entries,
        };
      });

      // Sort newest day first, then by member name for stable display.
      rows.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (a.user?.name || "").localeCompare(b.user?.name || "");
      });

      // Summary metrics for the info cards above the table.
      const memberSet = new Set(rows.map((r) => r.userId));
      const projectSet = new Set<string>();
      let totalSeconds = 0;
      for (const r of rows) {
        totalSeconds += r.totalSeconds;
        for (const p of r.projectBreakdown) if (p.projectId !== "none") projectSet.add(p.projectId);
      }
      const summary = {
        memberCount: memberSet.size,
        dayCount: rows.length,
        projectCount: projectSet.size,
        totalSeconds,
        totalHours: Number((totalSeconds / 3600).toFixed(2)),
        formattedTotal: formatHoursMinutes(totalSeconds),
        avgSecondsPerMember: memberSet.size ? Math.round(totalSeconds / memberSet.size) : 0,
      };

      // Legend so the UI renders the Hours → Status table from a single source of truth.
      const legend = {
        weekday: PERFORMANCE_TIERS.map((t) => ({
          label: t.label,
          minHours: t.min,
          maxHours: t.max,
        })),
        weekend: [
          { day: "Saturday", label: WEEKEND_STATUS.Saturday },
          { day: "Sunday", label: WEEKEND_STATUS.Sunday },
        ],
      };

      res.status(200).json({
        success: true,
        serverTime: new Date().toISOString(),
        data: { timezone: tz, summary, legend, rows },
      } as ApiResponse);
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
          ticket: { select: { id: true, title: true, ticketNumber: true, estimateHours: true } },
          user: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
          logs: { orderBy: { createdAt: 'desc' } }
        }
      });

      // ─── Activity log ───────────────────────────────────────────────
      if (newEntry) {
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.TIME_TRACKING,
          page: Page.TIME_TRACKING_MY,
          action: Action.CREATE,
          actionLabel: `Created manual time entry of ${Math.round((newEntry.duration || 0) / 60)} minutes`,
          entityType: EntityType.TIME_ENTRY,
          entityId: newEntry.id,
          entityLabel: newEntry.description || "Manual Time Entry",
          afterData: {
            projectId: newEntry.projectId,
            ticketId: newEntry.ticketId,
            description: newEntry.description,
            billable: newEntry.billable,
            billingRate: newEntry.billingRate,
            startTime: newEntry.startTime,
            endTime: newEntry.endTime,
            duration: newEntry.duration,
            status: newEntry.status,
          },
        });
      }

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
          ticket: { select: { id: true, title: true, ticketNumber: true, estimateHours: true } },
          user: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
          logs: { orderBy: { createdAt: 'desc' } }
        }
      });

      // ─── Activity log ───────────────────────────────────────────────
      if (newEntry) {
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.TIME_TRACKING,
          page: Page.TIME_TRACKING_MY,
          action: Action.START,
          actionLabel: `Started time tracking timer`,
          entityType: EntityType.TIME_ENTRY,
          entityId: newEntry.id,
          entityLabel: newEntry.description || "Timer",
          afterData: {
            projectId: newEntry.projectId,
            ticketId: newEntry.ticketId,
            description: newEntry.description,
            billable: newEntry.billable,
            billingRate: newEntry.billingRate,
            startTime: newEntry.startTime,
            status: newEntry.status,
          },
        });
      }

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
          pauseSource: "manual",
          pausedAt: pauseTime,
          logs: {
            create: { action: "PAUSED", tenantId: req.tenantId }
          }
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          ticket: { select: { id: true, title: true, ticketNumber: true, estimateHours: true } },
          user: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
          logs: { orderBy: { createdAt: 'desc' } }
        }
      });

      // ─── Activity log ───────────────────────────────────────────────
      if (updatedEntry) {
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.TIME_TRACKING,
          page: Page.TIME_TRACKING_MY,
          action: Action.UPDATE,
          actionLabel: `Paused time tracking timer`,
          entityType: EntityType.TIME_ENTRY,
          entityId: id,
          entityLabel: updatedEntry.description || "Timer",
          beforeData: {
            status: entry.status,
            duration: entry.duration,
          },
          afterData: {
            status: "PAUSED",
            duration: updatedEntry.duration,
          },
          changedFields: ["status", "duration"],
        });
      }

      res.status(200).json({ success: true, serverTime: new Date().toISOString(), data: updatedEntry } as ApiResponse);
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
          pauseSource: null,
          pausedAt: null,
          logs: {
            create: { action: "RESUMED", tenantId: req.tenantId }
          }
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          ticket: { select: { id: true, title: true, ticketNumber: true, estimateHours: true } },
          user: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
          logs: { orderBy: { createdAt: 'desc' } }
        }
      });

      // ─── Activity log ───────────────────────────────────────────────
      if (updatedEntry) {
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.TIME_TRACKING,
          page: Page.TIME_TRACKING_MY,
          action: Action.UPDATE,
          actionLabel: `Resumed time tracking timer`,
          entityType: EntityType.TIME_ENTRY,
          entityId: id,
          entityLabel: updatedEntry.description || "Timer",
          beforeData: {
            status: entry.status,
          },
          afterData: {
            status: "RUNNING",
          },
          changedFields: ["status"],
        });
      }

      res.status(200).json({ success: true, serverTime: new Date().toISOString(), data: updatedEntry } as ApiResponse);
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
      // Calculate detailed progress

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
          ticket: { select: { id: true, title: true, ticketNumber: true, estimateHours: true } },
          user: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
          logs: { orderBy: { createdAt: 'desc' } }
        }
      });

      // ─── Activity log ───────────────────────────────────────────────
      if (updatedEntry) {
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.TIME_TRACKING,
          page: Page.TIME_TRACKING_MY,
          action: Action.COMPLETE,
          actionLabel: `Stopped time tracking timer (Logged ${Math.round((updatedEntry.duration || 0) / 60)} minutes)`,
          entityType: EntityType.TIME_ENTRY,
          entityId: id,
          entityLabel: updatedEntry.description || "Timer",
          beforeData: {
            status: entry.status,
            endTime: entry.endTime,
            duration: entry.duration,
          },
          afterData: {
            status: "STOPPED",
            endTime: updatedEntry.endTime,
            duration: updatedEntry.duration,
          },
          changedFields: ["status", "endTime", "duration"],
        });
      }

      res.status(200).json({ success: true, serverTime: new Date().toISOString(), data: updatedEntry } as ApiResponse);
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
          ticket: { select: { id: true, title: true, ticketNumber: true, estimateHours: true } },
          user: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
          logs: { orderBy: { createdAt: 'desc' } }
        }
      });

      // ─── Activity log ───────────────────────────────────────────────
      if (entry && updatedEntry) {
        const beforeSnap = {
          projectId: entry.projectId,
          ticketId: entry.ticketId,
          description: entry.description,
          billable: entry.billable,
          billingRate: entry.billingRate,
          startTime: entry.startTime,
          endTime: entry.endTime,
          duration: entry.duration,
          status: entry.status,
        };
        const afterSnap = {
          projectId: updatedEntry.projectId,
          ticketId: updatedEntry.ticketId,
          description: updatedEntry.description,
          billable: updatedEntry.billable,
          billingRate: updatedEntry.billingRate,
          startTime: updatedEntry.startTime,
          endTime: updatedEntry.endTime,
          duration: updatedEntry.duration,
          status: updatedEntry.status,
        };
        const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);

        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.TIME_TRACKING,
          page: Page.TIME_TRACKING_MY,
          action: Action.UPDATE,
          actionLabel: `Updated time tracking entry`,
          entityType: EntityType.TIME_ENTRY,
          entityId: id,
          entityLabel: updatedEntry.description || "Time Entry",
          beforeData: before,
          afterData: after,
          changedFields,
        });
      }

      res.status(200).json({ success: true, serverTime: new Date().toISOString(), data: updatedEntry } as ApiResponse);
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

      const entry = await prisma.timeTrackingEntry.findUnique({
        where: { id, tenantId: req.tenantId }
      });

      if (!entry) {
        res.status(404).json({ success: false, error: "Entry not found" } as ApiResponse);
        return;
      }

      await prisma.timeTrackingEntry.delete({
        where: { id, tenantId: req.tenantId }
      });

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.TIME_TRACKING,
        page: Page.TIME_TRACKING_MY,
        action: Action.DELETE,
        actionLabel: `Deleted time tracking entry`,
        entityType: EntityType.TIME_ENTRY,
        entityId: id,
        entityLabel: entry.description || "Time Entry",
      });

      res.status(200).json({ success: true, serverTime: new Date().toISOString(), message: "Entry deleted successfully" } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message } as ApiResponse);
    }
  }
}
