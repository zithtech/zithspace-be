import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class ProjectController {
    /**
     * Get all projects with filtering and pagination (tenant-aware)
     */
    static getProjects(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get project by ID (tenant-aware)
     */
    static getProjectById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create a new project (tenant-aware)
     */
    static createProject(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update project (tenant-aware)
     */
    static updateProject(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete project (tenant-aware)
     */
    static deleteProject(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get project statistics (tenant-aware)
     */
    static getProjectStats(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get projects for dropdown/select (tenant-aware)
     */
    static getProjectsForSelect(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get rich project data for selection screen (tenant-aware + role-based)
     */
    static getSelectionProjects(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get projects where user is a member (tenant-aware) (LEGACY / SIMPLE)
     */
    static getUserProjects(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get projects where user is a member or project manager (for ticket creation)
     */
    static getUserProjectsForTickets(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Add team member to project (tenant-aware)
     */
    static addTeamMember(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get project members for dropdown/select (tenant-aware)
     */
    static getProjectMembers(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get tickets assigned to current user in a project (for daily updates)
     */
    static getMyTicketsByProject(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get all tickets for a project that user has access to (for daily updates)
     */
    static getProjectTickets(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Remove team member from project (tenant-aware)
     */
    static removeTeamMember(req: AuthRequest, res: Response): Promise<void>;
}
export default ProjectController;
