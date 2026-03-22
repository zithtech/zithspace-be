import { Router } from 'express';
import { VendorController } from '@/controllers/VendorController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// All routes require authentication and tenant context
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Main vendor routes
router.get('/select', VendorController.getVendorsForSelect);
router.get('/', VendorController.getVendors);
router.get('/:id', VendorController.getVendorById);
router.post('/create', VendorController.createVendor);
router.put('/:id', VendorController.updateVendor);
router.delete('/:id', VendorController.deleteVendor);

// Sub-resource routes
router.post('/:id/contact', VendorController.addContact);
router.delete('/contact/:contactId', VendorController.deleteContact);
router.post('/:id/document', VendorController.addDocument);
router.delete('/document/:documentId', VendorController.deleteDocument);

// Client management
router.get('/:id/clients', VendorController.getAssignedClients);
router.post('/:id/assign-client', VendorController.assignClient);
router.post('/:id/remove-client', VendorController.removeClient);

// Partner management
router.get('/:id/partners', VendorController.getAssignedPartners);
router.post('/:id/assign-partner', VendorController.assignPartner);
router.post('/:id/remove-partner', VendorController.removePartner);

export default router;
