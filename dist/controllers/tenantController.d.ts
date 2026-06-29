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
    /**
     * Get all tenants with their web inquiry secret keys
     * Requires super_admin access
     */
    static getAllTenants(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Generate missing secret keys for all tenants
     * Requires super_admin access
     */
    static generateMissingSecretKeys(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Generate secret key for a specific tenant
     * Requires super_admin access
     */
    static generateSecretKey(req: AuthRequest, res: Response): Promise<void>;
}
export default TenantController;
