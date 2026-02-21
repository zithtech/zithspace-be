import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class RepositoryController {
    /**
     * Get all repositories for the current tenant
     */
    static getRepositories(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create a new repository
     */
    static createRepository(req: AuthRequest, res: Response): Promise<void>;
}
