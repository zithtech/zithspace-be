import { Response } from 'express';
import { AuthRequest } from '@/types';
export declare class InvoiceSettingsController {
    private static sanitizeProfile;
    static getProfiles(req: AuthRequest, res: Response): Promise<void>;
    static getProfileById(req: AuthRequest, res: Response): Promise<void>;
    static createProfile(req: AuthRequest, res: Response): Promise<void>;
    static updateProfile(req: AuthRequest, res: Response): Promise<void>;
    static hardDeleteProfile(req: AuthRequest, res: Response): Promise<void>;
    static activateProfile(req: AuthRequest, res: Response): Promise<void>;
    static getActiveProfiles(req: AuthRequest, res: Response): Promise<void>;
}
export default InvoiceSettingsController;
