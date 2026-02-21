import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class AddressController {
    static createAddress(req: AuthRequest, res: Response): Promise<void>;
    static getAddressesByEmployee(req: AuthRequest, res: Response): Promise<void>;
    static updateAddress(req: AuthRequest, res: Response): Promise<void>;
    static deleteAddress(req: AuthRequest, res: Response): Promise<void>;
}
