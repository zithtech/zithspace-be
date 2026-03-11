import { Response } from "express";
import { AuthRequest } from "@/types";
export declare const applyLeave: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getLeaveRequests: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateLeaveStatus: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const cancelLeaveRequest: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getPendingApprovals: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
