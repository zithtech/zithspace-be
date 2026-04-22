import { Response } from "express";
import { AuthRequest } from "../types";
export declare class CustomerController {
    /**
     * Get all customers (tenant-aware, with pagination and search)
     */
    static getCustomers(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get customer by ID
     */
    static getCustomerById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create customer (admin only)
     */
    static createCustomer(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update customer (admin only)
     */
    static updateCustomer(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete customer (admin only)
     */
    static deleteCustomer(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get customers for dropdown/select
     */
    static getCustomersForSelect(req: AuthRequest, res: Response): Promise<void>;
}
