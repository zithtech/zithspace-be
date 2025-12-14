import { Response } from "express";
import { AuthRequest } from "@/types";
declare class LeaveController {
    applyLeave(req: AuthRequest, res: Response): Promise<void>;
    getMyLeaves(req: AuthRequest, res: Response): Promise<void>;
    getPendingApprovals(req: AuthRequest, res: Response): Promise<void>;
    getAllLeaves(req: AuthRequest, res: Response): Promise<void>;
    getLeaveById(req: AuthRequest, res: Response): Promise<void>;
    approveLeave(req: AuthRequest, res: Response): Promise<void>;
    rejectLeave(req: AuthRequest, res: Response): Promise<void>;
    cancelLeave(req: AuthRequest, res: Response): Promise<void>;
}
declare const _default: LeaveController;
export default _default;
