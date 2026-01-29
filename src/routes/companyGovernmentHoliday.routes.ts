import { Router } from 'express';
import { CompanyGovernmentHolidayController } from '../controllers/companyGovernmentHoliday.controller';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply auth middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post('/', CompanyGovernmentHolidayController.create);
router.get('/', CompanyGovernmentHolidayController.getAll);
router.get('/:id', CompanyGovernmentHolidayController.getById);
router.put('/:id', CompanyGovernmentHolidayController.update);
router.delete('/:id', CompanyGovernmentHolidayController.delete);

export default router;
