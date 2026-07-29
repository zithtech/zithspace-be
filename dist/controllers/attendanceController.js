"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttendanceController = void 0;
const transactionHistory_1 = require("@/utils/transactionHistory");
const crypto_1 = require("crypto");
const types_1 = require("@/types");
const rbac_service_1 = require("@/modules/rbac/rbac.service");
const permissions_1 = require("@/types/permissions");
const socketService_1 = require("@/services/socketService");
const attendancePool_1 = require("@/db/attendancePool");
const geolocation_1 = require("@/utils/geolocation");
const timeTrackingTimer_service_1 = require("@/services/timeTrackingTimer.service");
// ─────────────────────────────────────────────────────────────────────────────
// Raw-SQL helpers
//
// Attendance is a pure raw-SQL module (mirrors leave-v2). Every data op runs
// through `withTenant()` (transaction-local tenant GUC) and every query filters
// `tenant_id = $1` explicitly. Columns are aliased to camelCase so rows map
// straight onto the response shapes the frontend already consumes.
// ─────────────────────────────────────────────────────────────────────────────
// Core attendance columns (camelCase aliased).
const A_COLS = `
  a.id, a.tenant_id AS "tenantId", a.user_id AS "userId", a.date,
  a.clock_in AS "clockIn", a.clock_out AS "clockOut", a.status,
  a.shift_id AS "shiftId", a.total_work_minutes AS "totalWorkMinutes",
  a.total_break_minutes AS "totalBreakMinutes", a.effective_work_minutes AS "effectiveWorkMinutes",
  a.overtime_minutes AS "overtimeMinutes", a.late_minutes AS "lateMinutes",
  a.is_manual_entry AS "isManualEntry", a.entered_by_id AS "enteredById",
  a.notes, a.created_at AS "createdAt", a.updated_at AS "updatedAt"
`;
// Member (user + position) columns, prefixed so the mapper can lift them out.
const MEMBER_COLS = `
  u.id AS m_id, u.name AS m_name, u.work_email AS m_work_email, u.avatar_url AS m_avatar_url,
  p.id AS p_id, p.title AS p_title, p.code AS p_code
`;
const MEMBER_JOINS = `
  FROM attendance a
  LEFT JOIN users u ON u.id = a.user_id
  LEFT JOIN positions p ON p.id = u.position_id
`;
/** Lift the member/position alias columns out of a row into the nested shape. */
function rowToAttendance(r) {
    const { m_id, m_name, m_work_email, m_avatar_url, p_id, p_title, p_code, ...rest } = r;
    return {
        ...rest,
        member: m_id
            ? {
                id: m_id,
                name: m_name,
                workEmail: m_work_email,
                avatarUrl: m_avatar_url,
                position: p_id ? { id: p_id, title: p_title, code: p_code } : null,
            }
            : null,
    };
}
/** The geolocation captured at session start, or null when none was recorded. */
function sessionLocation(s) {
    if (s.clock_in_latitude == null || s.clock_in_longitude == null)
        return null;
    return {
        latitude: s.clock_in_latitude,
        longitude: s.clock_in_longitude,
        accuracy: s.clock_in_accuracy ?? null,
        address: s.clock_in_address ?? null,
    };
}
function mapSession(s) {
    return {
        id: s.id,
        clockIn: s.clock_in,
        clockOut: s.clock_out || null,
        workMinutes: s.work_minutes || 0,
        breakType: s.break_type ?? null,
        breakReason: s.break_reason ?? null,
        location: sessionLocation(s),
    };
}
/** Start/end-of-day bounds for a date. */
function dayBounds(d) {
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    return [start, end];
}
class AttendanceController {
    /**
     * Get all attendance records with filtering and pagination (tenant-aware)
     */
    static async getAttendance(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { page = 1, limit = 20, userId, member, date, status, startDate, endDate, search, projectId, sortBy = "date", sortOrder = "desc", } = req.query;
            let targetUserId = (userId || member);
            // RBAC: users without a management permission only see their own records.
            const userPerms = await rbac_service_1.RBACService.getUserPermissions(req.user.id, req.tenantId, req.user.role);
            const hasManagementPerm = [
                permissions_1.Permissions.ATTENDANCE_READ,
                permissions_1.Permissions.ATTENDANCE_CREATE,
                permissions_1.Permissions.ATTENDANCE_UPDATE,
                permissions_1.Permissions.ATTENDANCE_DELETE,
            ].some((p) => userPerms.has(p));
            if (req.user.role !== "super_admin" && !hasManagementPerm) {
                targetUserId = req.user.id;
            }
            // Build the WHERE clause incrementally.
            const where = ["a.tenant_id = $1"];
            const params = [req.tenantId];
            let i = 1;
            if (targetUserId) {
                params.push(targetUserId);
                where.push(`a.user_id = $${++i}`);
            }
            if (status) {
                params.push(status);
                where.push(`a.status = $${++i}`);
            }
            if (date) {
                const [s, e] = dayBounds(new Date(date));
                params.push(s);
                where.push(`a.date >= $${++i}`);
                params.push(e);
                where.push(`a.date <= $${++i}`);
            }
            else if (startDate && endDate) {
                params.push(new Date(startDate));
                where.push(`a.date >= $${++i}`);
                params.push(new Date(endDate));
                where.push(`a.date <= $${++i}`);
            }
            if (search) {
                params.push(`%${search}%`);
                where.push(`u.name ILIKE $${++i}`);
            }
            if (projectId) {
                params.push(projectId);
                where.push(`EXISTS (SELECT 1 FROM project_members pm WHERE pm.user_id = a.user_id AND pm.project_id = $${++i})`);
            }
            const whereSql = where.join(" AND ");
            // Whitelisted sort column (never interpolate raw user input).
            const sortCol = { date: "a.date", clockIn: "a.clock_in", status: "a.status", createdAt: "a.created_at" }[sortBy] || "a.date";
            const dir = sortOrder === "asc" ? "ASC" : "DESC";
            const lim = Number(limit);
            const off = (Number(page) - 1) * lim;
            const { data, total } = await (0, attendancePool_1.withTenant)(req.tenantId, async (db) => {
                var _a;
                const listSql = `
          SELECT ${A_COLS}, ${MEMBER_COLS}
          ${MEMBER_JOINS}
          WHERE ${whereSql}
          ORDER BY ${sortCol} ${dir}, a.created_at DESC
          LIMIT $${i + 1} OFFSET $${i + 2}
        `;
                const { rows } = await db.query(listSql, [...params, lim, off]);
                const { rows: cntRows } = await db.query(`SELECT COUNT(*)::int AS total ${MEMBER_JOINS} WHERE ${whereSql}`, params);
                const total = cntRows[0]?.total ?? 0;
                // Attach each day's work sessions for the expandable child rows.
                const ids = rows.map((r) => r.id);
                const sessionsByAttendance = {};
                if (ids.length) {
                    const { rows: srows } = await db.query(`SELECT id, attendance_id, clock_in, clock_out, work_minutes, break_type, break_reason,
                    clock_in_latitude, clock_in_longitude, clock_in_accuracy, clock_in_address
             FROM attendance_sessions WHERE attendance_id = ANY($1) ORDER BY clock_in ASC`, [ids]);
                    for (const s of srows) {
                        (sessionsByAttendance[_a = s.attendance_id] || (sessionsByAttendance[_a] = [])).push(mapSession(s));
                    }
                }
                const data = rows.map((r) => {
                    const att = rowToAttendance(r);
                    let sessions = sessionsByAttendance[att.id] || [];
                    if (sessions.length === 0 && att.clockIn) {
                        sessions = [
                            {
                                id: null,
                                clockIn: att.clockIn,
                                clockOut: att.clockOut || null,
                                workMinutes: att.effectiveWorkMinutes || 0,
                                breakType: null,
                                breakReason: null,
                                location: null,
                            },
                        ];
                    }
                    return { ...att, sessions };
                });
                return { data, total };
            });
            const totalPages = Math.ceil(total / lim);
            res.status(200).json({
                success: true,
                data,
                pagination: {
                    page: Number(page),
                    limit: lim,
                    total,
                    pages: totalPages,
                    hasNext: Number(page) < totalPages,
                    hasPrev: Number(page) > 1,
                },
            });
        }
        catch (error) {
            console.error("Get attendance error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch attendance records",
            });
        }
    }
    /**
     * Get attendance record by ID (tenant-aware)
     */
    static async getAttendanceById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const record = await (0, attendancePool_1.withTenant)(req.tenantId, async (db) => {
                const { rows } = await db.query(`SELECT ${A_COLS}, ${MEMBER_COLS} ${MEMBER_JOINS} WHERE a.id = $1 AND a.tenant_id = $2 LIMIT 1`, [id, req.tenantId]);
                return rows[0] ? rowToAttendance(rows[0]) : null;
            });
            // RBAC: ownership check for users without a management permission.
            const userPerms = await rbac_service_1.RBACService.getUserPermissions(req.user.id, req.tenantId, req.user.role);
            const hasManagementPerm = [
                permissions_1.Permissions.ATTENDANCE_READ,
                permissions_1.Permissions.ATTENDANCE_CREATE,
                permissions_1.Permissions.ATTENDANCE_UPDATE,
                permissions_1.Permissions.ATTENDANCE_DELETE,
            ].some((p) => userPerms.has(p));
            if (req.user.role !== "super_admin" && !hasManagementPerm) {
                if (record?.userId !== req.user.id) {
                    res.status(403).json({
                        success: false,
                        error: "Access denied. You can only view your own records.",
                    });
                    return;
                }
            }
            if (!record) {
                res.status(404).json({
                    success: false,
                    error: "Attendance record not found",
                });
                return;
            }
            res.status(200).json({ success: true, data: record });
        }
        catch (error) {
            console.error("Get attendance by ID error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch attendance record",
            });
        }
    }
    /**
     * Clock in (tenant-aware) — opens a new work session.
     */
    static async clockIn(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { userId: targetUserId } = req.body;
            const userId = targetUserId || req.user.id;
            const today = new Date();
            const [startOfToday, endOfToday] = dayBounds(today);
            const formatted = await (0, attendancePool_1.withTenant)(req.tenantId, async (db) => {
                const { rows: exRows } = await db.query(`SELECT id, user_id AS "userId", clock_in AS "clockIn", clock_out AS "clockOut", date
           FROM attendance WHERE user_id = $1 AND tenant_id = $2 ORDER BY clock_in DESC NULLS LAST LIMIT 1`, [userId, req.tenantId]);
                const existing = exRows[0] || null;
                let existingIsToday = false;
                if (existing) {
                    existingIsToday = existing.date && new Date(existing.date).getTime() >= startOfToday.getTime() && new Date(existing.date).getTime() <= endOfToday.getTime();
                    if (existing.clockOut) {
                        if (existingIsToday) {
                            throw new types_1.ValidationError("You have already completed today. You can't clock in again.");
                        }
                        // If it's a completed past session, allow a new clock in for today
                    }
                    else {
                        const open = await AttendanceController.getOpenSession(db, existing);
                        if (open)
                            throw new types_1.ValidationError("You're already clocked in.");
                    }
                }
                const { rows: uRows } = await db.query(`SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true LIMIT 1`, [userId, req.tenantId]);
                if (!uRows[0])
                    throw new types_1.NotFoundError("User not found in this tenant");
                const now = new Date();
                let attendanceId;
                // Reuse the record ONLY if it belongs to today and isn't closed yet.
                // Wait, if it's not closed and belongs to today, it will have thrown "already clocked in".
                // Wait, what if existing is NOT today, but it doesn't have an open session somehow?
                // Let's just safely reuse it if existingIsToday is true and it's not closed.
                if (!existingIsToday || existing.clockOut) {
                    attendanceId = (0, crypto_1.randomUUID)();
                    await db.query(`INSERT INTO attendance (id, tenant_id, user_id, date, clock_in, status, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'present', now())`, [attendanceId, req.tenantId, userId, startOfToday, now]);
                }
                else {
                    attendanceId = existing.id;
                    if (!existing.clockIn) {
                        await db.query(`UPDATE attendance SET clock_in = $1, status = 'present', updated_at = now() WHERE id = $2`, [now, attendanceId]);
                    }
                }
                // Open a new work session for this clock-in, recording where it started.
                const loc = await (0, geolocation_1.resolveClockInLocation)(req.body);
                await db.query(`INSERT INTO attendance_sessions
             (attendance_id, clock_in, clock_in_latitude, clock_in_longitude, clock_in_accuracy, clock_in_address)
           VALUES ($1, $2, $3, $4, $5, $6)`, [attendanceId, now, loc.latitude, loc.longitude, loc.accuracy, loc.address]);
                return await AttendanceController.getFormattedTodayAttendance(db, userId, req.tenantId, today);
            });
            socketService_1.socketService.emitToTenant(req.tenantId, "attendance:updated", formatted);
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.HR,
                module: transactionHistory_1.Module.ATTENDANCE,
                page: transactionHistory_1.Page.ATTENDANCE_DASHBOARD,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Clocked in for ${formatted?.member?.name || req.user.name}`,
                entityType: transactionHistory_1.EntityType.ATTENDANCE_RECORD,
                entityId: formatted?.id,
                afterData: formatted,
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                data: formatted,
                message: "Clocked in successfully",
            });
        }
        catch (error) {
            console.error("Clock in error:", error);
            if (error instanceof types_1.ValidationError || error instanceof types_1.NotFoundError) {
                res.status(error instanceof types_1.NotFoundError ? 404 : 400).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({ success: false, error: "Failed to clock in" });
        }
    }
    /**
     * Clock out (tenant-aware) — finalizes the day.
     */
    static async clockOut(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { userId: targetUserId } = req.body;
            const userId = targetUserId || req.user.id;
            const today = new Date();
            const [startOfToday, endOfToday] = dayBounds(today);
            const formatted = await (0, attendancePool_1.withTenant)(req.tenantId, async (db) => {
                const { rows } = await db.query(`SELECT id, clock_in AS "clockIn", clock_out AS "clockOut"
           FROM attendance WHERE user_id = $1 AND tenant_id = $2 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`, [userId, req.tenantId]);
                const attendance = rows[0] || null;
                if (!attendance || !attendance.clockIn) {
                    throw new types_1.ValidationError("No active attendance record found.");
                }
                await AttendanceController.finalizeDay(db, attendance);
                return await AttendanceController.getFormattedTodayAttendance(db, userId, req.tenantId, today);
            });
            // Day over → stop any active timers.
            try {
                const stopped = await (0, timeTrackingTimer_service_1.stopActiveTimersForUser)(userId, req.tenantId);
                if (stopped.length) {
                    socketService_1.socketService.emitToTenant(req.tenantId, "TIMER_ATTENDANCE_STOPPED", {
                        userId,
                        entries: stopped,
                    });
                }
            }
            catch (timerErr) {
                console.error("[attendance] timer stop failed:", timerErr);
            }
            socketService_1.socketService.emitToTenant(req.tenantId, "attendance:updated", formatted);
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.HR,
                module: transactionHistory_1.Module.ATTENDANCE,
                page: transactionHistory_1.Page.ATTENDANCE_DASHBOARD,
                action: transactionHistory_1.Action.UPDATE,
                actionLabel: `Clocked out for ${formatted?.member?.name || req.user.name}`,
                entityType: transactionHistory_1.EntityType.ATTENDANCE_RECORD,
                entityId: formatted?.id,
                afterData: formatted,
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                data: formatted,
                message: "Clocked out successfully",
            });
        }
        catch (error) {
            console.error("Clock out error:", error);
            if (error instanceof types_1.ValidationError || error instanceof types_1.NotFoundError) {
                res.status(error instanceof types_1.NotFoundError ? 404 : 400).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({ success: false, error: "Failed to clock out" });
        }
    }
    /** Pause the day — closes the currently open work session (a break begins). */
    static async pause(req, res) {
        await AttendanceController.runSessionAction(req, res, "pause");
    }
    /** Resume the day — opens a new work session after a break. */
    static async resume(req, res) {
        await AttendanceController.runSessionAction(req, res, "resume");
    }
    /** Complete the day — closes any open session and finalizes totals. */
    static async complete(req, res) {
        await AttendanceController.runSessionAction(req, res, "complete");
    }
    /** Shared driver for the pause / resume / complete session actions. */
    static async runSessionAction(req, res, action) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { userId: targetUserId, breakType, reason, resumeTimers } = req.body;
            const userId = targetUserId || req.user.id;
            const today = new Date();
            const [startOfToday, endOfToday] = dayBounds(today);
            const formatted = await (0, attendancePool_1.withTenant)(req.tenantId, async (db) => {
                const { rows } = await db.query(`SELECT id, clock_in AS "clockIn", clock_out AS "clockOut"
           FROM attendance WHERE user_id = $1 AND tenant_id = $2 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`, [userId, req.tenantId]);
                const attendance = rows[0] || null;
                if (!attendance || !attendance.clockIn) {
                    throw new types_1.ValidationError("No active attendance session found.");
                }
                let now = new Date();
                const MAX_SHIFT_HOURS = 24;
                const clockInTime = new Date(attendance.clockIn).getTime();
                if (now.getTime() - clockInTime > MAX_SHIFT_HOURS * 60 * 60 * 1000) {
                    now = new Date(clockInTime + MAX_SHIFT_HOURS * 60 * 60 * 1000);
                }
                if (action === "pause") {
                    const open = await AttendanceController.getOpenSession(db, attendance);
                    if (!open)
                        throw new types_1.ValidationError("There's no active session to pause.");
                    await AttendanceController.closeSession(db, open, now, {
                        breakType: breakType || "break",
                        reason: reason || null,
                    });
                    await AttendanceController.recompute(db, attendance.id);
                }
                else if (action === "resume") {
                    const open = await AttendanceController.getOpenSession(db, attendance);
                    if (open)
                        throw new types_1.ValidationError("You're already clocked in.");
                    const loc = await (0, geolocation_1.resolveClockInLocation)(req.body);
                    await db.query(`INSERT INTO attendance_sessions
               (attendance_id, clock_in, clock_in_latitude, clock_in_longitude, clock_in_accuracy, clock_in_address)
             VALUES ($1, $2, $3, $4, $5, $6)`, [attendance.id, now, loc.latitude, loc.longitude, loc.accuracy, loc.address]);
                }
                else {
                    await AttendanceController.finalizeDay(db, attendance);
                }
                return await AttendanceController.getFormattedTodayAttendance(db, userId, req.tenantId, today);
            });
            // Super-flow: keep the work timer in lock-step with the break. Pausing the
            // day pauses any running timer (tagged "attendance"); resuming the day
            // revives only the timers attendance itself paused. Non-fatal on error.
            try {
                if (action === "pause") {
                    const paused = await (0, timeTrackingTimer_service_1.pauseRunningTimersForUser)(userId, req.tenantId);
                    if (paused.length) {
                        socketService_1.socketService.emitToTenant(req.tenantId, "TIMER_ATTENDANCE_PAUSED", {
                            userId,
                            entries: paused,
                        });
                    }
                }
                else if (action === "resume") {
                    // The client decides whether the work timer comes back with the day.
                    // Default true keeps the original lock-step behaviour; false leaves the
                    // timer paused (just detaches it so it won't auto-resume later).
                    if (resumeTimers === false) {
                        await (0, timeTrackingTimer_service_1.detachAttendancePausedTimers)(userId, req.tenantId);
                    }
                    else {
                        const resumed = await (0, timeTrackingTimer_service_1.resumeAttendancePausedTimers)(userId, req.tenantId);
                        if (resumed.length) {
                            socketService_1.socketService.emitToTenant(req.tenantId, "TIMER_ATTENDANCE_RESUMED", {
                                userId,
                                entries: resumed,
                            });
                        }
                    }
                }
                else if (action === "complete") {
                    // Day over → stop any active timers.
                    const stopped = await (0, timeTrackingTimer_service_1.stopActiveTimersForUser)(userId, req.tenantId);
                    if (stopped.length) {
                        socketService_1.socketService.emitToTenant(req.tenantId, "TIMER_ATTENDANCE_STOPPED", {
                            userId,
                            entries: stopped,
                        });
                    }
                }
            }
            catch (timerErr) {
                console.error("[attendance] timer sync failed:", timerErr);
            }
            socketService_1.socketService.emitToTenant(req.tenantId, "attendance:updated", formatted);
            res.status(200).json({
                success: true,
                data: formatted,
                message: action === "pause" ? "Paused" : action === "resume" ? "Resumed" : "Day completed",
            });
        }
        catch (error) {
            console.error(`Attendance ${action} error:`, error);
            if (error instanceof types_1.ValidationError || error instanceof types_1.NotFoundError) {
                res.status(error instanceof types_1.NotFoundError ? 404 : 400).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({ success: false, error: `Failed to ${action}` });
        }
    }
    /**
     * Returns the currently open session for a day, backfilling one from a legacy
     * `clockIn` when no session rows exist yet (normalizes old records).
     */
    static async getOpenSession(db, attendance) {
        const { rows } = await db.query(`SELECT id, attendance_id, clock_in AS "clockIn", clock_out AS "clockOut"
       FROM attendance_sessions WHERE attendance_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`, [attendance.id]);
        if (rows[0])
            return rows[0];
        const { rows: cnt } = await db.query(`SELECT COUNT(*)::int AS c FROM attendance_sessions WHERE attendance_id = $1`, [attendance.id]);
        if (cnt[0].c === 0 && attendance.clockIn && !attendance.clockOut) {
            const { rows: ins } = await db.query(`INSERT INTO attendance_sessions (attendance_id, clock_in) VALUES ($1, $2)
         RETURNING id, attendance_id, clock_in AS "clockIn", clock_out AS "clockOut"`, [attendance.id, attendance.clockIn]);
            return ins[0];
        }
        return null;
    }
    /** Closes a session, stores its worked minutes and an optional break. */
    static async closeSession(db, session, endTime, breakInfo) {
        const minutes = Math.max(0, Math.floor((endTime.getTime() - new Date(session.clockIn).getTime()) / 60000));
        if (breakInfo) {
            await db.query(`UPDATE attendance_sessions
         SET clock_out = $1, work_minutes = $2, break_type = $3, break_reason = $4, updated_at = $1
         WHERE id = $5`, [endTime, minutes, breakInfo.breakType ?? null, breakInfo.reason ?? null, session.id]);
        }
        else {
            await db.query(`UPDATE attendance_sessions SET clock_out = $1, work_minutes = $2, updated_at = $1 WHERE id = $3`, [endTime, minutes, session.id]);
        }
        return minutes;
    }
    /** Recomputes day totals from closed sessions (effective / break / span). */
    static async recompute(db, attendanceId) {
        const { rows: sessions } = await db.query(`SELECT clock_in AS "clockIn", clock_out AS "clockOut", work_minutes AS "workMinutes"
       FROM attendance_sessions WHERE attendance_id = $1 ORDER BY clock_in ASC`, [attendanceId]);
        const closed = sessions.filter((s) => s.clockOut);
        const effective = closed.reduce((a, s) => a + (s.workMinutes || 0), 0);
        let span = 0;
        if (closed.length) {
            const first = new Date(closed[0].clockIn).getTime();
            const last = new Date(closed[closed.length - 1].clockOut).getTime();
            span = Math.max(0, Math.floor((last - first) / 60000));
        }
        const breaks = Math.max(0, span - effective);
        await db.query(`UPDATE attendance SET effective_work_minutes = $1, total_break_minutes = $2, total_work_minutes = $3, updated_at = now() WHERE id = $4`, [effective, breaks, span, attendanceId]);
    }
    /**
     * Replaces a day's entire work timeline with the given sessions and recomputes
     * totals + day bounds. Each session is one WORK interval; `breakType`/`reason`
     * describe the break that FOLLOWS it (the gap to the next session).
     */
    static async writeSessions(db, attendanceId, sessions) {
        if (!Array.isArray(sessions) || sessions.length === 0) {
            throw new types_1.ValidationError("At least one work interval is required.");
        }
        // Normalize + sort ascending by start.
        const norm = sessions.map((s) => {
            const start = new Date(s.clockIn);
            const end = new Date(s.clockOut);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                throw new types_1.ValidationError("Every interval needs a valid start and end time.");
            }
            if (end.getTime() <= start.getTime()) {
                throw new types_1.ValidationError("Each interval's end time must be after its start time.");
            }
            return {
                start,
                end,
                breakType: s.breakType ?? null,
                breakReason: s.breakReason ?? null,
            };
        });
        norm.sort((a, b) => a.start.getTime() - b.start.getTime());
        // No overlaps — each interval must start at/after the previous one's end.
        for (let k = 1; k < norm.length; k++) {
            if (norm[k].start.getTime() < norm[k - 1].end.getTime()) {
                throw new types_1.ValidationError("Work intervals must not overlap.");
            }
        }
        const MAX_SHIFT_HOURS = 24;
        if (norm[norm.length - 1].end.getTime() - norm[0].start.getTime() > MAX_SHIFT_HOURS * 60 * 60 * 1000) {
            throw new types_1.ValidationError("Total shift duration cannot exceed 24 hours.");
        }
        // Full replace of the day's intervals.
        await db.query(`DELETE FROM attendance_sessions WHERE attendance_id = $1`, [attendanceId]);
        for (const s of norm) {
            const minutes = Math.max(0, Math.floor((s.end.getTime() - s.start.getTime()) / 60000));
            await db.query(`INSERT INTO attendance_sessions
           (attendance_id, clock_in, clock_out, work_minutes, break_type, break_reason, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())`, [attendanceId, s.start, s.end, minutes, s.breakType, s.breakReason]);
        }
        await AttendanceController.recompute(db, attendanceId);
        // Day bounds: first start → last end (the last end IS the clock-out / complete).
        await db.query(`UPDATE attendance SET clock_in = $1, clock_out = $2, updated_at = now() WHERE id = $3`, [norm[0].start, norm[norm.length - 1].end, attendanceId]);
    }
    /** Closes any open session and marks the day complete. */
    static async finalizeDay(db, attendance) {
        let now = new Date();
        const MAX_SHIFT_HOURS = 24;
        const clockInTime = new Date(attendance.clockIn).getTime();
        if (now.getTime() - clockInTime > MAX_SHIFT_HOURS * 60 * 60 * 1000) {
            now = new Date(clockInTime + MAX_SHIFT_HOURS * 60 * 60 * 1000);
        }
        const open = await AttendanceController.getOpenSession(db, attendance);
        if (open) {
            await AttendanceController.closeSession(db, open, now);
        }
        await AttendanceController.recompute(db, attendance.id);
        const { rows: fresh } = await db.query(`SELECT clock_in AS "clockIn", clock_out AS "clockOut"
       FROM attendance_sessions WHERE attendance_id = $1 ORDER BY clock_in ASC`, [attendance.id]);
        const firstStart = fresh.length ? fresh[0].clockIn : attendance.clockIn || now;
        const lastEnd = fresh.length ? fresh[fresh.length - 1].clockOut || now : now;
        await db.query(`UPDATE attendance SET clock_in = $1, clock_out = $2, updated_at = now() WHERE id = $3`, [firstStart, lastEnd, attendance.id]);
    }
    /**
     * Get today's attendance for current user (tenant-aware)
     */
    static async getTodayAttendance(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const userId = req.user.id;
            const today = new Date();
            const result = await (0, attendancePool_1.withTenant)(req.tenantId, async (db) => {
                return await AttendanceController.getFormattedTodayAttendance(db, userId, req.tenantId, today);
            });
            res.status(200).json({ success: true, data: result });
        }
        catch (error) {
            console.error("Get today attendance error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch today's attendance",
            });
        }
    }
    /**
     * Get attendance dashboard summary (tenant-aware)
     */
    static async getDashboardSummary(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { startDate, endDate } = req.query;
            let startOfPeriod = new Date();
            startOfPeriod.setHours(0, 0, 0, 0);
            let endOfPeriod = new Date();
            endOfPeriod.setHours(23, 59, 59, 999);
            if (startDate) {
                startOfPeriod = new Date(startDate);
                startOfPeriod.setHours(0, 0, 0, 0);
            }
            if (endDate) {
                endOfPeriod = new Date(endDate);
                endOfPeriod.setHours(23, 59, 59, 999);
            }
            const summary = await (0, attendancePool_1.withTenant)(req.tenantId, async (db) => {
                const { rows: tm } = await db.query(`SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = $1 AND is_active = true`, [req.tenantId]);
                const totalMembers = tm[0]?.c ?? 0;
                const { rows: grp } = await db.query(`SELECT status, COUNT(*)::int AS c FROM attendance
           WHERE tenant_id = $1 AND date >= $2 AND date <= $3 GROUP BY status`, [req.tenantId, startOfPeriod, endOfPeriod]);
                const statusCounts = { present: 0, absent: 0, late: 0, halfDay: 0, wfh: 0 };
                for (const item of grp) {
                    switch ((item.status || "").toLowerCase()) {
                        case "present":
                            statusCounts.present = item.c;
                            break;
                        case "absent":
                            statusCounts.absent = item.c;
                            break;
                        case "late":
                            statusCounts.late = item.c;
                            break;
                        case "half-day":
                            statusCounts.halfDay = item.c;
                            break;
                        case "wfh":
                            statusCounts.wfh = item.c;
                            break;
                    }
                }
                const diffTime = Math.abs(endOfPeriod.getTime() - startOfPeriod.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
                const presentToday = statusCounts.present + statusCounts.late + statusCounts.wfh;
                const absentToday = statusCounts.absent;
                const expectedTotal = totalMembers * diffDays;
                const attendanceRate = expectedTotal > 0 ? Number(((presentToday / expectedTotal) * 100).toFixed(2)) : 0;
                return {
                    totalMembers,
                    expectedToday: expectedTotal,
                    presentToday,
                    absentToday,
                    lateToday: statusCounts.late,
                    wfhToday: statusCounts.wfh,
                    attendanceRate,
                };
            });
            res.status(200).json({ success: true, data: summary });
        }
        catch (error) {
            console.error("Get dashboard summary error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch dashboard summary",
            });
        }
    }
    /**
     * Get present members (tenant-aware)
     */
    static async getPresentMembers(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { startDate, endDate } = req.query;
            let startOfPeriod = new Date();
            startOfPeriod.setHours(0, 0, 0, 0);
            let endOfPeriod = new Date();
            endOfPeriod.setHours(23, 59, 59, 999);
            if (startDate) {
                startOfPeriod = new Date(startDate);
                startOfPeriod.setHours(0, 0, 0, 0);
            }
            if (endDate) {
                endOfPeriod = new Date(endDate);
                endOfPeriod.setHours(23, 59, 59, 999);
            }
            const presentMembers = await (0, attendancePool_1.withTenant)(req.tenantId, async (db) => {
                const { rows } = await db.query(`SELECT a.status, a.clock_in AS "clockIn", a.clock_out AS "clockOut",
                  u.id AS u_id, u.name AS u_name, u.avatar_url AS u_avatar,
                  p.id AS p_id, p.title AS p_title, p.code AS p_code,
                  s.id AS s_id, s.name AS s_name, s.start_time AS s_start, s.end_time AS s_end
           FROM attendance a
           LEFT JOIN users u ON u.id = a.user_id
           LEFT JOIN positions p ON p.id = u.position_id
           LEFT JOIN shifts s ON s.id = a.shift_id
           WHERE a.tenant_id = $1 AND a.date >= $2 AND a.date <= $3
             AND a.status IN ('present', 'late', 'wfh') AND a.clock_in IS NOT NULL
           ORDER BY a.clock_in ASC`, [req.tenantId, startOfPeriod, endOfPeriod]);
                const now = Date.now();
                return rows.map((r) => {
                    const workMinutes = r.clockOut
                        ? Math.floor((new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 60000)
                        : Math.floor((now - new Date(r.clockIn).getTime()) / 60000);
                    return {
                        id: r.u_id,
                        name: r.u_name,
                        position: r.p_id ? { id: r.p_id, title: r.p_title, code: r.p_code } : null,
                        avatarUrl: r.u_avatar,
                        status: (r.status || "").toLowerCase(),
                        clockInTime: r.clockIn,
                        clockOutTime: r.clockOut,
                        shift: r.s_id ? { name: r.s_name, startTime: r.s_start, endTime: r.s_end } : null,
                        workHours: workMinutes,
                    };
                });
            });
            res.status(200).json({ success: true, data: presentMembers });
        }
        catch (error) {
            console.error("Get present members error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch present members",
            });
        }
    }
    /**
     * Get my attendance summary (tenant-aware)
     */
    static async getMyAttendanceSummary(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const userId = req.user.id;
            const { month, year } = req.query;
            const targetDate = new Date(Number(year) || new Date().getFullYear(), Number(month) - 1 || new Date().getMonth());
            const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
            const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
            endOfMonth.setHours(23, 59, 59, 999);
            const data = await (0, attendancePool_1.withTenant)(req.tenantId, async (db) => {
                const { rows: records } = await db.query(`SELECT ${A_COLS} FROM attendance a
           WHERE a.user_id = $1 AND a.tenant_id = $2 AND a.date >= $3 AND a.date <= $4
           ORDER BY a.date ASC`, [userId, req.tenantId, startOfMonth, endOfMonth]);
                const summary = { totalDays: records.length, present: 0, absent: 0, late: 0, halfDay: 0, wfh: 0 };
                for (const record of records) {
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
                }
                return {
                    summary,
                    records,
                    month: targetDate.getMonth() + 1,
                    year: targetDate.getFullYear(),
                };
            });
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            console.error("Get my attendance summary error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch attendance summary",
            });
        }
    }
    /**
     * Update attendance record (tenant-aware)
     */
    static async updateAttendance(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const body = req.body || {};
            delete body.tenantId;
            delete body.userId;
            delete body.createdAt;
            const attendance = await (0, attendancePool_1.withTenant)(req.tenantId, async (db) => {
                const { rows: ex } = await db.query(`SELECT id, total_break_minutes AS "totalBreakMinutes", clock_in AS "clockIn", clock_out AS "clockOut"
           FROM attendance WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [id, req.tenantId]);
                if (!ex[0])
                    throw new types_1.NotFoundError("Attendance record not found in this tenant");
                const hasSessions = Array.isArray(body.sessions) && body.sessions.length > 0;
                // Build the SET clause from a whitelist of updatable columns. When a
                // timeline is supplied, writeSessions owns clock_in/clock_out, so those
                // columns are skipped here.
                const colMap = {
                    ...(hasSessions ? {} : { clockIn: "clock_in", clockOut: "clock_out" }),
                    date: "date",
                    status: "status",
                    notes: "notes",
                };
                const sets = [];
                const params = [];
                let i = 0;
                for (const [key, col] of Object.entries(colMap)) {
                    if (body[key] !== undefined) {
                        let v = body[key];
                        if (key === "clockIn" || key === "clockOut" || key === "date") {
                            v = v ? new Date(v) : null;
                        }
                        params.push(v);
                        sets.push(`${col} = $${++i}`);
                    }
                }
                sets.push(`updated_at = now()`);
                params.push(id);
                await db.query(`UPDATE attendance SET ${sets.join(", ")} WHERE id = $${++i}`, params);
                // A full timeline replaces the day's intervals and recomputes totals + bounds.
                if (hasSessions) {
                    await AttendanceController.writeSessions(db, id, body.sessions);
                }
                // Recalculate work minutes if clock-in or clock-out changed.
                if (!hasSessions && (body.clockIn !== undefined || body.clockOut !== undefined)) {
                    const finalIn = body.clockIn !== undefined ? (body.clockIn ? new Date(body.clockIn) : null) : ex[0].clockIn;
                    const finalOut = body.clockOut !== undefined ? (body.clockOut ? new Date(body.clockOut) : null) : ex[0].clockOut;
                    if (finalIn && finalOut) {
                        const MAX_SHIFT_HOURS = 24;
                        if (finalOut.getTime() - finalIn.getTime() > MAX_SHIFT_HOURS * 60 * 60 * 1000) {
                            throw new types_1.ValidationError("Total shift duration cannot exceed 24 hours.");
                        }
                        const totalWorkMinutes = Math.floor((finalOut.getTime() - finalIn.getTime()) / 60000);
                        const effectiveWorkMinutes = totalWorkMinutes - (ex[0].totalBreakMinutes || 0);
                        await db.query(`UPDATE attendance SET total_work_minutes = $1, effective_work_minutes = $2, updated_at = now() WHERE id = $3`, [totalWorkMinutes, effectiveWorkMinutes, id]);
                    }
                }
                const { rows } = await db.query(`SELECT ${A_COLS}, ${MEMBER_COLS} ${MEMBER_JOINS} WHERE a.id = $1 LIMIT 1`, [id]);
                return rowToAttendance(rows[0]);
            });
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.HR,
                module: transactionHistory_1.Module.ATTENDANCE,
                page: transactionHistory_1.Page.ATTENDANCE_RECORDS,
                action: transactionHistory_1.Action.UPDATE,
                actionLabel: `Updated attendance record for ${attendance?.member?.name || req.user.name}`,
                entityType: transactionHistory_1.EntityType.ATTENDANCE_RECORD,
                entityId: id,
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                data: attendance,
                message: "Attendance record updated successfully",
            });
        }
        catch (error) {
            console.error("Update attendance error:", error);
            if (error instanceof types_1.NotFoundError || error instanceof types_1.ValidationError) {
                res.status(error instanceof types_1.NotFoundError ? 404 : 400).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to update attendance record",
            });
        }
    }
    /**
     * Delete attendance record (tenant-aware)
     */
    static async deleteAttendance(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            let deletedName = "";
            await (0, attendancePool_1.withTenant)(req.tenantId, async (db) => {
                const { rows } = await db.query(`SELECT u.name FROM attendance a LEFT JOIN users u ON a.user_id = u.id WHERE a.id = $1 AND a.tenant_id = $2 LIMIT 1`, [id, req.tenantId]);
                if (!rows[0])
                    throw new types_1.NotFoundError("Attendance record not found in this tenant");
                deletedName = rows[0].name;
                // Remove child sessions first (no FK cascade on attendance_sessions).
                await db.query(`DELETE FROM attendance_sessions WHERE attendance_id = $1`, [id]);
                await db.query(`DELETE FROM attendance WHERE id = $1`, [id]);
            });
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.HR,
                module: transactionHistory_1.Module.ATTENDANCE,
                page: transactionHistory_1.Page.ATTENDANCE_RECORDS,
                action: transactionHistory_1.Action.DELETE,
                actionLabel: `Deleted attendance record for ${deletedName || req.user.name}`,
                entityType: transactionHistory_1.EntityType.ATTENDANCE_RECORD,
                entityId: id,
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                message: "Attendance record deleted successfully",
            });
        }
        catch (error) {
            console.error("Delete attendance error:", error);
            res.status(error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message || "Failed to delete attendance record",
            });
        }
    }
    /**
     * Reopen an accidentally-completed day (tenant-aware, manager action).
     *
     * Clears `clock_out` (the "day closed" flag) and opens a fresh work session at
     * the manager-supplied `resumeAt` time, so the user's day flips back to
     * "working" and they can continue + complete it properly. Work timers are NOT
     * auto-resumed (the prior complete stopped them); the user restarts manually.
     */
    static async reopenDay(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const { resumeAt } = req.body || {};
            if (!resumeAt) {
                res.status(400).json({ success: false, error: "resumeAt is required" });
                return;
            }
            const resumeTime = new Date(resumeAt);
            if (isNaN(resumeTime.getTime())) {
                res.status(400).json({ success: false, error: "resumeAt is not a valid time" });
                return;
            }
            const result = await (0, attendancePool_1.withTenant)(req.tenantId, async (db) => {
                const { rows } = await db.query(`SELECT id, user_id AS "userId", date, clock_in AS "clockIn", clock_out AS "clockOut"
           FROM attendance WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [id, req.tenantId]);
                const attendance = rows[0] || null;
                if (!attendance)
                    throw new types_1.NotFoundError("Attendance record not found in this tenant");
                if (!attendance.clockOut) {
                    throw new types_1.ValidationError("This day is not complete, so there's nothing to reopen.");
                }
                // The resume point must be at/after the last recorded activity. Compare at
                // minute granularity so a picker that drops seconds (defaulting to the
                // clock-out's HH:mm) isn't rejected for landing a few seconds earlier.
                const toMinute = (d) => Math.floor(d.getTime() / 60000);
                const lastEnd = new Date(attendance.clockOut);
                if (toMinute(resumeTime) < toMinute(lastEnd)) {
                    throw new types_1.ValidationError("Resume time must be at or after the time the day was completed.");
                }
                // Reopen: clear the close flag and open a fresh session.
                await db.query(`UPDATE attendance SET clock_out = NULL, status = 'present', updated_at = now() WHERE id = $1`, [id]);
                await db.query(`INSERT INTO attendance_sessions (attendance_id, clock_in) VALUES ($1, $2)`, [id, resumeTime]);
                await AttendanceController.recompute(db, id);
                // Today → return the live "today" shape so the clock panel updates.
                const [startOfToday, endOfToday] = dayBounds(new Date());
                const day = new Date(attendance.date);
                const isToday = day >= startOfToday && day <= endOfToday;
                if (isToday) {
                    return {
                        formatted: await AttendanceController.getFormattedTodayAttendance(db, attendance.userId, req.tenantId, new Date()),
                        userId: attendance.userId,
                    };
                }
                const { rows: fresh } = await db.query(`SELECT ${A_COLS}, ${MEMBER_COLS} ${MEMBER_JOINS} WHERE a.id = $1 LIMIT 1`, [id]);
                return { formatted: rowToAttendance(fresh[0]), userId: attendance.userId };
            });
            // Live-sync clients only when the reopened day is today.
            if (result.formatted?.state) {
                socketService_1.socketService.emitToTenant(req.tenantId, "attendance:updated", result.formatted);
            }
            res.status(200).json({
                success: true,
                data: result.formatted,
                message: "Day reopened",
            });
        }
        catch (error) {
            console.error("Reopen day error:", error);
            if (error instanceof types_1.ValidationError || error instanceof types_1.NotFoundError) {
                res.status(error instanceof types_1.NotFoundError ? 404 : 400).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({ success: false, error: "Failed to reopen day" });
        }
    }
    /**
     * Get last 5 working days average for current user
     */
    static async getLast5DaysAverage(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const userId = req.user.id;
            const result = await (0, attendancePool_1.withTenant)(req.tenantId, async (db) => {
                const { rows: records } = await db.query(`SELECT date, clock_in AS "clockIn", clock_out AS "clockOut"
           FROM attendance
           WHERE user_id = $1 AND tenant_id = $2 AND clock_in IS NOT NULL AND clock_out IS NOT NULL
           ORDER BY date DESC LIMIT 5`, [userId, req.tenantId]);
                if (records.length === 0) {
                    return { last5Days: [], averageMinutes: 0, averageHours: 0 };
                }
                const processedRecords = records.map((record) => {
                    const minutes = Math.floor((new Date(record.clockOut).getTime() - new Date(record.clockIn).getTime()) / 60000);
                    return {
                        date: record.date,
                        clockIn: record.clockIn,
                        clockOut: record.clockOut,
                        minutes,
                        hours: Number((minutes / 60).toFixed(2)),
                    };
                });
                const totalMinutes = processedRecords.reduce((sum, r) => sum + r.minutes, 0);
                const averageMinutes = Math.floor(totalMinutes / processedRecords.length);
                const averageHours = Number((averageMinutes / 60).toFixed(2));
                return { last5Days: processedRecords, averageMinutes, averageHours };
            });
            res.status(200).json({ success: true, data: result });
        }
        catch (error) {
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
    static async createAttendance(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const attendanceData = req.body;
            if (!attendanceData.userId || !attendanceData.date) {
                res.status(400).json({
                    success: false,
                    error: "User ID and date are required",
                });
                return;
            }
            const attendance = await (0, attendancePool_1.withTenant)(req.tenantId, async (db) => {
                const { rows: u } = await db.query(`SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true LIMIT 1`, [attendanceData.userId, req.tenantId]);
                if (!u[0])
                    throw new types_1.ValidationError("User not found in this tenant");
                const [startOfDay, endOfDay] = dayBounds(new Date(attendanceData.date));
                const { rows: ex } = await db.query(`SELECT id FROM attendance WHERE user_id = $1 AND tenant_id = $2 AND date >= $3 AND date <= $4 LIMIT 1`, [attendanceData.userId, req.tenantId, startOfDay, endOfDay]);
                if (ex[0])
                    throw new types_1.ValidationError("Attendance record already exists for this date");
                const hasSessions = Array.isArray(attendanceData.sessions) && attendanceData.sessions.length > 0;
                const newId = (0, crypto_1.randomUUID)();
                const cIn = hasSessions ? null : attendanceData.clockIn ? new Date(attendanceData.clockIn) : null;
                const cOut = hasSessions ? null : attendanceData.clockOut ? new Date(attendanceData.clockOut) : null;
                if (cIn && cOut) {
                    const MAX_SHIFT_HOURS = 24;
                    if (cOut.getTime() - cIn.getTime() > MAX_SHIFT_HOURS * 60 * 60 * 1000) {
                        throw new types_1.ValidationError("Total shift duration cannot exceed 24 hours.");
                    }
                }
                await db.query(`INSERT INTO attendance
             (id, tenant_id, user_id, date, clock_in, clock_out, status, notes, is_manual_entry, entered_by_id, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, now())`, [
                    newId,
                    req.tenantId,
                    attendanceData.userId,
                    startOfDay,
                    cIn,
                    cOut,
                    attendanceData.status || "present",
                    attendanceData.notes ?? null,
                    req.user.id,
                ]);
                if (hasSessions) {
                    await AttendanceController.writeSessions(db, newId, attendanceData.sessions);
                }
                const { rows } = await db.query(`SELECT ${A_COLS}, ${MEMBER_COLS} ${MEMBER_JOINS} WHERE a.id = $1 LIMIT 1`, [newId]);
                return rowToAttendance(rows[0]);
            });
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.HR,
                module: transactionHistory_1.Module.ATTENDANCE,
                page: transactionHistory_1.Page.ATTENDANCE_RECORDS,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Created manual attendance record for ${attendance?.member?.name || req.user.name}`,
                entityType: transactionHistory_1.EntityType.ATTENDANCE_RECORD,
                entityId: attendance?.id,
                afterData: attendance,
                statusCode: 201,
            });
            res.status(201).json({
                success: true,
                data: attendance,
                message: "Attendance record created successfully",
            });
        }
        catch (error) {
            console.error("Create attendance error:", error);
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({ success: false, error: error.message });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to create attendance record",
            });
        }
    }
    /**
     * Helper to get formatted today's attendance data for a user.
     * Consistent response format for clock-in, clock-out, pause/resume/complete
     * and the today status endpoint. Includes the day's work sessions + state.
     */
    static async getFormattedTodayAttendance(db, userId, tenantId, targetDate) {
        const [startOfToday, endOfToday] = dayBounds(targetDate);
        // User + their assigned shift (used as the shift fallback + member info).
        const { rows: uRows } = await db.query(`SELECT u.id, u.name, u.avatar_url AS "avatarUrl", u.assigned_shift_id AS "assignedShiftId",
              ash.id AS ash_id, ash.name AS ash_name, ash.start_time AS ash_start, ash.end_time AS ash_end
       FROM users u LEFT JOIN shifts ash ON ash.id = u.assigned_shift_id WHERE u.id = $1 LIMIT 1`, [userId]);
        const user = uRows[0];
        if (!user)
            throw new types_1.NotFoundError("User not found");
        // Today's attendance + its shift.
        const { rows: aRows } = await db.query(`SELECT a.id, a.clock_in AS "clockIn", a.clock_out AS "clockOut", a.status, a.date,
              a.effective_work_minutes AS "effectiveWorkMinutes",
              s.id AS s_id, s.name AS s_name, s.start_time AS s_start, s.end_time AS s_end
       FROM attendance a LEFT JOIN shifts s ON s.id = a.shift_id
       WHERE a.user_id = $1 AND a.tenant_id = $2 ORDER BY a.clock_in DESC NULLS LAST LIMIT 1`, [userId, tenantId]);
        let attendance = aRows[0] || null;
        if (attendance) {
            const isToday = attendance.date && new Date(attendance.date).getTime() >= startOfToday.getTime() && new Date(attendance.date).getTime() <= endOfToday.getTime();
            if (!isToday && attendance.clockOut) {
                attendance = null;
            }
        }
        const shift = attendance?.s_id
            ? { id: attendance.s_id, name: attendance.s_name, startTime: attendance.s_start, endTime: attendance.s_end }
            : user.ash_id
                ? { id: user.ash_id, name: user.ash_name, startTime: user.ash_start, endTime: user.ash_end }
                : null;
        // Load this day's work sessions (source of truth for multi-session days).
        const now = new Date();
        let sessionRows = attendance
            ? (await db.query(`SELECT id, clock_in AS "clockIn", clock_out AS "clockOut", work_minutes AS "workMinutes",
                    break_type AS "breakType", break_reason AS "breakReason",
                    clock_in_latitude AS "latitude", clock_in_longitude AS "longitude",
                    clock_in_accuracy AS "accuracy", clock_in_address AS "address"
             FROM attendance_sessions WHERE attendance_id = $1 ORDER BY clock_in ASC`, [attendance.id])).rows
            : [];
        // Legacy fallback: a clock-in with no session rows → one virtual session.
        if (sessionRows.length === 0 && attendance?.clockIn) {
            sessionRows = [
                {
                    id: null,
                    clockIn: attendance.clockIn,
                    clockOut: attendance.clockOut || null,
                    workMinutes: attendance.effectiveWorkMinutes || 0,
                    breakType: null,
                    breakReason: null,
                    latitude: null,
                    longitude: null,
                    accuracy: null,
                    address: null,
                },
            ];
        }
        const openSession = sessionRows.find((s) => !s.clockOut);
        const totalWorkMinutes = sessionRows.reduce((acc, s) => {
            const end = s.clockOut ? new Date(s.clockOut) : now;
            return acc + Math.max(0, Math.floor((end.getTime() - new Date(s.clockIn).getTime()) / 60000));
        }, 0);
        let breakMinutes = 0;
        for (let k = 1; k < sessionRows.length; k++) {
            const prevEnd = sessionRows[k - 1].clockOut;
            if (prevEnd) {
                breakMinutes += Math.max(0, Math.floor((new Date(sessionRows[k].clockIn).getTime() - new Date(prevEnd).getTime()) / 60000));
            }
        }
        let state;
        if (!attendance || (!attendance.clockIn && sessionRows.length === 0)) {
            state = "not_started";
        }
        else if (attendance.clockOut) {
            state = "complete";
        }
        else if (openSession) {
            state = "working";
        }
        else {
            state = "paused";
        }
        const sessions = sessionRows.map((s) => ({
            id: s.id,
            clockIn: s.clockIn,
            clockOut: s.clockOut || null,
            workMinutes: s.clockOut
                ? s.workMinutes || 0
                : Math.max(0, Math.floor((now.getTime() - new Date(s.clockIn).getTime()) / 60000)),
            breakType: s.breakType ?? null,
            breakReason: s.breakReason ?? null,
            location: s.latitude != null && s.longitude != null
                ? {
                    latitude: s.latitude,
                    longitude: s.longitude,
                    accuracy: s.accuracy ?? null,
                    address: s.address ?? null,
                }
                : null,
            isOpen: !s.clockOut,
        }));
        const lastClosed = [...sessionRows].reverse().find((s) => s.clockOut);
        const currentBreakType = state === "paused" ? lastClosed?.breakType ?? null : null;
        const currentBreakReason = state === "paused" ? lastClosed?.breakReason ?? null : null;
        return {
            id: attendance?.id || null,
            userId,
            date: startOfToday,
            clockIn: attendance?.clockIn || null,
            clockOut: attendance?.clockOut || null,
            status: attendance?.status ? attendance.status.toLowerCase() : "not_clocked_in",
            shift: shift
                ? { id: shift.id, name: shift.name, startTime: shift.startTime, endTime: shift.endTime, isFlexible: false }
                : null,
            totalWorkMinutes,
            breakMinutes,
            state,
            onBreak: state === "paused",
            breakType: currentBreakType,
            breakReason: currentBreakReason,
            sessionCount: sessions.length,
            sessions,
            member: user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl ?? null } : null,
            isClockIn: !!attendance?.clockIn,
            clockInTime: attendance?.clockIn || null,
            clockOutTime: attendance?.clockOut || null,
            canClockIn: state === "not_started",
            canPause: state === "working",
            canResume: state === "paused",
            canComplete: state === "working" || state === "paused",
            canClockOut: state === "working" || state === "paused",
        };
    }
}
exports.AttendanceController = AttendanceController;
exports.default = AttendanceController;
//# sourceMappingURL=attendanceController.js.map