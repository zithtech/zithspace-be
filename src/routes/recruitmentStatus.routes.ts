import { Router } from 'express';
import { RecruitmentStatusController } from '../controllers/recruitmentStatus.controller';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post('/', RecruitmentStatusController.createStatus);
router.get('/', RecruitmentStatusController.getAllStatuses);
router.put('/:id', RecruitmentStatusController.updateStatus);
router.delete('/:id', RecruitmentStatusController.deleteStatus);

export default router;