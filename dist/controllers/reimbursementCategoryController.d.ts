import { Response } from "express";
import { AuthRequest } from "@/types";
declare class ReimbursementCategoryController {
    createCategory(req: AuthRequest, res: Response): Promise<void>;
    getCategories(req: AuthRequest, res: Response): Promise<void>;
    getCategoryById(req: AuthRequest, res: Response): Promise<void>;
    updateCategory(req: AuthRequest, res: Response): Promise<void>;
    deleteCategory(req: AuthRequest, res: Response): Promise<void>;
}
declare const _default: ReimbursementCategoryController;
export default _default;
