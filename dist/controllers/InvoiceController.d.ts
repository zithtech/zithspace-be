import { Response } from 'express';
import { AuthRequest } from '@/types';
export declare class InvoiceController {
    /** ====================
     *  Helper: Calculate totals with tax inclusive support
     * ==================== */
    private static calculateTotals;
    /** ====================
     *  Helper: Generate invoice number
     * ==================== */
    private static generateInvoiceNumber;
    /** ====================
     *  Get next invoice number (pre-generate)
     * ==================== */
    static getNextInvoiceNumber(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  Create Invoice
     * ==================== */
    static createInvoice(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  Update invoice
     * ==================== */
    static updateInvoice(req: AuthRequest, res: Response): Promise<void>;
    static getInvoiceById(req: AuthRequest, res: Response): Promise<void>;
    static deleteInvoice(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     * Send Invoice Email
     * ==================== */
    static sendEmail(req: AuthRequest, res: Response): Promise<void>;
    static updateStatus(req: AuthRequest, res: Response): Promise<void>;
    static getInvoices(req: AuthRequest, res: Response): Promise<void>;
    static downloadInvoice(req: AuthRequest, res: Response): Promise<void>;
    static getPaymentHistory(req: AuthRequest, res: Response): Promise<void>;
    static checkPDFStatus(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Restore a soft-deleted invoice
     */
    static restoreInvoice(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Permanently delete invoice from database (hard delete)
     * Use with caution - this cannot be undone!
     */
    static permanentDeleteInvoice(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get all soft-deleted invoices
     */
    static getDeletedInvoices(req: AuthRequest, res: Response): Promise<void>;
}
