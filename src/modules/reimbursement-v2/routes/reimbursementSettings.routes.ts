// src/modules/reimbursement-v2/routes/reimbursementSettings.routes.ts

import express from 'express';
import { getMailSettings, updateMailSettings } from '../controllers/reimbursementSettings.controller';

const router = express.Router();

// GET  /api/v2/reimbursement/settings/mail
router.get('/mail', getMailSettings);

// PUT  /api/v2/reimbursement/settings/mail
router.put('/mail', updateMailSettings);

export default router;
