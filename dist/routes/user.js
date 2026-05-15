"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("@/controllers/userController");
const userPreferenceController_1 = require("@/controllers/userPreferenceController");
const UserTablePreference_controller_1 = require("@/controllers/UserTablePreference.controller");
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
 * @route   GET /api/user/profile
 * @desc    Get user profile (current user - tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/profile', userController_1.UserController.getUserProfile);
/**
 * @route   PUT /api/user/profile
 * @desc    Update user profile (current user - tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    Partial user profile data
 */
router.put('/profile', userController_1.UserController.updateUserProfile);
/**
 * @route   POST /api/user/change-password
 * @desc    Change password (current user - tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    ChangePasswordData
 */
router.post('/change-password', userController_1.UserController.changePassword);
/**
 * @route   GET /api/user/preferences
 * @desc    Get user preferences
 * @access  Private (authenticated users)
 */
router.get('/preferences', userPreferenceController_1.UserPreferenceController.getPreferences);
/**
 * @route   PATCH /api/user/preferences
 * @desc    Update user preferences
 * @access  Private (authenticated users)
 */
router.patch('/preferences', userPreferenceController_1.UserPreferenceController.updatePreferences);
/**
 * @route   GET /api/user/table-preferences/:tableKey
 * @desc    Get per-user, per-table UI preferences (e.g. column visibility, density)
 * @access  Private (authenticated users)
 */
router.get('/table-preferences/:tableKey', UserTablePreference_controller_1.UserTablePreferenceController.get);
/**
 * @route   PUT /api/user/table-preferences/:tableKey
 * @desc    Upsert per-user, per-table UI preferences
 * @access  Private (authenticated users)
 */
router.put('/table-preferences/:tableKey', UserTablePreference_controller_1.UserTablePreferenceController.upsert);
/**
 * @route   DELETE /api/user/table-preferences/:tableKey
 * @desc    Reset per-user, per-table UI preferences to defaults
 * @access  Private (authenticated users)
 */
router.delete('/table-preferences/:tableKey', UserTablePreference_controller_1.UserTablePreferenceController.remove);
/**
 * @route   POST /api/user/reset-password/:userId
 * @desc    Reset user password (admin only - tenant-aware)
 * @access  Private (admin only)
 * @param   userId - User ID
 * @body    { newPassword }
 */
router.post('/reset-password/:userId', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_MANAGE), userController_1.UserController.resetUserPassword);
exports.default = router;
//# sourceMappingURL=user.js.map