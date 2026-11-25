import { Response } from "express";
import { AuthRequest, ApiResponse } from "@/types";
import { RBACService } from "@/modules/rbac/rbac.service";
import { Permissions } from "@/types/permissions";
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from "../utils/transactionHistory";
import {
  getTimeTrackingEntries,
  getTimeTrackingEntryById,
  createManualTimeEntry,
  startTimerEntry,
  pauseTimerEntry,
  resumeTimerEntry,
  stopTimerEntry,
  updateTimeTrackingEntry,
  deleteTimeTrackingEntry,
  TimeTrackingEntry,
} from "@/models/timeTracking.model";

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

      let filterUserId: string | undefined = req.user.id;

      if (ticketId) {
        // Viewing specific ticket details: anyone who views a ticket should see all time entries for that ticket
        if (userId) {
          filterUserId = String(userId);
        } else {
          filterUserId = undefined;
        }
      } else {
        // Global time tracking listing: enforce standard security permissions
        if (allUsers === 'true' || (userId && userId !== req.user.id)) {
          const canReadTeam = await RBACService.hasPermission(req.user.id, req.tenantId, Permissions.TIME_TRACKING_TEAM_READ);
          if (canReadTeam) {
            if (userId) filterUserId = String(userId);
            else filterUserId = undefined;
          } else {
            filterUserId = req.user.id;
          }
        } else {
          filterUserId = req.user.id;
        }
      }

      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 0;

      const { entries, total } = await getTimeTrackingEntries({
        tenantId: req.tenantId,
        userId: filterUserId,
        ticketId: ticketId ? String(ticketId) : undefined,
        projectId: projectId ? String(projectId) : undefined,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
        page: pageNum,
        limit: limitNum,
      });

      let responsePayload: any = { success: true, serverTime: new Date().toISOString(), data: entries };

      if (limitNum > 0 && total !== undefined) {
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

      // Members filter: userIds (comma-separated) takes precedence, else single userId.
      const memberIds = typeof userIds === "string" && userIds.trim()
        ? userIds.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      const { entries } = await getTimeTrackingEntries({
        tenantId: req.tenantId,
        userId: memberIds.length === 0 && userId ? String(userId) : undefined,
        userIds: memberIds.length > 0 ? memberIds : undefined,
        projectId: projectId ? String(projectId) : undefined,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
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
          groups.set(key, {
            userId: entry.userId,
            user: entry.user,
            dateKey,
            weekday,
            entries: [],
          });
        }
        groups.get(key)!.entries.push(entry);
      }

      const rows: any[] = [];
      for (const group of Array.from(groups.values())) {
        const { netSeconds, sessionCount } = computeNetDuration(group.entries, nowMs);
        const hours = netSeconds / 3600;
        const status = classifyPerformance(hours, group.weekday);

        const projectBreakdownMap = new Map<string, { projectId: string; projectName: string; entries: any[] }>();
        for (const e of group.entries) {
          const pId = e.projectId || "none";
          const pName = e.project?.name || "No Project";
          if (!projectBreakdownMap.has(pId)) {
            projectBreakdownMap.set(pId, { projectId: pId, projectName: pName, entries: [] });
          }
          projectBreakdownMap.get(pId)!.entries.push(e);
        }

        const projectBreakdown = Array.from(projectBreakdownMap.values())
          .map((pb) => ({
            projectId: pb.projectId,
            projectName: pb.projectName,
            seconds: computeNetDuration(pb.entries, nowMs).netSeconds,
          }))
          .sort((a, b) => b.seconds - a.seconds);

        const uniqueTickets = new Set(group.entries.map((e) => e.ticketId).filter(Boolean)).size;

        rows.push({
          id: `${group.userId}_${group.dateKey}`,
          userId: group.userId,
          user: group.user,
          date: group.dateKey,
          weekday: group.weekday,
          totalSeconds: netSeconds,
          formattedDuration: formatHoursMinutes(netSeconds),
          status,
          ticketCount: uniqueTickets,
          sessionCount,
          projectBreakdown,
          entries: group.entries,
        });
      }

      rows.sort((a, b) => {
        const d = b.date.localeCompare(a.date);
        if (d !== 0) return d;
        return b.totalSeconds - a.totalSeconds;
      });

      const legend = {
        tiers: PERFORMANCE_TIERS,
        weekend: WEEKEND_STATUS,
      };

      res.status(200).json({
        success: true,
        serverTime: new Date().toISOString(),
        timezone: tz,
        data: { rows, legend },
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

      const { projectId, ticketId, description, billable, billingRate, startTime, endTime, userId, meetingType } = req.body;
      const targetUserId = userId || req.user.id;

      if (!startTime || !endTime) {
        res.status(400).json({ success: false, error: "Start and End times are required" } as ApiResponse);
        return;
      }

      const start = new Date(startTime);
      const end = new Date(endTime);
      const duration = Math.floor((end.getTime() - start.getTime()) / 1000);

      const newEntry = await createManualTimeEntry({
        tenantId: req.tenantId,
        userId: targetUserId,
        projectId: projectId || null,
        ticketId: ticketId || null,
        meetingType: meetingType || null,
        description,
        billable: billable || false,
        billingRate: billingRate || null,
        startTime: start,
        endTime: end,
        duration,
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
            meetingType: newEntry.meetingType,
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

      const { projectId, ticketId, description, billable, billingRate, meetingType } = req.body;

      const newEntry = await startTimerEntry({
        tenantId: req.tenantId,
        userId: req.user.id,
        projectId: projectId || null,
        ticketId: ticketId || null,
        meetingType: meetingType || null,
        description,
        billable: billable || false,
        billingRate: billingRate || null,
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
            meetingType: newEntry.meetingType,
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

      const entry = await getTimeTrackingEntryById(id, req.tenantId);
      if (!entry || entry.status !== "RUNNING") {
        res.status(400).json({ success: false, error: "Timer is not RUNNING." } as ApiResponse);
        return;
      }

      const updatedEntry = await pauseTimerEntry(id, req.tenantId);

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

      const entry = await getTimeTrackingEntryById(id, req.tenantId);
      if (!entry || entry.status !== "PAUSED") {
        res.status(400).json({ success: false, error: "Timer is not PAUSED." } as ApiResponse);
        return;
      }

      const updatedEntry = await resumeTimerEntry(id, req.tenantId);

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

      const entry = await getTimeTrackingEntryById(id, req.tenantId);
      if (!entry || entry.status === "STOPPED") {
        res.status(400).json({ success: false, error: "No active timer found with this ID." } as ApiResponse);
        return;
      }

      const updatedEntry = await stopTimerEntry(id, req.tenantId);

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
      const { projectId, ticketId, description, billable, billingRate, startTime, endTime, logId, meetingType } = req.body;

      const entry = await getTimeTrackingEntryById(id, req.tenantId);
      if (!entry) {
        res.status(404).json({ success: false, error: "Entry not found" } as ApiResponse);
        return;
      }

      const updatedEntry = await updateTimeTrackingEntry(id, req.tenantId, {
        projectId,
        ticketId,
        meetingType,
        description,
        billable,
        billingRate,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        logId,
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

      const entry = await deleteTimeTrackingEntry(id, req.tenantId);
      if (!entry) {
        res.status(404).json({ success: false, error: "Entry not found" } as ApiResponse);
        return;
      }

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
