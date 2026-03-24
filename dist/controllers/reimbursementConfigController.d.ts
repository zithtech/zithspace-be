import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class ReimbursementConfigurationController {
    static createConfig(req: AuthRequest, res: Response): Promise<void>;
    static getConfigs(req: AuthRequest, res: Response): Promise<void>;
    static getConfigById(req: AuthRequest, res: Response): Promise<void>;
    static updateConfig(req: AuthRequest, res: Response): Promise<void>;
    static deleteConfig(req: AuthRequest, res: Response): Promise<void>;
}
export default ReimbursementConfigurationController;
