import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class AttendanceController {
    /**
     * Get all attendance records with filtering and pagination (tenant-aware)
     */
    static getAttendance(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get attendance record by ID (tenant-aware)
     */
    static getAttendanceById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Clock in (tenant-aware) — opens a new work session.
     */
    static clockIn(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Clock out (tenant-aware) — finalizes the day.
     */
    static clockOut(req: AuthRequest, res: Response): Promise<void>;
    /** Pause the day — closes the currently open work session (a break begins). */
    static pause(req: AuthRequest, res: Response): Promise<void>;
    /** Resume the day — opens a new work session after a break. */
    static resume(req: AuthRequest, res: Response): Promise<void>;
    /** Complete the day — closes any open session and finalizes totals. */
    static complete(req: AuthRequest, res: Response): Promise<void>;
    /** Shared driver for the pause / resume / complete session actions. */
    private static runSessionAction;
    /**
     * Returns the currently open session for a day, backfilling one from a legacy
     * `clockIn` when no session rows exist yet (normalizes old records).
     */
    private static getOpenSession;
    /** Closes a session, stores its worked minutes and an optional break. */
    private static closeSession;
    /** Recomputes day totals from closed sessions (effective / break / span). */
    private static recompute;
    /**
     * Replaces a day's entire work timeline with the given sessions and recomputes
     * totals + day bounds. Each session is one WORK interval; `breakType`/`reason`
     * describe the break that FOLLOWS it (the gap to the next session).
     */
    private static writeSessions;
    /** Closes any open session and marks the day complete. */
    private static finalizeDay;
    /**
     * Get today's attendance for current user (tenant-aware)
     */
    static getTodayAttendance(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get attendance dashboard summary (tenant-aware)
     */
    static getDashboardSummary(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get present members (tenant-aware)
     */
    static getPresentMembers(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get my attendance summary (tenant-aware)
     */
    static getMyAttendanceSummary(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update attendance record (tenant-aware)
     */
    static updateAttendance(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete attendance record (tenant-aware)
     */
    static deleteAttendance(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Reopen an accidentally-completed day (tenant-aware, manager action).
     *
     * Clears `clock_out` (the "day closed" flag) and opens a fresh work session at
     * the manager-supplied `resumeAt` time, so the user's day flips back to
     * "working" and they can continue + complete it properly. Work timers are NOT
     * auto-resumed (the prior complete stopped them); the user restarts manually.
     */
    static reopenDay(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get last 5 working days average for current user
     */
    static getLast5DaysAverage(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create manual attendance entry (tenant-aware)
     */
    static createAttendance(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Helper to get formatted today's attendance data for a user.
     * Consistent response format for clock-in, clock-out, pause/resume/complete
     * and the today status endpoint. Includes the day's work sessions + state.
     */
    private static getFormattedTodayAttendance;
}
export default AttendanceController;
