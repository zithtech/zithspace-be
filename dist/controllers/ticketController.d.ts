import { Response } from 'express';
import { AuthRequest } from '@/types';
export declare class TicketController {
    /**
     * Upload image to R2 for ticket description
     */
    static uploadImage(req: AuthRequest, res: Response): Promise<void>;
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
    /**
     * Get workflow steps for a ticket (tenant-aware)
     */
    static getWorkflowSteps(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update workflow step (tenant-aware)
     */
    static updateWorkflowStep(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get comments for a ticket (tenant-aware)
     */
    static getComments(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Add comment to ticket (tenant-aware)
     */
    static addComment(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update comment (tenant-aware)
     */
    static updateComment(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete comment (tenant-aware)
     */
    static deleteComment(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get related links for ticket (tenant-aware)
     */
    static getRelatedLinks(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Add related link to ticket (tenant-aware)
     */
    static addRelatedLink(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update related link (tenant-aware)
     */
    static updateRelatedLink(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete related link (tenant-aware)
     */
    static deleteRelatedLink(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get activity log for a ticket (tenant-aware)
     */
    static getActivityLog(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Upload attachment to ticket (tenant-aware)
     */
    static uploadAttachment(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get attachments for a ticket (tenant-aware)
     */
    static getAttachments(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete attachment (tenant-aware)
     */
    static deleteAttachment(req: AuthRequest, res: Response): Promise<void>;
}
