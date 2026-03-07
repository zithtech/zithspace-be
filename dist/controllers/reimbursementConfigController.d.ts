import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class ReimbursementConfigurationController {
    /**
     * CREATE
     */
    static createConfig(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET ALL (with calculated amount)
     */
    static getConfigs(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET BY ID (with calculation)
     */
    static getConfigById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * UPDATE
     */
    static updateConfig(req: AuthRequest, res: Response): Promise<void>;
    /**
     * DELETE
     */
    static deleteConfig(req: AuthRequest, res: Response): Promise<void>;
}
export default ReimbursementConfigurationController;
