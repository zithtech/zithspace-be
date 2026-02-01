import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class EmployeeController {
    static createEmployee(req: AuthRequest, res: Response): Promise<void>;
    static getEmployees(req: AuthRequest, res: Response): Promise<void>;
    static getEmployeeById(req: AuthRequest, res: Response): Promise<void>;
    static updateEmployee(req: AuthRequest, res: Response): Promise<void>;
    static deleteEmployee(req: AuthRequest, res: Response): Promise<void>;
}
