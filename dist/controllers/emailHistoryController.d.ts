import { Response } from 'express';
import { AuthRequest } from "@/types";
export declare class EmailHistoryController {
    /**
     * Get email logs with filters and pagination
     */
    static getEmailLogs(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get single email log by ID
     */
    static getEmailLogById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get all unique modules
     */
    static getModules(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get email statistics
     */
    static getStats(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get invoice-specific email history
     */
    static getInvoiceEmailHistory(req: AuthRequest, res: Response): Promise<void>;
}
