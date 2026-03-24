import { Router } from 'express';
import { RecruitmentClientController } from '@/controllers/RecruitmentClientController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Recruitment Client Routes
router.get('/select', RecruitmentClientController.getClientsForSelect);
router.get('/', RecruitmentClientController.getClients);
router.get('/:id', RecruitmentClientController.getClientById);
router.post('/create', RecruitmentClientController.createClient);
router.put('/:id', RecruitmentClientController.updateClient);
router.delete('/:id', RecruitmentClientController.deleteClient);

// Contact management
router.post('/:id/contacts', RecruitmentClientController.addContact);
router.delete('/:id/contacts/:contactId', RecruitmentClientController.deleteContact);

// Partner management
router.get('/:id/partners', RecruitmentClientController.getAssignedPartners);
router.post('/:id/assign-partner', RecruitmentClientController.assignPartner);
router.post('/:id/remove-partner', RecruitmentClientController.removePartner);

// Vendor management
router.get('/:id/vendors', RecruitmentClientController.getAssignedVendors);
router.post('/:id/assign-vendor', RecruitmentClientController.assignVendor);
router.post('/:id/remove-vendor', RecruitmentClientController.removeVendor);

export default router;
