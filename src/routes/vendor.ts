import { Router } from 'express';
import { VendorController } from '@/controllers/VendorController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// All routes require authentication and tenant context
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Main vendor routes
router.get('/select', requirePermission(Permissions.VENDOR_READ), VendorController.getVendorsForSelect);
router.get('/', requirePermission(Permissions.VENDOR_READ), VendorController.getVendors);
router.get('/:id', requirePermission(Permissions.VENDOR_READ), VendorController.getVendorById);
router.post('/create', requirePermission(Permissions.VENDOR_CREATE), VendorController.createVendor);
router.put('/:id', requirePermission(Permissions.VENDOR_UPDATE), VendorController.updateVendor);
router.delete('/:id', requirePermission(Permissions.VENDOR_DELETE), VendorController.deleteVendor);

// Sub-resource routes
router.post('/:id/contact', requirePermission(Permissions.VENDOR_UPDATE), VendorController.addContact);
router.delete('/contact/:contactId', requirePermission(Permissions.VENDOR_UPDATE), VendorController.deleteContact);
router.post('/:id/document', requirePermission(Permissions.VENDOR_UPDATE), VendorController.addDocument);
router.delete('/document/:documentId', requirePermission(Permissions.VENDOR_UPDATE), VendorController.deleteDocument);

// Client management
router.get('/:id/clients', requirePermission(Permissions.VENDOR_READ), VendorController.getAssignedClients);
router.post('/:id/assign-client', requirePermission(Permissions.VENDOR_MANAGE), VendorController.assignClient);
router.post('/:id/remove-client', requirePermission(Permissions.VENDOR_MANAGE), VendorController.removeClient);

// Partner management
router.get('/:id/partners', requirePermission(Permissions.VENDOR_READ), VendorController.getAssignedPartners);
router.post('/:id/assign-partner', requirePermission(Permissions.VENDOR_MANAGE), VendorController.assignPartner);
router.post('/:id/remove-partner', requirePermission(Permissions.VENDOR_MANAGE), VendorController.removePartner);

export default router;
