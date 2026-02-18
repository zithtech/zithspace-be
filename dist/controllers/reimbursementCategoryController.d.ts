import { Response } from "express";
import { AuthRequest } from "@/types";
declare class ReimbursementCategoryController {
    createCategory(req: AuthRequest, res: Response): Promise<void>;
    getCategories(req: AuthRequest, res: Response): Promise<void>;
    getCategoryById(req: AuthRequest, res: Response): Promise<void>;
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
    updateCategory(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get request by ID
     */
    static getRequestById(req: AuthRequest, res: Response): Promise<void>;
    deleteCategory(req: AuthRequest, res: Response): Promise<void>;
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
declare const _default: ReimbursementCategoryController;
export default _default;
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
