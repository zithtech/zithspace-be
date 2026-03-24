// zithspace-be/src/controllers/emailHistoryController.ts

import { Request, Response } from 'express';
import { prisma } from "@/config/database";
import { EmailLoggerService } from "@/services/emailLoggerService";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
  
} from "@/types";

export class EmailHistoryController {
  
  /**
   * Get email logs with filters and pagination
   */
  static async getEmailLogs(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const {
        page = '1',
        limit = '20',
        module,
        moduleId,
        customerId,
        status,
        search,
        startDate,
        endDate
      } = req.query;

      const result = await EmailLoggerService.getEmailLogs(
        req.tenantId,
        {
          module: module as string,
          moduleId: moduleId as string,
          customerId: customerId as string,
          status: status as string,
          search: search as string,
          startDate: startDate ? new Date(startDate as string) : undefined,
          endDate: endDate ? new Date(endDate as string) : undefined
        },
        {
          page: parseInt(page as string),
          limit: parseInt(limit as string)
        }
      );

      res.status(200).json({
        success: true,
        ...result
      });

    } catch (error: any) {
      console.error('Get email logs error:', error);
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        error: error.message || 'Failed to fetch email logs'
      });
    }
  }

  /**
   * Get single email log by ID
   */
  static async getEmailLogById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { id } = req.params;

      const emailLog = await EmailLoggerService.getEmailById(id, req.tenantId);

      if (!emailLog) {
        throw new NotFoundError('Email log not found');
      }

      res.status(200).json({
        success: true,
        data: emailLog
      });

    } catch (error: any) {
      console.error('Get email log by id error:', error);
      res.status(error instanceof NotFoundError ? 404 : 500).json({
        success: false,
        error: error.message || 'Failed to fetch email log'
      });
    }
  }

  /**
   * Get all unique modules
   */
  static async getModules(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const modules = await EmailLoggerService.getModules(req.tenantId);

      res.status(200).json({
        success: true,
        data: modules
      });

    } catch (error: any) {
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
  static async getStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const stats = await EmailLoggerService.getStats(req.tenantId);

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error: any) {
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
  static async getInvoiceEmailHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { invoiceId } = req.params;

      // Verify invoice exists and belongs to tenant
      const invoice = await prisma.invoice.findFirst({
        where: {
          id: invoiceId,
          tenantId: req.tenantId,
          deletedAt: null
        }
      });

      if (!invoice) {
        throw new NotFoundError('Invoice not found');
      }

      // Get email logs for this invoice
      const result = await EmailLoggerService.getEmailLogs(
        req.tenantId,
        {
          module: 'INVOICE',
          moduleId: invoiceId
        },
        {
          page: 1,
          limit: 100 // Get all history for this invoice
        }
      );

      res.status(200).json({
        success: true,
        data: result.data,
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerName: (invoice.customerSnapshot as any)?.companyName || 'Unknown',
          total: (invoice as any).grandTotal,
          status: invoice.status
        }
      });

    } catch (error: any) {
      console.error('Get invoice email history error:', error);
      res.status(error instanceof NotFoundError ? 404 : 500).json({
        success: false,
        error: error.message || 'Failed to fetch invoice email history'
      });
    }
  }
}