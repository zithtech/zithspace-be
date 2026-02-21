"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const InvoiceSettingsController_1 = __importDefault(require("@/controllers/InvoiceSettingsController"));
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/settings/profiles
 * @desc    Get all profiles (paginated, filtered, tenant-aware)
 * @access  Private
 */
router.get('/', InvoiceSettingsController_1.default.getProfiles);
/**
 * @route   POST /api/settings/profiles
 * @desc    Create a new profile with nested settings
 * @access  Private (Admin only)
 */
router.post('/', InvoiceSettingsController_1.default.createProfile);
router.get('/active', InvoiceSettingsController_1.default.getActiveProfiles);
/**
 * @route   GET /api/settings/profiles/:id
 * @desc    Get profile details including related settings
 * @access  Private
 */
router.get('/:id', InvoiceSettingsController_1.default.getProfileById);
/**
 * @route   PATCH /api/settings/profiles/:id
 * @desc    Update profile and nested settings
 * @access  Private (Admin only)
 */
router.patch('/:id', InvoiceSettingsController_1.default.updateProfile);
/**
 * @route   DELETE /api/settings/profiles/:id
 * @desc    Deactivate (soft delete) a profile
 * @access  Private (Admin only)
 */
router.delete('/:id', InvoiceSettingsController_1.default.hardDeleteProfile);
/**
 * @route   POST /api/settings/profiles/:id/activate
 * @desc    Set profile as active and deactivate others
 * @access  Private (Admin only)
 */
router.patch('/:id/activate', InvoiceSettingsController_1.default.activateProfile);
exports.default = router;
//# sourceMappingURL=invoiceSettingsRoutes.js.map