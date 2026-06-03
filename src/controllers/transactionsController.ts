import { Response } from 'express';

import { 
  AuthRequest, 
  ApiResponse, 
  NotFoundError, 
  ValidationError,
  TransactionFilters
} from '@/types';
import { 
  getTransactions, 
  getTransactionById, 
  createTransaction, 
  updateTransaction, 
  deleteTransactionQuery, 
  getUserBalanceQuery, 
  getAccountBalanceQuery, 
  getMonthlySummaryQuery, 
  getTransactionSummaryQuery,
  checkUserInTenant,
  getTrashTransactions,
  restoreTransactionQuery,
  permanentlyDeleteTransactionQuery
} from '../models/transaction.model';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '../utils/transactionHistory';

export class TransactionsController {
  /**
   * Get all transactions with filtering and pagination (tenant-aware)
   */
  static async getTransactions(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const {
        page = 1,
        limit = 20,
        type,
        category,
        userId,
        member,
        startDate,
        endDate,
        search,
        sortBy = 'date',
        sortOrder = 'desc'
      } = req.query;

      // Accept both userId and member parameters
      const userIdParam = userId || member;

      const { transactions, total } = await getTransactions(req.tenantId, {
        page: Number(page),
        limit: Number(limit),
        type: type as string,
        category: category as string,
        userId: userIdParam as string,
        startDate: startDate as string,
        endDate: endDate as string,
        search: search as string,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc'
      });

      // Transform transactions to match frontend expectations
      const transformedTransactions = transactions.map((t: any) => ({
        ...t,
        member: t.user,
        type: (t.type === 'income' || t.type === 'bonus' || t.type === 'credit') ? 'credit' : 'debit'
      }));

      const totalPages = Math.ceil(total / Number(limit));

      res.status(200).json({
        success: true,
        data: transformedTransactions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: totalPages,
          hasNext: Number(page) < totalPages,
          hasPrev: Number(page) > 1
        }
      } as ApiResponse);
    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch transactions'
      } as ApiResponse);
    }
  }

  /**
   * Get transaction by ID (tenant-aware)
   */
  static async getTransactionById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const transaction = await getTransactionById(id, req.tenantId);

      if (!transaction) {
        res.status(404).json({
          success: false,
          error: 'Transaction not found'
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: transaction
      } as ApiResponse);
    } catch (error) {
      console.error('Get transaction by ID error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch transaction'
      } as ApiResponse);
    }
  }

  /**
   * Create new transaction (tenant-aware)
   */
  static async createTransaction(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const transactionData: any = req.body;

      // Accept both 'member' and 'userId' field names
      const userId = transactionData.userId || transactionData.member;

      // Validate required fields
      if (!userId || !transactionData.type || !transactionData.amount || !transactionData.description) {
        res.status(400).json({
          success: false,
          error: 'User ID, type, amount, and description are required'
        } as ApiResponse);
        return;
      }

      // Map frontend types (credit/debit) to backend types
      const typeMapping: Record<string, string> = {
        'credit': 'income',
        'debit': 'expense'
      };
      const backendType = typeMapping[transactionData.type] || transactionData.type;

      // Validate transaction type
      const validTypes = ['income', 'expense', 'bonus', 'deduction'];
      if (!validTypes.includes(backendType)) {
        res.status(400).json({
          success: false,
          error: 'Invalid transaction type. Must be: credit, debit, income, expense, bonus, or deduction'
        } as ApiResponse);
        return;
      }

      // Validate amount is positive
      if (transactionData.amount <= 0) {
        res.status(400).json({
          success: false,
          error: 'Amount must be greater than 0'
        } as ApiResponse);
        return;
      }

      // Validate user exists and belongs to tenant
      const user = await checkUserInTenant(userId, req.tenantId);

      if (!user) {
        throw new ValidationError('User not found in this tenant');
      }

      // Create transaction
      const newTransaction = await createTransaction({
        userId,
        type: backendType,
        amount: transactionData.amount,
        description: transactionData.description,
        category: transactionData.category,
        date: transactionData.date,
        metadata: transactionData.metadata
      }, req.tenantId);

      if (!newTransaction) {
        throw new Error('Failed to create transaction');
      }

      // Transform response to match frontend expectations
      const transformedTransaction = {
        ...newTransaction,
        member: newTransaction.user,
        type: (newTransaction.type === 'income' || newTransaction.type === 'bonus' || newTransaction.type === 'credit') ? 'credit' : 'debit'
      };

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.ACCOUNTS,
        page: Page.ACCOUNTS_DASHBOARD,
        action: Action.CREATE,
        actionLabel: `Created ${transformedTransaction.type} transaction: ${transactionData.description}`,
        entityType: EntityType.ACCOUNT_TRANSACTION,
        entityId: newTransaction.id,
        entityLabel: transactionData.description,
        afterData: {
          type: transformedTransaction.type,
          amount: newTransaction.amount,
          category: newTransaction.category,
          description: newTransaction.description,
        },
      });

      res.status(201).json({
        success: true,
        data: transformedTransaction,
        message: 'Transaction created successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Create transaction error:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create transaction'
      } as ApiResponse);
    }
  }

  /**
   * Update transaction (tenant-aware)
   */
  static async updateTransaction(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const updates: any = req.body;

      // Remove fields that shouldn't be updated directly
      delete updates.tenantId;
      delete updates.userId;
      delete updates.member;
      delete updates.createdAt;

      // Map frontend types (credit/debit) to backend types if provided
      if (updates.type) {
        const typeMapping: Record<string, string> = {
          'credit': 'income',
          'debit': 'expense'
        };
        updates.type = typeMapping[updates.type] || updates.type;

        // Validate transaction type
        const validTypes = ['income', 'expense', 'bonus', 'deduction'];
        if (!validTypes.includes(updates.type)) {
          res.status(400).json({
            success: false,
            error: 'Invalid transaction type. Must be: credit, debit, income, expense, bonus, or deduction'
          } as ApiResponse);
          return;
        }
      }

      // Validate amount if being updated
      if (updates.amount && updates.amount <= 0) {
        res.status(400).json({
          success: false,
          error: 'Amount must be greater than 0'
        } as ApiResponse);
        return;
      }

      // Check if transaction exists and belongs to tenant
      const existingTransaction = await getTransactionById(id, req.tenantId);

      if (!existingTransaction) {
        throw new NotFoundError('Transaction not found in this tenant');
      }

      const updatedTransaction = await updateTransaction(id, req.tenantId, updates);

      if (!updatedTransaction) {
        throw new Error('Failed to update transaction');
      }

      // Transform response to match frontend expectations
      const transformedTransaction = {
        ...updatedTransaction,
        member: updatedTransaction.user,
        type: (updatedTransaction.type === 'income' || updatedTransaction.type === 'bonus' || updatedTransaction.type === 'credit') ? 'credit' : 'debit'
      };

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.ACCOUNTS,
        page: Page.ACCOUNTS_DASHBOARD,
        action: Action.UPDATE,
        actionLabel: `Updated transaction: ${updatedTransaction.description}`,
        entityType: EntityType.ACCOUNT_TRANSACTION,
        entityId: id,
        entityLabel: updatedTransaction.description,
        afterData: {
          type: transformedTransaction.type,
          amount: updatedTransaction.amount,
          category: updatedTransaction.category,
          description: updatedTransaction.description,
        },
      });

      res.status(200).json({
        success: true,
        data: transformedTransaction,
        message: 'Transaction updated successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Update transaction error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update transaction'
      } as ApiResponse);
    }
  }

  /**
   * Delete transaction (tenant-aware)
   */
  static async deleteTransaction(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const existingTransaction = await getTransactionById(id, req.tenantId);

      if (!existingTransaction) {
        throw new NotFoundError('Transaction not found in this tenant');
      }

      await deleteTransactionQuery(id, req.tenantId);

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.ACCOUNTS,
        page: Page.ACCOUNTS_DASHBOARD,
        action: Action.DELETE,
        actionLabel: `Deleted transaction: ${existingTransaction.description}`,
        entityType: EntityType.ACCOUNT_TRANSACTION,
        entityId: id,
        entityLabel: existingTransaction.description,
        beforeData: {
          type: existingTransaction.type,
          amount: existingTransaction.amount,
          description: existingTransaction.description,
        },
      });

      res.status(200).json({
        success: true,
        message: 'Transaction deleted successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Delete transaction error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete transaction'
      } as ApiResponse);
    }
  }

  /**
   * Get user balance by user ID (tenant-aware)
   */
  static async getUserBalance(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { userId } = req.params;

      const balance = await getUserBalanceQuery(userId, req.tenantId);

      if (!balance) {
        throw new NotFoundError('User not found in this tenant');
      }

      res.status(200).json({
        success: true,
        data: balance
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get user balance error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to fetch user balance'
      } as ApiResponse);
    }
  }

  /**
   * Get overall account balance (tenant-aware)
   */
  static async getAccountBalance(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const balance = await getAccountBalanceQuery(req.tenantId);

      res.status(200).json({
        success: true,
        data: balance
      } as ApiResponse);
    } catch (error) {
      console.error('Get account balance error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch account balance'
      } as ApiResponse);
    }
  }

  /**
   * Get monthly summary (tenant-aware)
   */
  static async getMonthlySummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { year, month } = req.query;
      
      const currentDate = new Date();
      const targetYear = Number(year) || currentDate.getFullYear();
      const targetMonth = Number(month) || currentDate.getMonth() + 1;

      // Calculate date range
      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0);
      endDate.setHours(23, 59, 59, 999);

      const summary = await getMonthlySummaryQuery(
        req.tenantId, 
        startDate, 
        endDate, 
        targetYear, 
        targetMonth, 
        startDate.toLocaleString('default', { month: 'long' })
      );

      res.status(200).json({
        success: true,
        data: summary
      } as ApiResponse);
    } catch (error) {
      console.error('Get monthly summary error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch monthly summary'
      } as ApiResponse);
    }
  }

  /**
   * Get transaction summary with analytics (tenant-aware)
   */
  static async getTransactionSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { startDate, endDate } = req.query;
      
      let dateFilter = {};
      if (startDate && endDate) {
        dateFilter = {
          date: {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string),
          }
        };
      }

      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const summary = await getTransactionSummaryQuery(req.tenantId, start, end);

      res.status(200).json({
        success: true,
        data: summary
      } as ApiResponse);
    } catch (error) {
      console.error('Get transaction summary error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch transaction summary'
      } as ApiResponse);
    }
  }
  /**
   * Get trashed transactions (tenant-aware)
   */
  static async getTrashTransactions(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { page = 1, limit = 20, search } = req.query;

      const { transactions, total } = await getTrashTransactions(req.tenantId, {
        page: Number(page),
        limit: Number(limit),
        search: search as string
      });

      const transformedTransactions = transactions.map((t: any) => ({
        ...t,
        member: t.user,
        type: (t.type === 'income' || t.type === 'bonus' || t.type === 'credit') ? 'credit' : 'debit'
      }));

      const totalPages = Math.ceil(total / Number(limit));

      res.status(200).json({
        success: true,
        data: transformedTransactions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: totalPages,
          hasNext: Number(page) < totalPages,
          hasPrev: Number(page) > 1
        }
      } as ApiResponse);
    } catch (error) {
      console.error('Get trash transactions error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch trash transactions'
      } as ApiResponse);
    }
  }

  /**
   * Restore a trashed transaction (tenant-aware)
   */
  static async restoreTransaction(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const restored = await restoreTransactionQuery(id, req.tenantId);

      if (!restored) {
        res.status(404).json({
          success: false,
          error: 'Transaction not found in trash'
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Transaction restored successfully'
      } as ApiResponse);
    } catch (error) {
      console.error('Restore transaction error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to restore transaction'
      } as ApiResponse);
    }
  }

  /**
   * Permanently delete a trashed transaction (tenant-aware)
   */
  static async permanentlyDeleteTransaction(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const deleted = await permanentlyDeleteTransactionQuery(id, req.tenantId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Transaction not found in trash'
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Transaction permanently deleted'
      } as ApiResponse);
    } catch (error) {
      console.error('Permanent delete transaction error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to permanently delete transaction'
      } as ApiResponse);
    }
  }
}

export default TransactionsController;
