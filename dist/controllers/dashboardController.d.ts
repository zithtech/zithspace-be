import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class DashboardController {
    /**
     * Get optimized dashboard summary with all key metrics
     * Single endpoint for fast dashboard loading (<500ms target)
     */
    static getDashboardSummary(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get dashboard settings for the current tenant
     */
    static getSettings(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update dashboard settings for the current tenant
     */
    static updateSettings(req: AuthRequest, res: Response): Promise<void>;
}
export default DashboardController;
