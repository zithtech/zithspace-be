// src/services/timeTrackingTimer.service.ts
//
// Cross-module helpers so attendance pause/resume can drive the work timer.
// Timers stay Prisma-backed; attendance is raw-SQL — these functions are the
// single bridge. `pauseSource` marks WHY a timer was paused so a later
// attendance-resume only revives the ones IT paused.

import { prisma } from "@/config/database";

const ENTRY_INCLUDE = {
  project: { select: { id: true, name: true, code: true } },
  ticket: { select: { id: true, title: true, ticketNumber: true, estimateHours: true } },
  user: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
  logs: { orderBy: { createdAt: "desc" as const } },
} as const;

/**
 * Pause every RUNNING timer for a user, tagging the pause source (default
 * "attendance"). Mirrors the manual pause duration calc. Returns the updated
 * entries (with relations) for socket broadcast.
 */
export async function pauseRunningTimersForUser(
  userId: string,
  tenantId: string,
  source: string = "attendance",
) {
  const running = await prisma.timeTrackingEntry.findMany({
    where: { userId, tenantId, status: "RUNNING" },
  });

  const updated: any[] = [];
  for (const entry of running) {
    const pauseTime = new Date();
    const lastLog = await prisma.timeTrackingLog.findFirst({
      where: { timeTrackingId: entry.id },
      orderBy: { createdAt: "desc" },
    });
    const lastActiveTime = lastLog ? lastLog.createdAt : entry.startTime;
    const additional = Math.floor((pauseTime.getTime() - lastActiveTime.getTime()) / 1000);
    const totalDuration = (entry.duration || 0) + additional;

    const u = await prisma.timeTrackingEntry.update({
      where: { id: entry.id },
      data: {
        status: "PAUSED",
        duration: totalDuration,
        pauseSource: source,
        pausedAt: pauseTime,
        logs: { create: { action: "PAUSED", tenantId } },
      },
      include: ENTRY_INCLUDE,
    });
    updated.push(u);
  }
  return updated;
}

/**
 * Resume only the timers that attendance itself paused (pauseSource =
 * "attendance"), clearing the marker. Returns the updated entries.
 */
export async function resumeAttendancePausedTimers(userId: string, tenantId: string) {
  // Only revive timers attendance paused TODAY — a stale break from a previous
  // day (e.g. the day was completed while paused) must never auto-resume.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const paused = await prisma.timeTrackingEntry.findMany({
    where: {
      userId,
      tenantId,
      status: "PAUSED",
      pauseSource: "attendance",
      pausedAt: { gte: startOfToday },
    },
  });

  const updated: any[] = [];
  for (const entry of paused) {
    const u = await prisma.timeTrackingEntry.update({
      where: { id: entry.id },
      data: {
        status: "RUNNING",
        pauseSource: null,
        pausedAt: null,
        logs: { create: { action: "RESUMED", tenantId } },
      },
      include: ENTRY_INCLUDE,
    });
    updated.push(u);
  }
  return updated;
}

/**
 * Detach attendance-paused timers WITHOUT resuming them — the user resumed their
 * day but chose to keep the work timer paused. Clearing the `attendance` marker
 * means a later attendance-resume won't revive these; only a manual resume will.
 * Returns the affected entries.
 */
export async function detachAttendancePausedTimers(userId: string, tenantId: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const paused = await prisma.timeTrackingEntry.findMany({
    where: {
      userId,
      tenantId,
      status: "PAUSED",
      pauseSource: "attendance",
      pausedAt: { gte: startOfToday },
    },
  });

  const updated: any[] = [];
  for (const entry of paused) {
    const u = await prisma.timeTrackingEntry.update({
      where: { id: entry.id },
      data: { pauseSource: null }, // stays PAUSED, just no longer attendance-driven
      include: ENTRY_INCLUDE,
    });
    updated.push(u);
  }
  return updated;
}

/**
 * Stop (finalize) every active timer for a user — used when the attendance day
 * is completed. RUNNING timers accrue the trailing time; PAUSED ones keep their
 * accumulated duration. Mirrors the manual stopTimer finalize. Returns the
 * stopped entries.
 */
export async function stopActiveTimersForUser(userId: string, tenantId: string) {
  const active = await prisma.timeTrackingEntry.findMany({
    where: { userId, tenantId, status: { in: ["RUNNING", "PAUSED"] } },
  });

  const updated: any[] = [];
  for (const entry of active) {
    const endTime = new Date();
    let additional = 0;
    if (entry.status === "RUNNING") {
      const lastLog = await prisma.timeTrackingLog.findFirst({
        where: { timeTrackingId: entry.id },
        orderBy: { createdAt: "desc" },
      });
      const lastActiveTime = lastLog ? lastLog.createdAt : entry.startTime;
      additional = Math.floor((endTime.getTime() - lastActiveTime.getTime()) / 1000);
    }
    const totalDuration = (entry.duration || 0) + additional;

    const u = await prisma.timeTrackingEntry.update({
      where: { id: entry.id },
      data: {
        status: "STOPPED",
        endTime,
        duration: totalDuration,
        pauseSource: null,
        pausedAt: null,
        logs: { create: { action: "STOPPED", tenantId } },
      },
      include: ENTRY_INCLUDE,
    });
    updated.push(u);
  }
  return updated;
}
