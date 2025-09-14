import { Response } from 'express';
import { AuthRequest } from '@/types';
export declare class TransactionsController {
    /**
     * Get all transactions with filtering and pagination (tenant-aware)
     */
    static getTransactions(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get transaction by ID (tenant-aware)
     */
    static getTransactionById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create new transaction (tenant-aware)
     */
    static createTransaction(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Update transaction (tenant-aware)
     */
    static updateTransaction(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete transaction (tenant-aware)
     */
    static deleteTransaction(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get user balance by user ID (tenant-aware)
     */
    static getUserBalance(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get overall account balance (tenant-aware)
     */
    static getAccountBalance(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get monthly summary (tenant-aware)
     */
    static getMonthlySummary(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get transaction summary with analytics (tenant-aware)
     */
    static getTransactionSummary(req: AuthRequest, res: Response): Promise<void>;
}
export default TransactionsController;
