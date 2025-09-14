import { Response } from 'express';
import { AuthRequest } from '@/types';
export declare class ClientController {
    /**
     * Get all clients with filtering, pagination, and search (tenant-aware)
     */
    static getClients(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get client by ID (tenant-aware)
     */
    static getClientById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create new client (tenant-aware)
     */
    static createClient(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update client (tenant-aware)
     */
    static updateClient(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete client (soft delete - tenant-aware)
     */
    static deleteClient(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get client statistics (tenant-aware)
     */
    static getClientStats(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get clients for dropdown/select (tenant-aware)
     */
    static getClientsForSelect(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Bulk update client status (tenant-aware)
     */
    static bulkUpdateClientStatus(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Search clients (tenant-aware)
     */
    static searchClients(req: AuthRequest, res: Response): Promise<void>;
}
export default ClientController;
