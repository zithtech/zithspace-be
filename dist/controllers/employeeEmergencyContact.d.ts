import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class EmployeeEmergencyContactController {
    static createContact(req: AuthRequest, res: Response): Promise<void>;
    static getContactsByEmployee(req: AuthRequest, res: Response): Promise<void>;
    static getContactById(req: AuthRequest, res: Response): Promise<void>;
    static updateContact(req: AuthRequest, res: Response): Promise<void>;
    static deleteContact(req: AuthRequest, res: Response): Promise<void>;
}
