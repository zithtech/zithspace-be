import { Router } from "express";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { MailController } from "@/controllers/MailController";
import { MailSettingsController } from "@/controllers/MailSettingsController";
import { requirePermission } from "@/middleware/permission";

const router = Router();

// Apply middleware to all remaining routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route GET /api/mail/status
 * @desc Get connected mail account status
 */
router.get("/status", requirePermission('mail.read'), MailController.getStatus);

/**
 * @route GET /api/mail/contacts
 * @desc Get available contacts from users and calendar attendees
 */
router.get("/contacts", requirePermission('mail.read'), MailController.getContacts);

/**
 * @route GET /api/mail/unread-count
 * @desc Get unread message count
 */
router.get("/unread-count", requirePermission('mail.read'), MailController.getUnreadCount);

/**
 * @route GET /api/mail/threads
 * @desc Get all mail threads
 */
router.get("/threads", requirePermission('mail.read'), MailController.getThreads);
router.delete("/threads/:id", requirePermission('mail.delete'), MailController.deleteThread);
router.post("/threads/bulk-delete", requirePermission('mail.delete'), MailController.deleteThreads);
router.post("/threads/bulk-restore", requirePermission('mail.update'), MailController.bulkRestoreThreads);
router.post("/threads/bulk-destroy", requirePermission('mail.delete'), MailController.bulkDestroyThreads);
router.post("/threads/restore", requirePermission('mail.update'), MailController.restoreThread);
router.post("/threads/archive", requirePermission('mail.update'), MailController.archiveThread);
router.post("/threads/bulk-archive", requirePermission('mail.update'), MailController.bulkArchiveThreads);
router.post("/threads/empty-trash", requirePermission('mail.delete'), MailController.emptyTrash);
router.post("/threads/mark-as-read", requirePermission('mail.update'), MailController.markThreadAsRead);

/**
 * @route GET /api/mail/threads/:threadId/messages
 * @desc Get messages for a thread
 */
router.get("/threads/:threadId/messages", requirePermission('mail.read'), MailController.getThreadMessages);

/**
 * @route POST /api/mail/sync
 * @desc Manually trigger sync
 */
router.post("/sync", requirePermission('mail.read'), MailController.syncMail);

/**
 * @route POST /api/mail/send
 * @desc Send an email
 */
router.post("/send", requirePermission('mail.create'), MailController.sendMessage);

/**
 * @route POST /api/mail/drafts
 * @desc Save a draft
 */
router.post("/drafts", requirePermission('mail.create'), MailController.saveDraft);

/**
 * @route POST /api/mail/upload-attachment
 * @desc Upload an attachment
 */
router.get("/attachments/download", requirePermission('mail.read'), MailController.downloadAttachment);
router.post("/upload-attachment", requirePermission('mail.create'), MailController.uploadAttachment);

/**
 * @route POST /api/mail/ai/enhance
 * @desc AI-enhance email body (expand detail, polish tone)
 */
router.post("/ai/enhance", requirePermission('mail.create'), MailController.aiEnhanceContent);

/**
 * @route POST /api/mail/ai/grammar
 * @desc AI-correct grammar in email body (light-touch)
 */
router.post("/ai/grammar", requirePermission('mail.create'), MailController.aiCorrectGrammar);

/**
 * @route POST /api/mail/:provider/disconnect
 * @desc Disconnect mail provider and clear data
 */
router.post("/:provider/disconnect", requirePermission('mail.manage'), MailController.disconnect);

/**
 * Invoice Mail Settings
 */
router.get("/invoice-settings", requirePermission('mail.manage'), MailSettingsController.getSettings);
router.post("/invoice-mail", requirePermission('mail.manage'), MailSettingsController.setInvoiceMail);
router.post("/verify", requirePermission('mail.manage'), MailSettingsController.verifyMail);
router.post("/resend-verification", requirePermission('mail.manage'), MailSettingsController.resendVerification);

export default router;
