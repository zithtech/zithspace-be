import { Router } from 'express';
import { UserController } from '@/controllers/userController';
import { UserPreferenceController } from '@/controllers/userPreferenceController';
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
 * @route   GET /api/user/profile
 * @desc    Get user profile (current user - tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/profile', UserController.getUserProfile);

/**
 * @route   PUT /api/user/profile
 * @desc    Update user profile (current user - tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    Partial user profile data
 */
router.put('/profile', UserController.updateUserProfile);

/**
 * @route   POST /api/user/change-password
 * @desc    Change password (current user - tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    ChangePasswordData
 */
router.post('/change-password', UserController.changePassword);

/**
 * @route   GET /api/user/preferences
 * @desc    Get user preferences
 * @access  Private (authenticated users)
 */
router.get('/preferences', UserPreferenceController.getPreferences);

/**
 * @route   PATCH /api/user/preferences
 * @desc    Update user preferences
 * @access  Private (authenticated users)
 */
router.patch('/preferences', UserPreferenceController.updatePreferences);

/**
 * @route   POST /api/user/reset-password/:userId
 * @desc    Reset user password (admin only - tenant-aware)
 * @access  Private (admin only)
 * @param   userId - User ID
 * @body    { newPassword }
 */
router.post('/reset-password/:userId', requirePermission(Permissions.USER_MANAGE), UserController.resetUserPassword);

export default router;
