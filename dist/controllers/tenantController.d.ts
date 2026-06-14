import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class TenantController {
    /**
     * Register a new tenant with admin user (public endpoint)
     */
    static register(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Resolve tenant by subdomain (public endpoint for frontend)
     */
    static resolve(req: AuthRequest, res: Response): Promise<void>;
    static completeSetup(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get current tenant profile (tenant-aware)
     */
    static getProfile(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update tenant profile (admin only)
     */
    static updateProfile(req: AuthRequest, res: Response): Promise<void>;
    static deleteLogoVersion(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get tenant statistics (admin only)
     */
    static getStatistics(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Check subdomain availability (public endpoint)
     */
    static checkSubdomainAvailability(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Deactivate tenant (super_admin only)
     */
    static deactivate(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Activate tenant (super_admin only)
     */
    static activate(req: AuthRequest, res: Response): Promise<void>;
}
export default TenantController;
