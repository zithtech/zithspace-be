import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class ReimbursementSettingsCategoriesController {
    /**
     * CREATE CATEGORY
     */
    static createCategory(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET ALL CATEGORIES
     */
    static getCategories(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET BY ID
     */
    static getCategoryById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * UPDATE CATEGORY
     */
    static updateCategory(req: AuthRequest, res: Response): Promise<void>;
    /**
     * DELETE CATEGORY
     */
    static deleteCategory(req: AuthRequest, res: Response): Promise<void>;
}
export default ReimbursementSettingsCategoriesController;
