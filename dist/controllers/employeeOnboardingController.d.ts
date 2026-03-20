import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class EmployeeOnboardingController {
    static create(req: AuthRequest, res: Response): Promise<void>;
    static getAll(req: AuthRequest, res: Response): Promise<void>;
    static getUpcomingBirthdays(req: AuthRequest, res: Response): Promise<void>;
    static getById(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    static update(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    static delete(req: AuthRequest, res: Response): Promise<void>;
}
