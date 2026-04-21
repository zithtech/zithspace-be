import { Router } from 'express';
import { DocumentHubController } from '@/controllers/documentHubController';

const router = Router();

/**
 * @route   GET /api/public/document/:token
 * @desc    Get public document by share token
 * @access  Public
 */
router.get('/:token', DocumentHubController.getPublicDocument);

/**
 * @route   GET /api/public/document/hub/:token/document/:documentId
 * @desc    Get content of a document within a public hub
 * @access  Public
 */
router.get('/hub/:token/document/:documentId', DocumentHubController.getPublicHubDocumentContent);

/**
 * @route   GET /api/public/document/hub/:token
 * @desc    Get public document hub by share token
 * @access  Public
 */
router.get('/hub/:token', DocumentHubController.getPublicDocumentHub);



export default router;
