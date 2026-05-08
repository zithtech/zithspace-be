import { Router } from 'express';
import { TransactionsController } from '@/controllers/transactionsController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/transactions/summary
 * @desc    Get transaction summary with analytics (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   startDate, endDate
 */
router.get('/summary', requirePermission(Permissions.ACCOUNT_READ), TransactionsController.getTransactionSummary);

/**
 * @route   GET /api/transactions/balance/account
 * @desc    Get overall account balance (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/balance/account', requirePermission(Permissions.ACCOUNT_READ), TransactionsController.getAccountBalance);

/**
 * @route   GET /api/transactions/balance/user/:userId
 * @desc    Get user balance by user ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   userId - User ID
 */
router.get('/balance/user/:userId', requirePermission(Permissions.ACCOUNT_READ), TransactionsController.getUserBalance);

/**
 * @route   GET /api/transactions/monthly
 * @desc    Get monthly summary (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   year, month
 */
router.get('/monthly', requirePermission(Permissions.ACCOUNT_READ), TransactionsController.getMonthlySummary);

/**
 * @route   GET /api/transactions
 * @desc    Get all transactions with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, type, category, userId, startDate, endDate, search, sortBy, sortOrder
 */
router.get('/', requirePermission(Permissions.ACCOUNT_READ), TransactionsController.getTransactions);

/**
 * @route   GET /api/transactions/:id
 * @desc    Get transaction by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Transaction ID
 */
router.get('/:id', requirePermission(Permissions.ACCOUNT_READ), TransactionsController.getTransactionById);

/**
 * @route   POST /api/transactions
 * @desc    Create new transaction (tenant-aware)
 * @access  Private (admin only)
 * @body    CreateTransactionData
 */
router.post('/', requirePermission(Permissions.ACCOUNT_CREATE), TransactionsController.createTransaction);

/**
 * @route   PUT /api/transactions/:id
 * @desc    Update transaction (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Transaction ID
 * @body    Partial transaction data
 */
router.put('/:id', requirePermission(Permissions.ACCOUNT_UPDATE), TransactionsController.updateTransaction);

/**
 * @route   DELETE /api/transactions/:id
 * @desc    Delete transaction (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Transaction ID
 */
router.delete('/:id', requirePermission(Permissions.ACCOUNT_DELETE), TransactionsController.deleteTransaction);

export default router;
