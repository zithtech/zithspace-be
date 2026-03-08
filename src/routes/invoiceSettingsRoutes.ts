import { Router } from 'express';

import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";
import InvoiceSettingsController from '@/controllers/InvoiceSettingsController';

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/settings/profiles
 * @desc    Get all profiles (paginated, filtered, tenant-aware)
 * @access  Private
 */
router.get('/', requirePermission(Permissions.SETTINGS_READ), InvoiceSettingsController.getProfiles);

/**
 * @route   POST /api/settings/profiles
 * @desc    Create a new profile with nested settings
 * @access  Private (Admin only)
 */
router.post('/', requirePermission(Permissions.SETTINGS_UPDATE), InvoiceSettingsController.createProfile);

router.get('/active', requirePermission(Permissions.SETTINGS_READ), InvoiceSettingsController.getActiveProfiles);

/**
 * @route   GET /api/settings/profiles/:id
 * @desc    Get profile details including related settings
 * @access  Private
 */
router.get('/:id', requirePermission(Permissions.SETTINGS_READ), InvoiceSettingsController.getProfileById);

/**
 * @route   PATCH /api/settings/profiles/:id
 * @desc    Update profile and nested settings
 * @access  Private (Admin only)
 */
router.patch('/:id', requirePermission(Permissions.SETTINGS_UPDATE), InvoiceSettingsController.updateProfile);

/**
 * @route   DELETE /api/settings/profiles/:id
 * @desc    Deactivate (soft delete) a profile
 * @access  Private (Admin only)
 */
router.delete('/:id', requirePermission(Permissions.SETTINGS_MANAGE), InvoiceSettingsController.hardDeleteProfile);

/**
 * @route   POST /api/settings/profiles/:id/activate
 * @desc    Set profile as active and deactivate others
 * @access  Private (Admin only)
 */
router.patch('/:id/activate', requirePermission(Permissions.SETTINGS_UPDATE), InvoiceSettingsController.activateProfile);


export default router;