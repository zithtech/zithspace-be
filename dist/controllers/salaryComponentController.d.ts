import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class SalaryComponentController {
    /** =========================
     * GET ALL COMPONENTS
     ========================== */
    static getSalaryComponents(req: AuthRequest, res: Response): Promise<void>;
    /** =========================
     * GET COMPONENT BY ID
     ========================== */
    static getSalaryComponentById(req: AuthRequest, res: Response): Promise<void>;
    /** =========================
     * CREATE COMPONENT
     ========================== */
    static createSalaryComponent(req: AuthRequest, res: Response): Promise<void>;
    /** =========================
     * UPDATE COMPONENT
     ========================== */
    static updateSalaryComponent(req: AuthRequest, res: Response): Promise<void>;
    /** =========================
     * UPDATE STATUS ONLY
     ========================== */
    static updateSalaryStatus(req: AuthRequest, res: Response): Promise<void>;
    /** =========================
   * DELETE COMPONENT
   ========================== */
    static deleteSalaryComponent(req: AuthRequest, res: Response): Promise<void>;
}
