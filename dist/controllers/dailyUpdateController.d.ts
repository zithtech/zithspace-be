import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class DailyUpdateController {
    /**
     * Create new daily status update
     */
    static createUpdate(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get current user's daily updates
     */
    static getMyUpdates(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get team's daily updates (PM/Admin only)
     */
    static getTeamUpdates(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get today's updates (role-based)
     */
    static getTodayUpdates(req: AuthRequest, res: Response): Promise<void>;
    static checkTodaySubmission(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get specific daily update by ID
     */
    static getUpdateById(req: AuthRequest, res: Response): Promise<void>;
    static updateUpdate(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete daily status update
     */
    static deleteUpdate(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get submission statistics (PM/Admin only)
     */
    static getSubmissionStats(req: AuthRequest, res: Response): Promise<void>;
}
