import { Router } from "express";
import { MailController } from "@/controllers/MailController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

// Apply middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route GET /api/mail/status
 * @desc Get connected mail account status
 */
router.get("/status", MailController.getStatus);

/**
 * @route GET /api/mail/contacts
 * @desc Get available contacts from users and calendar attendees
 */
router.get("/contacts", MailController.getContacts);

/**
 * @route GET /api/mail/threads
 * @desc Get all mail threads
 */
router.get("/threads", MailController.getThreads);
router.delete("/threads/:id", MailController.deleteThread);
router.post("/threads/bulk-delete", MailController.deleteThreads);
router.post("/threads/restore", MailController.restoreThread);
router.post("/threads/empty-trash", MailController.emptyTrash);

/**
 * @route GET /api/mail/threads/:threadId/messages
 * @desc Get messages for a thread
 */
router.get("/threads/:threadId/messages", MailController.getThreadMessages);

/**
 * @route POST /api/mail/sync
 * @desc Manually trigger sync
 */
router.post("/sync", MailController.syncMail);

/**
 * @route POST /api/mail/send
 * @desc Send an email
 */
router.post("/send", MailController.sendMessage);

/**
 * @route POST /api/mail/drafts
 * @desc Save a draft
 */
router.post("/drafts", MailController.saveDraft);

/**
 * @route POST /api/mail/drafts/send
 * @desc Send a draft
 */
router.post("/drafts/send", MailController.sendDraft);

export default router;
