import { Response } from 'express';
import { tenantAwarePrisma } from '@/config/database';
import { 
  AuthRequest, 
  ApiResponse, 
  NotFoundError, 
  ValidationError,
  CreateTransactionData,
  TransactionFilters
} from '@/types';

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

      // Build filter query
      const where: any = {
        tenantId: req.tenantId,
      };

      if (type) where.type = type;
      if (category) where.category = category;
      
      // Accept both userId and member parameters
      const userIdParam = userId || member;
      if (userIdParam) where.userId = userIdParam as string;

      if (startDate && endDate) {
        where.date = {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string),
        };
      }

      if (search) {
        where.OR = [
          { description: { contains: search as string, mode: 'insensitive' } },
          { category: { contains: search as string, mode: 'insensitive' } },
          { user: { name: { contains: search as string, mode: 'insensitive' } } }
        ];
      }

      // Build sort object
      const orderBy: any = {};
      orderBy[sortBy as string] = sortOrder === 'desc' ? 'desc' : 'asc';

      // Execute query with pagination
      const skip = (Number(page) - 1) * Number(limit);
      
      const [transactions, total] = await Promise.all([
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.transaction.findMany({
            where,
            include: {
              user: {
                select: { id: true, name: true, workEmail: true, position: true }
              }
            },
            orderBy: [
              orderBy,
              { createdAt: 'desc' }
            ],
            skip,
            take: Number(limit),
          });
        }),
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.transaction.count({ where });
        })
      ]);

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

      const transaction = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        return await client.transaction.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          },
          include: {
            user: {
              select: { id: true, name: true, workEmail: true, position: true }
            }
          }
        });
      });

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

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Validate user exists and belongs to tenant
        const user = await client.user.findFirst({
          where: {
            id: userId,
            tenantId: req.tenantId,
            isActive: true,
          }
        });

        if (!user) {
          throw new ValidationError('User not found in this tenant');
        }

        // Create transaction
        const newTransaction = await client.transaction.create({
          data: {
            tenantId: req.tenantId,
            userId: userId,
            type: backendType,
            amount: transactionData.amount,
            description: transactionData.description,
            category: transactionData.category,
            date: transactionData.date ? new Date(transactionData.date) : new Date(),
            metadata: transactionData.metadata || {},
          },
          include: {
            user: {
              select: { id: true, name: true, workEmail: true, position: true }
            }
          }
        });

        // Transform response to match frontend expectations
        const transformedTransaction = {
          ...newTransaction,
          member: newTransaction.user,
          type: (newTransaction.type === 'income' || newTransaction.type === 'bonus' || newTransaction.type === 'credit') ? 'credit' : 'debit'
        };

        res.status(201).json({
          success: true,
          data: transformedTransaction,
          message: 'Transaction created successfully'
        } as ApiResponse);
      });
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

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Check if transaction exists and belongs to tenant
        const existingTransaction = await client.transaction.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!existingTransaction) {
          throw new NotFoundError('Transaction not found in this tenant');
        }

        // Convert date if provided
        if (updates.date) updates.date = new Date(updates.date);

        const updatedTransaction = await client.transaction.update({
          where: { id },
          data: {
            ...updates,
            updatedAt: new Date()
          },
          include: {
            user: {
              select: { id: true, name: true, workEmail: true, position: true }
            }
          }
        });

        // Transform response to match frontend expectations
        const transformedTransaction = {
          ...updatedTransaction,
          member: updatedTransaction.user,
          type: (updatedTransaction.type === 'income' || updatedTransaction.type === 'bonus' || updatedTransaction.type === 'credit') ? 'credit' : 'debit'
        };

        res.status(200).json({
          success: true,
          data: transformedTransaction,
          message: 'Transaction updated successfully'
        } as ApiResponse);
      });
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

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const existingTransaction = await client.transaction.findFirst({
          where: {
            id,
            tenantId: req.tenantId,
          }
        });

        if (!existingTransaction) {
          throw new NotFoundError('Transaction not found in this tenant');
        }

        await client.transaction.delete({
          where: { id }
        });

        res.status(200).json({
          success: true,
          message: 'Transaction deleted successfully'
        } as ApiResponse);
      });
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

      const balance = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Validate user exists and belongs to tenant
        const user = await client.user.findFirst({
          where: {
            id: userId,
            tenantId: req.tenantId,
          },
          select: { id: true, name: true, workEmail: true }
        });

        if (!user) {
          throw new NotFoundError('User not found in this tenant');
        }

        // Calculate balance using aggregation
        const balanceData = await client.transaction.groupBy({
          by: ['type'],
          where: {
            userId,
            tenantId: req.tenantId,
          },
          _sum: {
            amount: true
          }
        });

        let income = 0;
        let expense = 0;
        let bonus = 0;
        let deduction = 0;

        balanceData.forEach((item: any) => {
          const amount = item._sum.amount || 0;
          switch (item.type) {
            case 'income':
              income = amount;
              break;
            case 'expense':
              expense = amount;
              break;
            case 'bonus':
              bonus = amount;
              break;
            case 'deduction':
              deduction = amount;
              break;
          }
        });

        const totalCredits = income + bonus;
        const totalDebits = expense + deduction;
        const netBalance = totalCredits - totalDebits;

        return {
          user,
          balance: {
            income,
            expense,
            bonus,
            deduction,
            totalCredits,
            totalDebits,
            netBalance
          }
        };
      });

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

      const balance = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Calculate overall balance using aggregation
        const balanceData = await client.transaction.groupBy({
          by: ['type'],
          where: {
            tenantId: req.tenantId,
          },
          _sum: {
            amount: true
          },
          _count: true
        });

        let income = 0, incomeCount = 0;
        let expense = 0, expenseCount = 0;
        let bonus = 0, bonusCount = 0;
        let deduction = 0, deductionCount = 0;

        balanceData.forEach((item: any) => {
          const amount = item._sum.amount || 0;
          const count = item._count || 0;
          
          switch (item.type) {
            case 'income':
              income = amount;
              incomeCount = count;
              break;
            case 'expense':
              expense = amount;
              expenseCount = count;
              break;
            case 'bonus':
              bonus = amount;
              bonusCount = count;
              break;
            case 'deduction':
              deduction = amount;
              deductionCount = count;
              break;
          }
        });

        const totalCredits = income + bonus;
        const totalDebits = expense + deduction;
        const netBalance = totalCredits - totalDebits;
        const totalTransactions = incomeCount + expenseCount + bonusCount + deductionCount;

        return {
          balance: {
            income,
            expense,
            bonus,
            deduction,
            totalCredits,
            totalDebits,
            netBalance
          },
          counts: {
            income: incomeCount,
            expense: expenseCount,
            bonus: bonusCount,
            deduction: deductionCount,
            totalTransactions
          }
        };
      });

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

      const summary = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const monthlyData = await client.transaction.groupBy({
          by: ['type'],
          where: {
            tenantId: req.tenantId,
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
          _sum: {
            amount: true
          },
          _count: true
        });

        let income = 0, incomeCount = 0;
        let expense = 0, expenseCount = 0;
        let bonus = 0, bonusCount = 0;
        let deduction = 0, deductionCount = 0;

        monthlyData.forEach((item: any) => {
          const amount = item._sum.amount || 0;
          const count = item._count || 0;
          
          switch (item.type) {
            case 'income':
              income = amount;
              incomeCount = count;
              break;
            case 'expense':
              expense = amount;
              expenseCount = count;
              break;
            case 'bonus':
              bonus = amount;
              bonusCount = count;
              break;
            case 'deduction':
              deduction = amount;
              deductionCount = count;
              break;
          }
        });

        const totalCredits = income + bonus;
        const totalDebits = expense + deduction;
        const netAmount = totalCredits - totalDebits;
        const totalTransactions = incomeCount + expenseCount + bonusCount + deductionCount;

        return {
          year: targetYear,
          month: targetMonth,
          monthName: startDate.toLocaleString('default', { month: 'long' }),
          summary: {
            income,
            expense,
            bonus,
            deduction,
            totalCredits,
            totalDebits,
            netAmount
          },
          counts: {
            income: incomeCount,
            expense: expenseCount,
            bonus: bonusCount,
            deduction: deductionCount,
            totalTransactions
          }
        };
      });

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

      const summary = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Overall balance and counts
        const overallData = await client.transaction.groupBy({
          by: ['type'],
          where: {
            tenantId: req.tenantId,
            ...dateFilter,
          },
          _sum: {
            amount: true
          },
          _count: true
        });

        let totalCredits = 0;
        let totalDebits = 0;
        let creditCount = 0;
        let debitCount = 0;

        overallData.forEach((item: any) => {
          const amount = Number(item._sum.amount || 0);
          const count = item._count || 0;
          
          if (item.type === 'income' || item.type === 'bonus' || item.type === 'credit') {
            totalCredits += amount;
            creditCount += count;
          } else {
            totalDebits += amount;
            debitCount += count;
          }
        });

        // Category breakdown
        const categoryBreakdown = await client.transaction.groupBy({
          by: ['category'],
          where: {
            tenantId: req.tenantId,
            category: { not: null },
            ...dateFilter,
          },
          _sum: {
            amount: true
          },
          _count: true,
          orderBy: {
            _sum: {
              amount: 'desc'
            }
          }
        });

        const formattedCategoryBreakdown = categoryBreakdown.map((item: any) => ({
          category: item.category,
          total: Number(item._sum.amount || 0),
          count: item._count || 0,
        }));

        // Recent transactions
        const recentTransactions = await client.transaction.findMany({
          where: {
            tenantId: req.tenantId,
            ...dateFilter,
          },
          include: {
            user: {
              select: { id: true, name: true, workEmail: true, position: true }
            }
          },
          orderBy: { date: 'desc' },
          take: 10
        });

        // Transform recent transactions to match frontend expectations
        const transformedRecentTransactions = recentTransactions.map((t: any) => ({
          ...t,
          member: t.user,
          type: (t.type === 'income' || t.type === 'bonus' || t.type === 'credit') ? 'credit' : 'debit'
        }));

        // Calculate this month's data for monthly trend
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);

        const thisMonthData = await client.transaction.groupBy({
          by: ['type'],
          where: {
            tenantId: req.tenantId,
            date: {
              gte: startOfMonth,
              lte: endOfMonth,
            }
          },
          _sum: {
            amount: true
          }
        });

        let monthCredits = 0;
        let monthDebits = 0;

        thisMonthData.forEach((item: any) => {
          const amount = Number(item._sum.amount || 0);
          if (item.type === 'income' || item.type === 'bonus' || item.type === 'credit') {
            monthCredits += amount;
          } else {
            monthDebits += amount;
          }
        });

        return {
          balance: {
            credits: totalCredits,  // Rename to match frontend
            debits: totalDebits,    // Rename to match frontend
            net: totalCredits - totalDebits,  // Rename to match frontend
            creditCount,
            debitCount,
            totalCount: creditCount + debitCount,  // Rename to match frontend
          },
          categoryBreakdown: formattedCategoryBreakdown,
          monthlyTrend: [{
            month: now.toLocaleString('default', { month: 'long' }),
            year: now.getFullYear(),
            credits: monthCredits,
            debits: monthDebits,
            net: monthCredits - monthDebits
          }],
          recentTransactions: transformedRecentTransactions,
        };
      });

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
}

export default TransactionsController;
