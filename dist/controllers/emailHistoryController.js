"use strict";
// zithspace-be/src/controllers/emailHistoryController.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailHistoryController = void 0;
const database_1 = require("@/config/database");
const emailLoggerService_1 = require("@/services/emailLoggerService");
const types_1 = require("@/types");
class EmailHistoryController {
    /**
     * Get email logs with filters and pagination
     */
    static async getEmailLogs(req, res) {
        try {
            if (!req.tenantId) {
                throw new types_1.ValidationError('Tenant context required');
            }
            const { page = '1', limit = '20', module, moduleId, customerId, status, search, startDate, endDate } = req.query;
            const result = await emailLoggerService_1.EmailLoggerService.getEmailLogs(req.tenantId, {
                module: module,
                moduleId: moduleId,
                customerId: customerId,
                status: status,
                search: search,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined
            }, {
                page: parseInt(page),
                limit: parseInt(limit)
            });
            res.status(200).json({
                success: true,
                ...result
            });
        }
        catch (error) {
            console.error('Get email logs error:', error);
            res.status(error instanceof types_1.ValidationError ? 400 : 500).json({
                success: false,
                error: error.message || 'Failed to fetch email logs'
            });
        }
    }
    /**
     * Get single email log by ID
     */
    static async getEmailLogById(req, res) {
        try {
            if (!req.tenantId) {
                throw new types_1.ValidationError('Tenant context required');
            }
            const { id } = req.params;
            const emailLog = await emailLoggerService_1.EmailLoggerService.getEmailById(id, req.tenantId);
            if (!emailLog) {
                throw new types_1.NotFoundError('Email log not found');
            }
            res.status(200).json({
                success: true,
                data: emailLog
            });
        }
        catch (error) {
            console.error('Get email log by id error:', error);
            res.status(error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message || 'Failed to fetch email log'
            });
        }
    }
    /**
     * Get all unique modules
     */
    static async getModules(req, res) {
        try {
            if (!req.tenantId) {
                throw new types_1.ValidationError('Tenant context required');
            }
            const modules = await emailLoggerService_1.EmailLoggerService.getModules(req.tenantId);
            res.status(200).json({
                success: true,
                data: modules
            });
        }
        catch (error) {
            console.error('Get modules error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to fetch modules'
            });
        }
    }
    /**
     * Get email statistics
     */
    static async getStats(req, res) {
        try {
            if (!req.tenantId) {
                throw new types_1.ValidationError('Tenant context required');
            }
            const stats = await emailLoggerService_1.EmailLoggerService.getStats(req.tenantId);
            res.status(200).json({
                success: true,
                data: stats
            });
        }
        catch (error) {
            console.error('Get stats error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to fetch stats'
            });
        }
    }
    /**
     * Get invoice-specific email history
     */
    static async getInvoiceEmailHistory(req, res) {
        try {
            if (!req.tenantId) {
                throw new types_1.ValidationError('Tenant context required');
            }
            const { invoiceId } = req.params;
            // Verify invoice exists and belongs to tenant
            const invoice = await database_1.prisma.invoice.findFirst({
                where: {
                    id: invoiceId,
                    tenantId: req.tenantId,
                    deletedAt: null
                }
            });
            if (!invoice) {
                throw new types_1.NotFoundError('Invoice not found');
            }
            // Get email logs for this invoice
            const result = await emailLoggerService_1.EmailLoggerService.getEmailLogs(req.tenantId, {
                module: 'INVOICE',
                moduleId: invoiceId
            }, {
                page: 1,
                limit: 100 // Get all history for this invoice
            });
            res.status(200).json({
                success: true,
                data: result.data,
                invoice: {
                    id: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    customerName: invoice.customerSnapshot?.companyName || 'Unknown',
                    total: invoice.total,
                    status: invoice.status
                }
            });
        }
        catch (error) {
            console.error('Get invoice email history error:', error);
            res.status(error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message || 'Failed to fetch invoice email history'
            });
        }
    }
}
exports.EmailHistoryController = EmailHistoryController;
//# sourceMappingURL=emailHistoryController.js.map