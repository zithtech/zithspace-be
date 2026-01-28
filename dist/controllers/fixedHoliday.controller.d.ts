import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class FixedHolidayController {
    static createFixedHoliday(req: AuthRequest, res: Response): Promise<void>;
    static getFixedHolidays(req: AuthRequest, res: Response): Promise<void>;
    static getFixedHolidayById(req: AuthRequest, res: Response): Promise<void>;
    static updateFixedHoliday(req: AuthRequest, res: Response): Promise<void>;
    static deleteFixedHoliday(req: AuthRequest, res: Response): Promise<void>;
}
