import { Request, Response } from "express";
export declare class LeaveTypeController {
    static createLeaveType(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getAllLeaveTypes(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getLeaveTypeById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static updateLeaveType(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static deleteLeaveType(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
