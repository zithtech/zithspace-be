import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class EnviromentsController {
    /**
     * Get all environments (tenant-aware)
     */
    static getEnviroments(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create environment
     */
    static createEnviroment(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update environment
     */
    static updateEnviroment(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete environment (hard delete via status)
     */
    static deleteEnviroment(req: AuthRequest, res: Response): Promise<void>;
    /**
   * Get single environment by ID
   */
    static getEnviromentById(req: AuthRequest, res: Response): Promise<void>;
}
export default EnviromentsController;
