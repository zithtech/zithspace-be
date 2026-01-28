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
     * Start a Sprint (tenant-aware)
     */
    static startSprint(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Complete a Sprint (tenant-aware)
     * - Archives completed tickets (keeps them with sprint for history)
     * - Returns incomplete tickets to backlog
     */
    static completeSprint(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get active release plans
     */
    static getActiveReleasePlans(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get available sprints (active + planning) for a project
     * Used for sprint assignment in buckets, trash, etc.
     */
    static getAvailableSprints(req: AuthRequest, res: Response): Promise<void>;
    static getReleasePlanStats(req: AuthRequest, res: Response): Promise<void>;
    static getReleasePlansByProject(req: AuthRequest, res: Response): Promise<void>;
    static getProjectTickets(req: AuthRequest, res: Response): Promise<void>;
    static getAvailableTickets(req: AuthRequest, res: Response): Promise<void>;
    static assignTicketsToReleasePlan(req: AuthRequest, res: Response): Promise<void>;
    static removeTicketsFromReleasePlan(req: AuthRequest, res: Response): Promise<void>;
}
export default ReleasePlansController;
