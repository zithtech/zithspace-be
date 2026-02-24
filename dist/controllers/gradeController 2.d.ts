import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class GradeController {
    static createGrade(req: AuthRequest, res: Response): Promise<void>;
    static getAllGrades(req: AuthRequest, res: Response): Promise<void>;
    static getGradeById(req: AuthRequest, res: Response): Promise<void>;
    static updateGrade(req: AuthRequest, res: Response): Promise<void>;
    static deleteGrade(req: AuthRequest, res: Response): Promise<void>;
}
