import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class ReimbursementController {
    static create(req: AuthRequest, res: Response): Promise<void>;
    static getAll(req: AuthRequest, res: Response): Promise<void>;
    static getById(req: AuthRequest, res: Response): Promise<void>;
    static update(req: AuthRequest, res: Response): Promise<void>;
    static delete(req: AuthRequest, res: Response): Promise<void>;
}
