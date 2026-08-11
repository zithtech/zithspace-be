import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenantContext';
import { requireAnyPermission } from '../middleware/permission';
import { Permissions } from '../types/permissions';
import * as qaAnalyticsController from '../controllers/qaAnalyticsController';

/**
 * QA Space — Reporting & Analytics.
 *
 * Read-only throughout. Gated on its own permission rather than on run/case
 * read: cross-scope reporting exposes the whole QA estate at once, which is a
 * broader view than being able to open the runs you work on.
 */
const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);

const canRead = requireAnyPermission(Permissions.QA_ANALYTICS_READ, Permissions.QA_MANAGE);

router.get('/filters', canRead, qaAnalyticsController.getFilterOptions);
router.get('/overview', canRead, qaAnalyticsController.getOverview);
router.get('/trends', canRead, qaAnalyticsController.getTrends);
router.get('/breakdown', canRead, qaAnalyticsController.getBreakdown);
router.get('/defects', canRead, qaAnalyticsController.getDefectAnalytics);
router.get('/coverage', canRead, qaAnalyticsController.getCoverage);
router.get('/quality', canRead, qaAnalyticsController.getQualitySignals);

export default router;
