import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class LeaveTypeController {
    static createLeaveType(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    static getAllLeaveTypes(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    static getLeaveTypeById(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    static updateLeaveType(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    static deleteLeaveType(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
}
