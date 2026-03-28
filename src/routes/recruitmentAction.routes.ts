import { Router } from 'express';
import { RecruitmentActionController } from '../controllers/recruitmentAction.controller';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post('/', RecruitmentActionController.createAction);
router.get('/', RecruitmentActionController.getAllActions);
router.put('/:id', RecruitmentActionController.updateAction);
router.delete('/:id', RecruitmentActionController.deleteAction);

export default router;