import { Response } from 'express';
import { AuthRequest } from '@/types';
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
     * Get projects where user is a member (tenant-aware)
     */
    static getUserProjects(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Add team member to project (tenant-aware)
     */
    static addTeamMember(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Remove team member from project (tenant-aware)
     */
    static removeTeamMember(req: AuthRequest, res: Response): Promise<void>;
}
export default ProjectController;
