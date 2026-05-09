import { Router } from 'express';
import { CompanyGovernmentHolidayController } from '../controllers/companyGovernmentHoliday.controller';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

// Apply auth middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post('/', requirePermission(Permissions.LEAVE_HOLIDAY_CREATE), CompanyGovernmentHolidayController.create);
router.get('/', requirePermission(Permissions.LEAVE_HOLIDAY_READ), CompanyGovernmentHolidayController.getAll);
router.get('/:id', requirePermission(Permissions.LEAVE_HOLIDAY_READ), CompanyGovernmentHolidayController.getById);
router.put('/:id', requirePermission(Permissions.LEAVE_HOLIDAY_UPDATE), CompanyGovernmentHolidayController.update);
router.delete('/:id', requirePermission(Permissions.LEAVE_HOLIDAY_DELETE), CompanyGovernmentHolidayController.delete);

export default router;
