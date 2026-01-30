import { Response } from "express";
import { AuthRequest } from "@/types";
declare class ReimbursementRequestController {
    createRequest(req: AuthRequest, res: Response): Promise<void>;
    getRequests(req: AuthRequest, res: Response): Promise<void>;
    getRequestById(req: AuthRequest, res: Response): Promise<void>;
    submitRequest(req: AuthRequest, res: Response): Promise<void>;
    updateRequest(req: AuthRequest, res: Response): Promise<void>;
}
declare const _default: ReimbursementRequestController;
export default _default;
