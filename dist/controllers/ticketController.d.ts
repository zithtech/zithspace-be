import { Response } from 'express';
import { AuthRequest } from '@/types';
export declare class TicketController {
    /**
     * Get dashboard statistics (tenant-aware)
     */
    static getDashboardStats(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create a new ticket (tenant-aware)
     */
    static createTicket(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get all tickets with filtering, sorting, and pagination (tenant-aware)
     */
    static getTickets(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get ticket by ID with full details (tenant-aware)
     */
    static getTicketById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update ticket (tenant-aware)
     */
    static updateTicket(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete ticket (tenant-aware)
     */
    static deleteTicket(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get tickets assigned to current user (tenant-aware)
     */
    static getMyTickets(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Bulk update ticket status (tenant-aware)
     */
    static bulkUpdateStatus(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get ticket statistics by project (tenant-aware)
     */
    static getTicketStatsByProject(req: AuthRequest, res: Response): Promise<void>;
}
export default TicketController;
