"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const transactionsController_1 = require("@/controllers/transactionsController");
const auth_1 = require("@/middleware/auth");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/transactions/summary
 * @desc    Get transaction summary with analytics (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   startDate, endDate
 */
router.get('/summary', (0, permission_1.requirePermission)(permissions_1.Permissions.TRANSACTION_READ), transactionsController_1.TransactionsController.getTransactionSummary);
/**
 * @route   GET /api/transactions/balance/account
 * @desc    Get overall account balance (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/balance/account', (0, permission_1.requirePermission)(permissions_1.Permissions.TRANSACTION_READ), transactionsController_1.TransactionsController.getAccountBalance);
/**
 * @route   GET /api/transactions/balance/user/:userId
 * @desc    Get user balance by user ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   userId - User ID
 */
router.get('/balance/user/:userId', (0, permission_1.requirePermission)(permissions_1.Permissions.TRANSACTION_READ), transactionsController_1.TransactionsController.getUserBalance);
/**
 * @route   GET /api/transactions/monthly
 * @desc    Get monthly summary (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   year, month
 */
router.get('/monthly', (0, permission_1.requirePermission)(permissions_1.Permissions.TRANSACTION_READ), transactionsController_1.TransactionsController.getMonthlySummary);
/**
 * @route   GET /api/transactions
 * @desc    Get all transactions with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, type, category, userId, startDate, endDate, search, sortBy, sortOrder
 */
router.get('/', (0, permission_1.requirePermission)(permissions_1.Permissions.TRANSACTION_READ), transactionsController_1.TransactionsController.getTransactions);
/**
 * @route   GET /api/transactions/:id
 * @desc    Get transaction by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Transaction ID
 */
router.get('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.TRANSACTION_READ), transactionsController_1.TransactionsController.getTransactionById);
/**
 * @route   POST /api/transactions
 * @desc    Create new transaction (tenant-aware)
 * @access  Private (admin only)
 * @body    CreateTransactionData
 */
router.post('/', (0, permission_1.requirePermission)(permissions_1.Permissions.TRANSACTION_CREATE), transactionsController_1.TransactionsController.createTransaction);
/**
 * @route   PUT /api/transactions/:id
 * @desc    Update transaction (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Transaction ID
 * @body    Partial transaction data
 */
router.put('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.TRANSACTION_UPDATE), transactionsController_1.TransactionsController.updateTransaction);
/**
 * @route   DELETE /api/transactions/:id
 * @desc    Delete transaction (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Transaction ID
 */
router.delete('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.TRANSACTION_DELETE), transactionsController_1.TransactionsController.deleteTransaction);
exports.default = router;
//# sourceMappingURL=transactions.js.map