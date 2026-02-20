import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class PositionController {
    static createPosition(req: AuthRequest, res: Response): Promise<void>;
    static getPositions(req: AuthRequest, res: Response): Promise<void>;
    static getPositionById(req: AuthRequest, res: Response): Promise<void>;
    static updatePosition(req: AuthRequest, res: Response): Promise<void>;
    static deletePosition(req: AuthRequest, res: Response): Promise<void>;
}
