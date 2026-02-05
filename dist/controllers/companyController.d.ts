import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class CompanyController {
    /** =========================
     * GET ALL COMPANIES
     ========================== */
    static getCompanies(req: AuthRequest, res: Response): Promise<void>;
    /** =========================
     * GET COMPANY BY ID
     ========================== */
    static getCompanyById(req: AuthRequest, res: Response): Promise<void>;
    /** =========================
     * CREATE COMPANY
     ========================== */
    static createCompany(req: AuthRequest, res: Response): Promise<void>;
    /** =========================
     * UPDATE COMPANY
     ========================== */
    static updateCompany(req: AuthRequest, res: Response): Promise<void>;
    /** =========================
     * SET ACTIVE COMPANY
     ========================== */
    static setActiveCompany(req: AuthRequest, res: Response): Promise<void>;
    /** =========================
   * DELETE COMPANY
   ========================== */
    static deleteCompany(req: AuthRequest, res: Response): Promise<void>;
}
