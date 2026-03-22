import { Response } from "express";
import { AuthRequest } from "@/types";
export declare const createLeaveAdjustment: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getLeaveAdjustments: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateLeaveAdjustment: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteLeaveAdjustment: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
