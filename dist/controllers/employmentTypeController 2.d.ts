import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class EmploymentTypeController {
    static createEmploymentType(req: AuthRequest, res: Response): Promise<void>;
    static getAllEmploymentTypes(req: AuthRequest, res: Response): Promise<void>;
    static getEmploymentTypeById(req: AuthRequest, res: Response): Promise<void>;
    static updateEmploymentType(req: AuthRequest, res: Response): Promise<void>;
    static deleteEmploymentType(req: AuthRequest, res: Response): Promise<void>;
}
