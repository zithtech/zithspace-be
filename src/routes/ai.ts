import { Router } from "express";
import { AIController } from "@/controllers/aiController";
import { authenticateToken, requireAuth, requireAdmin } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// All AI routes require authentication
router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route POST /api/ai/hub/generate
 * @desc Generate a document hub structure based on a prompt
 */
router.post("/hub/generate", AIController.generateStructure);

/**
 * @route POST /api/ai/hub/execute
 * @desc Bulk create nodes in a hub based on an AI structure
 */
router.post("/hub/execute", AIController.executeHubCreation);

/**
 * @route POST /api/ai/content/generate
 * @desc Generate BlockNote content for a document
 */
router.post("/content/generate", AIController.generateContent);

/**
 * @route POST /api/ai/text/process
 * @desc Process selected text based on a user prompt
 */
router.post("/text/process", AIController.processText);

/**
 * @route POST /api/ai/hub/structure
 * @desc Create only the skeleton structure for a hub
 */
router.post("/hub/structure", AIController.executeHubStructure);

/**
 * @route POST /api/ai/document/:documentId/content
 * @desc Generate and save content for a specific document
 */
router.post("/document/:documentId/content", AIController.updateDocumentWithAIContent);

export default router;
