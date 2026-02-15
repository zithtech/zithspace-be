import { Response } from 'express';
import { AuthRequest } from '@/types';
export declare class ReimbursementCategoryController {
    /**
     * Get all reimbursement categories with filtering and pagination
     */
    static getCategories(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get category by ID
     */
    static getCategoryById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create new reimbursement category
     */
    static createCategory(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update reimbursement category
     */
    static updateCategory(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete reimbursement category
     */
    static deleteCategory(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Upload file (Generic)
     */
    static uploadFile(req: AuthRequest, res: Response): Promise<void>;
}
export declare class ReimbursementRequestController {
    /**
     * Create a new reimbursement request
     */
    static createRequest(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get requests (My Requests, Manager Approvals, Finance View)
     */
    static getRequests(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get request by ID
     */
    static getRequestById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update request (Edit)
     */
    static updateRequest(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete request
     */
    static deleteRequest(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Manager Action (Approve, Reject, Clarify)
     */
    static managerAction(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Finance Action (Paid, Reject, On Hold)
     */
    static financeAction(req: AuthRequest, res: Response): Promise<void>;
}
export declare class ReimbursementItemController {
    /**
     * Add item to request
     */
    static addItem(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update item
     */
    static updateItem(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete item
     */
    static deleteItem(req: AuthRequest, res: Response): Promise<void>;
}
export declare class ReimbursementApprovalController {
    static getHistory(req: AuthRequest, res: Response): Promise<void>;
}
export declare class ReimbursementAttachmentController {
    static addAttachment(req: AuthRequest, res: Response): Promise<void>;
    static deleteAttachment(req: AuthRequest, res: Response): Promise<void>;
    static getAttachments(req: AuthRequest, res: Response): Promise<void>;
}
