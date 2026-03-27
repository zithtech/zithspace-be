import { Router } from 'express';
import { DocumentHubController } from '@/controllers/documentHubController';

const router = Router();

/**
 * @route   GET /api/public/document/:token
 * @desc    Get public document by share token
 * @access  Public
 */
router.get('/:token', DocumentHubController.getPublicDocument);

export default router;
