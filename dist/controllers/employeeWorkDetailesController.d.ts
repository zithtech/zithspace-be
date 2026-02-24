import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class EmployeeWorkDetailController {
    static createWorkDetail(req: AuthRequest, res: Response): Promise<void>;
    static getWorkDetailByEmployee(req: AuthRequest, res: Response): Promise<void>;
    static getWorkDetailById(req: AuthRequest, res: Response): Promise<void>;
    static updateWorkDetail(req: AuthRequest, res: Response): Promise<void>;
    static deleteWorkDetail(req: AuthRequest, res: Response): Promise<void>;
}
