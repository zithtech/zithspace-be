import { Response } from 'express';
import { AuthRequest } from '../types';
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
     *  CREATE INVOICE - PostgreSQL Version
     * ==================== */
    static createInvoice(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  UPDATE INVOICE - PostgreSQL Version
     * ==================== */
    static updateInvoice(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  GET INVOICE BY ID - PostgreSQL Version
     * ==================== */
    static getInvoiceById(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  GET INVOICES - PostgreSQL Version
     * ==================== */
    static getInvoices(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  DELETE INVOICE (Soft Delete) - PostgreSQL Version
     * ==================== */
    static deleteInvoice(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  RESTORE INVOICE - PostgreSQL Version
     * ==================== */
    static restoreInvoice(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  HARD DELETE INVOICE (Permanent) - PostgreSQL Version
     * ==================== */
    static permanentDeleteInvoice(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  GET DELETED INVOICES - PostgreSQL Version
     * ==================== */
    static getDeletedInvoices(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  BULK RESTORE INVOICES - PostgreSQL Version
     * ==================== */
    static bulkRestoreInvoices(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  BULK HARD DELETE INVOICES - PostgreSQL Version
     * ==================== */
    static bulkPermanentDeleteInvoices(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  BULK DELETE INVOICES (Soft Delete) - PostgreSQL Version
     * ==================== */
    static bulkDeleteInvoices(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  SEND EMAIL - PostgreSQL Version
     * ==================== */
    static sendEmail(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  UPDATE STATUS - PostgreSQL Version
     * ==================== */
    static updateStatus(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  DOWNLOAD INVOICE - PostgreSQL Version
     * ==================== */
    static downloadInvoice(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  GET PAYMENT HISTORY - PostgreSQL Version
     * ==================== */
    static getPaymentHistory(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  GET NEXT INVOICE NUMBER - PostgreSQL Version
     * ==================== */
    static getNextInvoiceNumber(req: AuthRequest, res: Response): Promise<void>;
    /** ====================
     *  CHECK PDF STATUS - PostgreSQL Version
     * ==================== */
    static checkPDFStatus(req: AuthRequest, res: Response): Promise<void>;
}
