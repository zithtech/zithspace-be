"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionsController = void 0;
const types_1 = require("@/types");
const transaction_model_1 = require("../models/transaction.model");
class TransactionsController {
    /**
     * Get all transactions with filtering and pagination (tenant-aware)
     */
    static async getTransactions(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { page = 1, limit = 20, type, category, userId, member, startDate, endDate, search, sortBy = 'date', sortOrder = 'desc' } = req.query;
            // Accept both userId and member parameters
            const userIdParam = userId || member;
            const { transactions, total } = await (0, transaction_model_1.getTransactions)(req.tenantId, {
                page: Number(page),
                limit: Number(limit),
                type: type,
                category: category,
                userId: userIdParam,
                startDate: startDate,
                endDate: endDate,
                search: search,
                sortBy: sortBy,
                sortOrder: sortOrder
            });
            // Transform transactions to match frontend expectations
            const transformedTransactions = transactions.map((t) => ({
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
            });
        }
        catch (error) {
            console.error('Get transactions error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch transactions'
            });
        }
    }
    /**
     * Get transaction by ID (tenant-aware)
     */
    static async getTransactionById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const transaction = await (0, transaction_model_1.getTransactionById)(id, req.tenantId);
            if (!transaction) {
                res.status(404).json({
                    success: false,
                    error: 'Transaction not found'
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: transaction
            });
        }
        catch (error) {
            console.error('Get transaction by ID error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch transaction'
            });
        }
    }
    /**
     * Create new transaction (tenant-aware)
     */
    static async createTransaction(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const transactionData = req.body;
            // Accept both 'member' and 'userId' field names
            const userId = transactionData.userId || transactionData.member;
            // Validate required fields
            if (!userId || !transactionData.type || !transactionData.amount || !transactionData.description) {
                res.status(400).json({
                    success: false,
                    error: 'User ID, type, amount, and description are required'
                });
                return;
            }
            // Map frontend types (credit/debit) to backend types
            const typeMapping = {
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
                });
                return;
            }
            // Validate amount is positive
            if (transactionData.amount <= 0) {
                res.status(400).json({
                    success: false,
                    error: 'Amount must be greater than 0'
                });
                return;
            }
            // Validate user exists and belongs to tenant
            const user = await (0, transaction_model_1.checkUserInTenant)(userId, req.tenantId);
            if (!user) {
                throw new types_1.ValidationError('User not found in this tenant');
            }
            // Create transaction
            const newTransaction = await (0, transaction_model_1.createTransaction)({
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
            res.status(201).json({
                success: true,
                data: transformedTransaction,
                message: 'Transaction created successfully'
            });
        }
        catch (error) {
            console.error('Create transaction error:', error);
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to create transaction'
            });
        }
    }
    /**
     * Update transaction (tenant-aware)
     */
    static async updateTransaction(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const updates = req.body;
            // Remove fields that shouldn't be updated directly
            delete updates.tenantId;
            delete updates.userId;
            delete updates.member;
            delete updates.createdAt;
            // Map frontend types (credit/debit) to backend types if provided
            if (updates.type) {
                const typeMapping = {
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
                    });
                    return;
                }
            }
            // Validate amount if being updated
            if (updates.amount && updates.amount <= 0) {
                res.status(400).json({
                    success: false,
                    error: 'Amount must be greater than 0'
                });
                return;
            }
            // Check if transaction exists and belongs to tenant
            const existingTransaction = await (0, transaction_model_1.getTransactionById)(id, req.tenantId);
            if (!existingTransaction) {
                throw new types_1.NotFoundError('Transaction not found in this tenant');
            }
            const updatedTransaction = await (0, transaction_model_1.updateTransaction)(id, req.tenantId, updates);
            if (!updatedTransaction) {
                throw new Error('Failed to update transaction');
            }
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
            });
        }
        catch (error) {
            console.error('Update transaction error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to update transaction'
            });
        }
    }
    /**
     * Delete transaction (tenant-aware)
     */
    static async deleteTransaction(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const existingTransaction = await (0, transaction_model_1.getTransactionById)(id, req.tenantId);
            if (!existingTransaction) {
                throw new types_1.NotFoundError('Transaction not found in this tenant');
            }
            await (0, transaction_model_1.deleteTransactionQuery)(id, req.tenantId);
            res.status(200).json({
                success: true,
                message: 'Transaction deleted successfully'
            });
        }
        catch (error) {
            console.error('Delete transaction error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to delete transaction'
            });
        }
    }
    /**
     * Get user balance by user ID (tenant-aware)
     */
    static async getUserBalance(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { userId } = req.params;
            const balance = await (0, transaction_model_1.getUserBalanceQuery)(userId, req.tenantId);
            if (!balance) {
                throw new types_1.NotFoundError('User not found in this tenant');
            }
            res.status(200).json({
                success: true,
                data: balance
            });
        }
        catch (error) {
            console.error('Get user balance error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to fetch user balance'
            });
        }
    }
    /**
     * Get overall account balance (tenant-aware)
     */
    static async getAccountBalance(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const balance = await (0, transaction_model_1.getAccountBalanceQuery)(req.tenantId);
            res.status(200).json({
                success: true,
                data: balance
            });
        }
        catch (error) {
            console.error('Get account balance error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch account balance'
            });
        }
    }
    /**
     * Get monthly summary (tenant-aware)
     */
    static async getMonthlySummary(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
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
            const summary = await (0, transaction_model_1.getMonthlySummaryQuery)(req.tenantId, startDate, endDate, targetYear, targetMonth, startDate.toLocaleString('default', { month: 'long' }));
            res.status(200).json({
                success: true,
                data: summary
            });
        }
        catch (error) {
            console.error('Get monthly summary error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch monthly summary'
            });
        }
    }
    /**
     * Get transaction summary with analytics (tenant-aware)
     */
    static async getTransactionSummary(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { startDate, endDate } = req.query;
            let dateFilter = {};
            if (startDate && endDate) {
                dateFilter = {
                    date: {
                        gte: new Date(startDate),
                        lte: new Date(endDate),
                    }
                };
            }
            const start = startDate ? new Date(startDate) : undefined;
            const end = endDate ? new Date(endDate) : undefined;
            const summary = await (0, transaction_model_1.getTransactionSummaryQuery)(req.tenantId, start, end);
            res.status(200).json({
                success: true,
                data: summary
            });
        }
        catch (error) {
            console.error('Get transaction summary error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch transaction summary'
            });
        }
    }
}
exports.TransactionsController = TransactionsController;
exports.default = TransactionsController;
//# sourceMappingURL=transactionsController.js.map