import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class TicketCodeController {
    /**
     * Get all code metadata (branches, PRs) for a ticket
     */
    static getTicketCodeMetadata(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Add a branch to a ticket
     */
    static addBranch(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Remove a branch from a ticket
     */
    static removeBranch(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Add a Pull Request to a ticket
     */
    static addPullRequest(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Remove a Pull Request from a ticket
     */
    static removePullRequest(req: AuthRequest, res: Response): Promise<void>;
}
