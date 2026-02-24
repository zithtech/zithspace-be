import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class TimesheetController {
    /**
     * Create a new timesheet
     */
    static createTimesheet(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create a new timesheet
     */
    /**
     * Get all timesheets for current tenant with pagination
     */
    static getTimesheets(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get timesheet by ID
     */
    static getTimesheetById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Approve or reject a timesheet
     */
    static approveTimesheet(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update timesheet rows or basic info
     */
    static updateTimesheet(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete timesheet (soft delete or permanent)
     */
    static deleteTimesheet(req: AuthRequest, res: Response): Promise<void>;
    static getTimesheetMeta(req: AuthRequest, res: Response): Promise<void>;
    static submitTimesheet(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
}
export default TimesheetController;
