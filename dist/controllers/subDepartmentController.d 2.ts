import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class SubDepartmentController {
    static createSubDepartment(req: AuthRequest, res: Response): Promise<void>;
    static getAllSubDepartments(req: AuthRequest, res: Response): Promise<void>;
    static getSubDepartmentById(req: AuthRequest, res: Response): Promise<void>;
    static updateSubDepartment(req: AuthRequest, res: Response): Promise<void>;
    static deleteSubDepartment(req: AuthRequest, res: Response): Promise<void>;
}
