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
     * Clock in (tenant-aware)
     */
    static clockIn(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Clock out (tenant-aware)
     */
    static clockOut(req: AuthRequest, res: Response): Promise<void>;
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
     * Get last 5 working days average for current user
     */
    static getLast5DaysAverage(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create manual attendance entry (tenant-aware)
     */
    static createAttendance(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Helper to get formatted today's attendance data for a user
     * Consistent response format for clock-in, clock-out, and today status
     */
    private static getFormattedTodayAttendance;
}
export default AttendanceController;
