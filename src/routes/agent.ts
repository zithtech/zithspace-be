import { Router } from 'express';
import { AgentController } from '@/controllers/agentController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply tenant context and authentication
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   POST /api/agent/chat
 * @desc    Chat with the project assistant agent
 * @access  Private (authenticated users)
 * @body    { message: string, stream?: boolean, threadId?: string }
 */
router.post('/chat', AgentController.chat);

/**
 * @route   GET /api/agent/history/:threadId?
 * @desc    Get conversation history
 * @access  Private (authenticated users)
 */
router.get('/history/:threadId?', AgentController.getHistory);

/**
 * @route   GET /api/agent/history
 * @desc    Get conversation history (default thread)
 * @access  Private (authenticated users)
 */
router.get('/history', AgentController.getHistory);

/**
 * @route   DELETE /api/agent/history/:threadId?
 * @desc    Clear conversation history
 * @access  Private (authenticated users)
 */
router.delete('/history/:threadId?', AgentController.clearHistory);

/**
 * @route   DELETE /api/agent/history
 * @desc    Clear conversation history (default thread)
 * @access  Private (authenticated users)
 */
router.delete('/history', AgentController.clearHistory);

export default router;
