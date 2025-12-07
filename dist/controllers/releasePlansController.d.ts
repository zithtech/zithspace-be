import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class ReleasePlansController {
    /**
     * Get all release plans with filtering and pagination (tenant-aware)
     */
    static getReleasePlans(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get release plan by ID (tenant-aware)
     */
    static getReleasePlanById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create new release plan (tenant-aware)
     */
    static createReleasePlan(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update release plan (tenant-aware)
     */
    static updateReleasePlan(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete release plan (tenant-aware)
     */
    static deleteReleasePlan(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get release plans by project (tenant-aware)
     */
    static getReleasePlansByProject(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get active release plans (tenant-aware)
     */
    static getActiveReleasePlans(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get release plan statistics (tenant-aware)
     */
    static getReleasePlanStats(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get tickets by project for release plan assignment (tenant-aware)
     * Simpler version without release plan ID requirement
     */
    static getProjectTickets(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get tickets available for assignment to release plan (tenant-aware)
     */
    static getAvailableTickets(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Assign tickets to release plan (tenant-aware)
     */
    static assignTicketsToReleasePlan(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Remove tickets from release plan (tenant-aware)
     */
    static removeTicketsFromReleasePlan(req: AuthRequest, res: Response): Promise<void>;
}
export default ReleasePlansController;
