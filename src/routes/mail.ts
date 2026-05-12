import { Router } from "express";

import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { MailController } from "@/controllers/MailController";
import { MailSettingsController } from "@/controllers/MailSettingsController";

const router = Router();

// Apply middleware to all remaining routes
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
 * @route GET /api/mail/unread-count
 * @desc Get unread message count
 */
router.get("/unread-count", MailController.getUnreadCount);

/**
 * @route GET /api/mail/threads
 * @desc Get all mail threads
 */
router.get("/threads", MailController.getThreads);
router.delete("/threads/:id", MailController.deleteThread);
router.post("/threads/bulk-delete", MailController.deleteThreads);
router.post("/threads/bulk-restore", MailController.bulkRestoreThreads);
router.post("/threads/bulk-destroy", MailController.bulkDestroyThreads);
router.post("/threads/restore", MailController.restoreThread);
router.post("/threads/archive", MailController.archiveThread);
router.post("/threads/bulk-archive", MailController.bulkArchiveThreads);
router.post("/threads/empty-trash", MailController.emptyTrash);
router.post("/threads/mark-as-read", MailController.markThreadAsRead);

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
/**
 * @route POST /api/mail/upload-attachment
 * @desc Upload an attachment
 */
router.get("/attachments/download", MailController.downloadAttachment);
router.post("/upload-attachment", MailController.uploadAttachment);

/**
 * @route POST /api/mail/:provider/disconnect
 * @desc Disconnect mail provider and clear data
 */
router.post("/:provider/disconnect", MailController.disconnect);

/**
 * Invoice Mail Settings
 */
router.get("/invoice-settings", MailSettingsController.getSettings);
router.post("/invoice-mail", MailSettingsController.setInvoiceMail);
router.post("/verify", MailSettingsController.verifyMail);
router.post("/resend-verification", MailSettingsController.resendVerification);

export default router;
