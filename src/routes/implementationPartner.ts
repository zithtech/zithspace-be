import { Router } from 'express';
import { ImplementationPartnerController } from '@/controllers/ImplementationPartnerController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Implementation Partner Routes
router.get('/select', ImplementationPartnerController.getPartnersForSelect);
router.get('/', ImplementationPartnerController.getPartners);
router.get('/:id', ImplementationPartnerController.getPartnerById);
router.post('/create', ImplementationPartnerController.createPartner);
router.put('/:id', ImplementationPartnerController.updatePartner);
router.delete('/:id', ImplementationPartnerController.deletePartner);

// Specific relations Routes
router.post('/:id/contact', ImplementationPartnerController.addContact);
router.post('/:id/document', ImplementationPartnerController.addDocument);
router.delete('/contact/:contactId', ImplementationPartnerController.deleteContact);
router.delete('/document/:documentId', ImplementationPartnerController.deleteDocument);

// Client management routes
router.get('/:id/clients', ImplementationPartnerController.getAssignedClients);
router.post('/:id/assign-client', ImplementationPartnerController.assignClient);
router.post('/:id/remove-client', ImplementationPartnerController.removeClient);

// Vendor management routes
router.get('/:id/vendors', ImplementationPartnerController.getAssignedVendors);
router.post('/:id/assign-vendor', ImplementationPartnerController.assignVendor);
router.post('/:id/remove-vendor', ImplementationPartnerController.removeVendor);

export default router;
