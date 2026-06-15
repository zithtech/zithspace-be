import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class AuthController {
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
}
export default AuthController;
