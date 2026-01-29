import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class SalaryComponentController {
    /** =========================
     * GET ALL COMPONENTS
     ========================== */
    static getComponents(req: AuthRequest, res: Response): Promise<void>;
    /** =========================
     * GET COMPONENT BY ID
     ========================== */
    static getComponentById(req: AuthRequest, res: Response): Promise<void>;
    /** =========================
     * CREATE COMPONENT
     ========================== */
    static createComponent(req: AuthRequest, res: Response): Promise<void>;
    /** =========================
     * UPDATE COMPONENT
     ========================== */
    static updateComponent(req: AuthRequest, res: Response): Promise<void>;
    /** =========================
     * UPDATE STATUS ONLY
     ========================== */
    static updateStatus(req: AuthRequest, res: Response): Promise<void>;
}
