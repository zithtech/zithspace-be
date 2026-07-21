import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class UserController {
    /**
     * Get all members/users with filtering and pagination (tenant-aware)
     */
    static getMembers(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get member/user by ID (tenant-aware)
     */
    static getMemberById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create new member/user (tenant-aware)
     */
    static createMember(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update member/user (tenant-aware)
     */
    static updateMember(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete member (soft delete - tenant-aware)
     */
    static deleteMember(req: AuthRequest, res: Response): Promise<void>;
    static getDeletedMembers(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Dynamically resolves all FK constraints referencing users(id),
     * nullifies nullable columns and deletes rows with non-nullable columns,
     * then physically deletes the user record(s).
     */
    private static hardDeleteUsers;
    /**
     * Permanently delete a member from the database (irreversible).
     * Only works for members that have already been soft-deleted (is_active = false).
     */
    static permanentlyDeleteMember(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Bulk restore soft-deleted members (tenant-aware)
     */
    static bulkRestoreMembers(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Bulk permanently delete members (tenant-aware)
     */
    static bulkPermanentDeleteMembers(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Empty member trash (tenant-aware)
     */
    static emptyTrashMembers(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Activate member (tenant-aware)
     */
    static activateMember(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get user profile (current user - tenant-aware)
     */
    static getUserProfile(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update user profile (current user - tenant-aware)
     */
    static updateUserProfile(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Change password (current user - tenant-aware)
     */
    static changePassword(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Reset user password (admin only - tenant-aware)
     */
    static resetUserPassword(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get members for dropdown/select (tenant-aware)
     */
    static getMembersForSelect(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Assign shift to member (tenant-aware) - MISSING FUNCTIONALITY RESTORED
     */
    static assignShift(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Toggle a member's AI access (users.ai_enabled). Opt-out model — enabled
     * by default; admins disable it per user from the Members page.
     */
    static setAiAccess(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Helper to resolve or create a custom position title using dedicated fallback default department, sub-department, and grade.
     */
    private static getOrCreateCustomPosition;
}
export default UserController;
