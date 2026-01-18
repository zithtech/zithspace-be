import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class TrashController {
    /**
     * Get all deleted tickets (trash) for a tenant/project (tenant-aware)
     * Only returns tickets deleted within the last 7 days
     */
    static getTrashTickets(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Move ticket(s) to trash (soft delete) (tenant-aware)
     */
    static moveToTrash(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Restore ticket(s) from trash (tenant-aware)
     */
    static restoreFromTrash(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Permanently delete ticket(s) from trash (tenant-aware)
     * This action cannot be undone
     */
    static permanentlyDelete(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Empty trash - permanently delete all tickets in trash (tenant-aware)
     * Only deletes tickets older than 7 days or all if force=true
     */
    static emptyTrash(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Auto-purge old deleted tickets (called by cron job)
     * Permanently deletes tickets that have been in trash for more than 7 days
     */
    static autoPurge(req: AuthRequest, res: Response): Promise<void>;
}
