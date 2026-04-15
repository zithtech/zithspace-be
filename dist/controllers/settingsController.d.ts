import { Response } from 'express';
import { AuthRequest } from '@/types';
export declare class SettingsController {
    /**
     * Get all configuration options for ticket creation (tenant-aware)
     * OPTIMIZED: Uses Promise.all for parallel queries + 5-minute cache
     */
    static getTicketConfigurations(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get team members by project or role (tenant-aware)
     */
    static getTeamMembers(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get release plans by project (tenant-aware)
     */
    static getReleasePlansByProject(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get workflow templates by project (tenant-aware)
     */
    static getWorkflowTemplates(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update project workflow template (tenant-aware)
     */
    static updateWorkflowTemplate(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get parent tickets for linking (tenant-aware)
     */
    static getParentTickets(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get system statistics for dashboard (tenant-aware)
     */
    static getSystemStats(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get tenant settings (tenant-aware)
     */
    static getTenantSettings(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update tenant settings (admin only - tenant-aware)
     */
    static updateTenantSettings(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Search across entities (tenant-aware)
     */
    static globalSearch(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get all dropdown options grouped by type (tenant-aware)
     */
    static getDropdownOptions(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get dropdown options by specific type (tenant-aware)
     */
    static getDropdownOptionsByType(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create a new dropdown option (tenant-aware)
     */
    static createDropdownOption(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update an existing dropdown option (tenant-aware)
     * FIXED: Allows order-only updates
     */
    static updateDropdownOption(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete a dropdown option (tenant-aware)
     */
    static deleteDropdownOption(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Reorder dropdown options (tenant-aware)
     */
    static reorderDropdownOptions(req: AuthRequest, res: Response): Promise<void>;
}
export default SettingsController;
