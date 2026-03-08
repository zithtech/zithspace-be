import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class ReimbursementController {
    static create(req: AuthRequest, res: Response): Promise<void>;
    static update(req: AuthRequest, res: Response): Promise<void>;
    static getAll(req: AuthRequest, res: Response): Promise<void>;
    static getById(req: AuthRequest, res: Response): Promise<void>;
    static delete(req: AuthRequest, res: Response): Promise<void>;
    static getApprovalList(req: AuthRequest, res: Response): Promise<void>;
    static getUserReimbursementLimits(req: AuthRequest, res: Response): Promise<void>;
    private static updateReimbursementStatus;
    static approve(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    static reject(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    static markAsPaid(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    static getFinanceItems(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
}
export default ReimbursementController;
