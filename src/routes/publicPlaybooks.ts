import { Router } from 'express';
import { PublicPlaybookController } from '@/controllers/publicPlaybookController';

const router = Router();

/**
 * @route   GET /api/public/playbooks
 * @desc    Get all public playbooks
 * @access  Public
 */
router.get('/', PublicPlaybookController.getPublicPlaybooks);

/**
 * @route   GET /api/public/playbooks/collections
 * @desc    Get all public playbook collections
 * @access  Public
 */
router.get('/collections', PublicPlaybookController.getPublicCollections);

/**
 * @route   GET /api/public/playbooks/:slug
 * @desc    Get a public playbook by slug
 * @access  Public
 */
router.get('/:slug', PublicPlaybookController.getPublicPlaybookBySlug);

export default router;
