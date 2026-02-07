import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class SprintCompletionController {
    /**
     * Get sprint completion summary (tenant-aware)
     * Returns completed and pending tickets for a sprint, plus available destinations
     */
    static getSprintCompletionSummary(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Bulk resolve sprint tickets (tenant-aware)
     * Moves tickets to specified destinations (sprint, bucket, backlog, or trash)
     */
    static bulkResolveTickets(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Complete sprint with enhanced workflow (tenant-aware)
     * Validates all tickets are resolved before completion
     */
    static completeSprint(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get sprint completion history/audit log (tenant-aware)
     */
    static getSprintCompletionLog(req: AuthRequest, res: Response): Promise<void>;
}
