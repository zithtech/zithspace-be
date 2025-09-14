"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionsController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
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
            const { page = 1, limit = 20, type, category, userId, startDate, endDate, search, sortBy = 'date', sortOrder = 'desc' } = req.query;
            // Build filter query
            const where = {
                tenantId: req.tenantId,
            };
            if (type)
                where.type = type;
            if (category)
                where.category = category;
            if (userId)
                where.userId = userId;
            if (startDate && endDate) {
                where.date = {
                    gte: new Date(startDate),
                    lte: new Date(endDate),
                };
            }
            if (search) {
                where.OR = [
                    { description: { contains: search, mode: 'insensitive' } },
                    { category: { contains: search, mode: 'insensitive' } }
                ];
            }
            // Build sort object
            const orderBy = {};
            orderBy[sortBy] = sortOrder === 'desc' ? 'desc' : 'asc';
            // Execute query with pagination
            const skip = (Number(page) - 1) * Number(limit);
            const [transactions, total] = await Promise.all([
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
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
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.transaction.count({ where });
                })
            ]);
            const totalPages = Math.ceil(total / Number(limit));
            res.status(200).json({
                success: true,
                data: transactions,
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
            const transaction = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
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
            // Validate required fields
            if (!transactionData.userId || !transactionData.type || !transactionData.amount || !transactionData.description) {
                res.status(400).json({
                    success: false,
                    error: 'User ID, type, amount, and description are required'
                });
                return;
            }
            // Validate transaction type
            const validTypes = ['income', 'expense', 'bonus', 'deduction'];
            if (!validTypes.includes(transactionData.type)) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid transaction type. Must be: income, expense, bonus, or deduction'
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
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Validate user exists and belongs to tenant
                const user = await client.user.findFirst({
                    where: {
                        id: transactionData.userId,
                        tenantId: req.tenantId,
                        isActive: true,
                    }
                });
                if (!user) {
                    throw new types_1.ValidationError('User not found in this tenant');
                }
                // Create transaction
                const newTransaction = await client.transaction.create({
                    data: {
                        tenantId: req.tenantId,
                        userId: transactionData.userId,
                        type: transactionData.type,
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
                res.status(201).json({
                    success: true,
                    data: newTransaction,
                    message: 'Transaction created successfully'
                });
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
            delete updates.createdAt;
            // Validate transaction type if being updated
            if (updates.type) {
                const validTypes = ['income', 'expense', 'bonus', 'deduction'];
                if (!validTypes.includes(updates.type)) {
                    res.status(400).json({
                        success: false,
                        error: 'Invalid transaction type. Must be: income, expense, bonus, or deduction'
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
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Check if transaction exists and belongs to tenant
                const existingTransaction = await client.transaction.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!existingTransaction) {
                    throw new types_1.NotFoundError('Transaction not found in this tenant');
                }
                // Convert date if provided
                if (updates.date)
                    updates.date = new Date(updates.date);
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
                res.status(200).json({
                    success: true,
                    data: updatedTransaction,
                    message: 'Transaction updated successfully'
                });
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
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                const existingTransaction = await client.transaction.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!existingTransaction) {
                    throw new types_1.NotFoundError('Transaction not found in this tenant');
                }
                await client.transaction.delete({
                    where: { id }
                });
                res.status(200).json({
                    success: true,
                    message: 'Transaction deleted successfully'
                });
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
            const balance = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Validate user exists and belongs to tenant
                const user = await client.user.findFirst({
                    where: {
                        id: userId,
                        tenantId: req.tenantId,
                    },
                    select: { id: true, name: true, workEmail: true }
                });
                if (!user) {
                    throw new types_1.NotFoundError('User not found in this tenant');
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
                balanceData.forEach((item) => {
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
            const balance = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
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
                balanceData.forEach((item) => {
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
            const summary = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
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
                monthlyData.forEach((item) => {
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
            const summary = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
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
                overallData.forEach((item) => {
                    const amount = item._sum.amount || 0;
                    const count = item._count || 0;
                    if (item.type === 'income' || item.type === 'bonus') {
                        totalCredits += amount;
                        creditCount += count;
                    }
                    else {
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
                const formattedCategoryBreakdown = categoryBreakdown.map((item) => ({
                    category: item.category,
                    total: item._sum.amount || 0,
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
                return {
                    balance: {
                        totalCredits,
                        totalDebits,
                        netBalance: totalCredits - totalDebits,
                        creditCount,
                        debitCount,
                        totalTransactions: creditCount + debitCount,
                    },
                    categoryBreakdown: formattedCategoryBreakdown,
                    recentTransactions,
                };
            });
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