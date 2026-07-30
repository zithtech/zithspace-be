import { Response } from "express";
import { AuthRequest } from "@/types";
import { Request } from "express";
export declare class AuthController {
    /**
     * Global login for Chrome Extension
     */
    static extensionLogin(req: Request, res: Response): Promise<void>;
    /**
     * Resolve a workspace by slug for the Chrome Extension activation screen.
     * Public (no auth): only exposes whether the workspace exists + its display
     * name, so the extension can bind an install to a tenant before login.
     */
    static resolveWorkspace(req: Request, res: Response): Promise<void>;
    /**
     * Redeem a one-time install key for the Chrome Extension activation screen.
     * Unlike /resolve-tenant (which takes a public slug), the install key is a
     * high-entropy secret provisioned per tenant — so this endpoint is not an
     * existence oracle for workspace names. Returns the bound workspace on match.
     */
    static redeemInstallKey(req: Request, res: Response): Promise<void>;
    /**
     * User login with tenant context
     */
    static login(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Refresh access token
     */
    static refresh(req: AuthRequest, res: Response): Promise<void>;
    /**
     * User logout
     */
    static logout(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get current user profile
     */
    static me(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Check authentication status
     */
    static check(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create a new user (for testing and tenant setup)
     */
    static createUser(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get new profile including employee info
     */
    static getNewProfile(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Google User login with tenant context
     */
    static googleLogin(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Microsoft User login with tenant context
     */
    static microsoftLogin(req: AuthRequest, res: Response): Promise<void>;
}
export default AuthController;
