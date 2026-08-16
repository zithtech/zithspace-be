import { Router } from 'express';
import { paymentController } from './payment.controller';
import { authenticateToken, requireAuth } from '../../middleware/auth';
import { resolveTenant } from '../../middleware/tenantContext';

const router = Router();

// Apply auth & tenant context to these routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post('/order', paymentController.createOrder);
router.post('/verify', paymentController.verifyPayment);

export const paymentRoutes = router;
