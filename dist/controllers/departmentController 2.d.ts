import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class DepartmentController {
    static createDepartment(req: AuthRequest, res: Response): Promise<void>;
    static getAllDepartments(req: AuthRequest, res: Response): Promise<void>;
    static getDepartmentById(req: AuthRequest, res: Response): Promise<void>;
    static updateDepartment(req: AuthRequest, res: Response): Promise<void>;
    static deleteDepartment(req: AuthRequest, res: Response): Promise<void>;
}
