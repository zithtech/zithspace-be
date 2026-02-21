import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class EmployeeTimelineController {
    static createTimeline(req: AuthRequest, res: Response): Promise<void>;
    static getTimelineByEmployee(req: AuthRequest, res: Response): Promise<void>;
    static getTimelineById(req: AuthRequest, res: Response): Promise<void>;
    static updateTimeline(req: AuthRequest, res: Response): Promise<void>;
    static deleteTimeline(req: AuthRequest, res: Response): Promise<void>;
}
