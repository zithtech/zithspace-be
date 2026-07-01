// src/modules/payroll/routes/selfService.routes.ts
// Employee self-service. No per-action payroll permission: the handler scopes
// strictly to the acting user's own data (their userId), so there is nothing to
// gate beyond the module-root auth (resolveTenant → authenticateToken → requireAuth).

import express from 'express';
import * as ctrl from '../controllers/payRun.controller';

const router = express.Router();

router.get('/my-payslips', ctrl.myPayslips);

export default router;
