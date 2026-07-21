import express from 'express';
import { getMailSettings, updateMailSettings } from '../controllers/leaveSettings.controller';

const router = express.Router();

// Get leave settings
router.get('/mail', getMailSettings);

// Update leave settings
// Optional: restrict to HR/Admin using requirePermission if applicable
router.put('/mail', updateMailSettings);

export default router;
