import { Response } from "express";
import { AuthRequest } from "@/types";
export declare const getLeaveBalances: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
