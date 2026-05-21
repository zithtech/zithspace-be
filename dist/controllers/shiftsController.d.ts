import { Response } from 'express';
import { AuthRequest } from '@/types';
export declare class ShiftsController {
    private static ensureDefaultShifts;
    /**
     * Get all shifts with filtering and pagination (tenant-aware)
     */
    static getShifts(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get shift by ID (tenant-aware)
     */
    static getShiftById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create new shift (tenant-aware)
     */
    static createShift(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update shift (tenant-aware)
     */
    static updateShift(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete shift (soft delete - tenant-aware)
     */
    static deleteShift(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Activate shift (tenant-aware)
     */
    static activateShift(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Assign shift to user (tenant-aware)
     */
    static assignShiftToUser(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Remove shift assignment from user (tenant-aware)
     */
    static removeShiftFromUser(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get shifts for dropdown/select (tenant-aware)
     */
    static getShiftsForSelect(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get users assigned to a specific shift (tenant-aware)
     */
    static getUsersByShift(req: AuthRequest, res: Response): Promise<void>;
}
export default ShiftsController;
