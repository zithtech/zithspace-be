import { Response } from "express";
import axios from "axios";
import { prisma } from "../config/database";
import { AuthRequest, ApiResponse } from "../types";
import { MailService } from "../services/mail/MailService";
import { MailAiService } from "../services/mailAiService";
import { MailSyncProducer } from "../services/mail/MailSyncProducer";
import { syncLogger } from "../utils/logger";
import { s3Client } from "../utils/r2Client";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { PushNotificationService } from "../services/pushNotificationService";

export class MailController {
    /**
     * Get mail account status (connected email address)
     */
    static async getStatus(req: AuthRequest, res: Response) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;

            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true },
                select: { email: true, provider: true },
                orderBy: { updated_at: 'desc' }
            });

            if (!account) {
                return res.json({
                    success: true,
                    data: { connected: false }
                });
            }

            return res.json({
                success: true,
                data: {
                    connected: true,
                    email: account.email,
                    provider: account.provider
                }
            });
        } catch (error: any) {
            console.error("[MailController] getStatus error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to fetch mail status"
            });
        }
    }

    /**
     * Get unread message count
     */
    static async getUnreadCount(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;

            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.json({ success: true, data: { unreadCount: 0 } });
            }

            const unreadCount = await MailService.getUnreadCount(userId, tenantId, account.email);

            const [inbox, sent, draft, starred, archive, trash] = await Promise.all([
                prisma.mail_threads.count({ where: { account_id: account.id, tenant_id: tenantId, OR: [{ labels: { has: 'INBOX' } }, { labels: { isEmpty: true } }] } }),
                prisma.mail_threads.count({ where: { account_id: account.id, tenant_id: tenantId, labels: { has: 'SENT' } } }),
                prisma.mail_threads.count({ where: { account_id: account.id, tenant_id: tenantId, labels: { has: 'DRAFT' } } }),
                prisma.mail_threads.count({ where: { account_id: account.id, tenant_id: tenantId, labels: { has: 'STARRED' } } }),
                prisma.mail_threads.count({ where: { account_id: account.id, tenant_id: tenantId, labels: { has: 'ARCHIVE' } } }),
                prisma.mail_threads.count({ where: { account_id: account.id, tenant_id: tenantId, labels: { has: 'TRASH' } } }),
            ]);

            return res.json({
                success: true,
                data: { 
                    unreadCount, 
                    counts: {
                        INBOX: inbox,
                        SENT: sent,
                        DRAFT: draft,
                        STARRED: starred,
                        ARCHIVE: archive,
                        TRASH: trash
                    } 
                }
            });
        } catch (error: any) {
            console.error("[MailController] getUnreadCount error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to fetch unread count"
            });
        }
    }

    /**
     * Get unique contacts from system users and employees (members) of the active tenant
     */
    static async getContacts(req: AuthRequest, res: Response) {
        try {
            const tenantId = req.tenantId!;
            const userId = req.user!.id;
            const contactsMap = new Map<string, { name: string; email: string }>();

            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.json({ success: true, data: [] });
            }

            const rawEmails: any[] = await prisma.$queryRaw`
                SELECT DISTINCT "from_address" as email 
                FROM "mail_threads" 
                WHERE "tenant_id" = ${tenantId} AND "account_id" = ${account.id} AND "from_address" IS NOT NULL
                UNION
                SELECT DISTINCT jsonb_array_elements_text("to_emails") as email 
                FROM "mail_threads" 
                WHERE "tenant_id" = ${tenantId} AND "account_id" = ${account.id} AND "to_emails" IS NOT NULL AND jsonb_typeof("to_emails") = 'array'
            `;

            for (const row of rawEmails) {
                if (row.email) {
                    const emailStr = String(row.email).trim();
                    if (!emailStr) continue;
                    
                    // Simple parser to handle "Name <email>" format if it exists
                    let name = emailStr;
                    let email = emailStr;
                    
                    const match = emailStr.match(/^(.*?)<(.+?)>$/);
                    if (match) {
                        name = match[1].trim() || match[2].trim();
                        email = match[2].trim().toLowerCase();
                    } else {
                        email = email.toLowerCase();
                    }

                    if (!contactsMap.has(email)) {
                        contactsMap.set(email, { name, email });
                    }
                }
            }

            return res.json({
                success: true,
                data: Array.from(contactsMap.values())
            });
        } catch (error: any) {
            console.error("[MailController] getContacts error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to fetch contacts"
            });
        }
    }

    /**
     * Get all mail threads for the authenticated user
     */
    static async getThreads(req: AuthRequest, res: Response) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;
            const { label, filter, search, to, from } = req.query;

            // 1. Find the connected mail account
            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.json({ success: true, data: [] });
            }

            // 2. Fetch from DB
            const whereClause: any = { account_id: account.id, tenant_id: tenantId };

            if (label && typeof label === 'string') {
                const upperLabel = label.toUpperCase();
                if (upperLabel === 'INBOX') {
                    whereClause.OR = [
                        { labels: { has: 'INBOX' } },
                        { labels: { isEmpty: true } }
                    ];
                } else {
                    whereClause.labels = { has: upperLabel };
                }
            }

            if (filter === 'UNREAD') {
                whereClause.is_read = false;
            } else if (filter === 'READ') {
                whereClause.is_read = true;
            } else if (filter === 'HAS_ATTACHMENTS') {
                whereClause.has_attachments = true;
            } else if (filter === 'NO_ATTACHMENTS') {
                whereClause.has_attachments = false;
            }

            if (from && typeof from === 'string' && from.trim()) {
                whereClause.from_address = { contains: from.trim(), mode: 'insensitive' };
            }

            if (to && typeof to === 'string' && to.trim()) {
                const toLower = to.trim().toLowerCase();
                const toThreads = await prisma.$queryRawUnsafe<{id: string}[]>(
                    `SELECT id FROM mail_threads WHERE tenant_id = $1 AND account_id = $2 AND to_emails::text ILIKE $3`,
                    tenantId, account.id, `%${toLower}%`
                );
                whereClause.id = { in: toThreads.map(t => t.id) };
            }

            // Search filter
            if (search && typeof search === 'string' && search.trim()) {
                const searchLower = search.trim().toLowerCase();
                
                const searchToThreads = await prisma.$queryRawUnsafe<{id: string}[]>(
                    `SELECT id FROM mail_threads WHERE tenant_id = $1 AND account_id = $2 AND to_emails::text ILIKE $3`,
                    tenantId, account.id, `%${searchLower}%`
                );
                const toEmailIds = searchToThreads.map(t => t.id);

                const searchFilter: any = {
                    OR: [
                        { subject: { contains: searchLower, mode: 'insensitive' } },
                        { from_address: { contains: searchLower, mode: 'insensitive' } },
                        { snippet: { contains: searchLower, mode: 'insensitive' } }
                    ]
                };

                if (toEmailIds.length > 0) {
                    searchFilter.OR.push({ id: { in: toEmailIds } });
                }

                // Combine with existing whereClause
                if (whereClause.OR) {
                    // If we already have an OR (like for Inbox), we need to wrap everything in an AND
                    const existingOR = whereClause.OR;
                    delete whereClause.OR;
                    whereClause.AND = [
                        { OR: existingOR },
                        searchFilter
                    ];
                } else {
                    Object.assign(whereClause, searchFilter);
                }
            }

            const threads = await prisma.mail_threads.findMany({
                where: whereClause,
                orderBy: { last_message_at: 'desc' }
            });

            return res.json({
                success: true,
                data: threads.map(MailController.mapThread)
            });
        } catch (error: any) {
            console.error("[MailController] getThreads error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to fetch mail threads"
            });
        }
    }

    /**
     * Get messages for a specific thread
     */
    static async getThreadMessages(req: AuthRequest, res: Response) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        try {
            const { threadId } = req.params;
            const tenantId = req.tenantId!;

            if (!threadId) {
                return res.status(400).json({
                    success: false,
                    error: "Thread ID is required"
                });
            }

            const messages = await prisma.mail_messages.findMany({
                where: {
                    thread_id: threadId,
                    tenant_id: tenantId
                },
                include: {
                    mail_attachments: true
                },
                orderBy: {
                    received_at: 'asc'
                }
            });

            return res.json({
                success: true,
                data: messages.map(MailController.mapMessage)
            });
        } catch (error: any) {
            console.error("[MailController] getThreadMessages error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to fetch messages"
            });
        }
    }

    /**
     * Manually trigger a mail sync
     */
    static async syncMail(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;

            // 1. Find the connected mail account
            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: "No connected mail account found"
                });
            }

            // Publish to RabbitMQ for background processing
            await MailSyncProducer.enqueueSync({
                userId,
                tenantId,
                email: account.email
            });

            return res.json({
                success: true,
                message: "Mail synchronization started in background"
            });
        } catch (error: any) {
            console.error("[MailController] syncMail error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to sync mail"
            });
        }
    }

    /**
     * Send an email
     */
    static async sendMessage(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;
            const { to, subject, body, cc, bcc, scheduledAt, attachments, threadId } = req.body;

            // 1. Find the connected mail account
            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: "No connected mail account found"
                });
            }

            console.log(`[MailController] sendMessage attachments received:`, attachments?.length || 0);
            if (attachments && attachments.length > 0) {
                console.log(`[MailController] First attachment raw:`, JSON.stringify(attachments[0], null, 2));
            }

            const mappedAttachments = attachments?.map((att: any, index: number) => {
                const filename = att.filename || att.name || att.response?.filename || att.response?.name || att.fileName;
                const url = att.url || att.response?.url || (att.response?.data?.url);
                const contentType = att.contentType || att.type || att.response?.contentType || att.response?.type || att.mimeType;
                const size = att.size || att.response?.size || 0;

                console.log(`[MailController] Mapping attachment ${index}:`, {
                    originalFilename: att.name || att.filename,
                    extractedFilename: filename,
                    extractedUrl: url,
                    extractedType: contentType,
                    extractedSize: size
                });

                return {
                    filename: filename === 'undefined' ? undefined : filename,
                    url: url === 'undefined' ? undefined : url,
                    contentType: contentType === 'undefined' ? undefined : contentType,
                    size: typeof size === 'number' ? size : parseInt(size) || 0
                };
            }).filter((a: any) => {
                const isValid = !!(a.url && a.filename);
                if (!isValid) {
                    console.log(`[MailController] Filtering out invalid attachment:`, a);
                }
                return isValid;
            }) || [];

            console.log(`[MailController] Mapped attachments:`, mappedAttachments.length);

            await MailService.sendMessage(userId, tenantId, account.email, {
                to: Array.isArray(to) ? to : [to],
                subject,
                body,
                cc: Array.isArray(cc) ? cc : (cc ? [cc] : []),
                bcc: Array.isArray(bcc) ? bcc : (bcc ? [bcc] : []),
                from: account.email,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                threadId,
                attachments: mappedAttachments
            });

            // Collect recipient emails and trigger push notifications asynchronously
            const recipientEmails: string[] = [];
            const collectEmails = (field: any) => {
                if (!field) return;
                const list = Array.isArray(field) ? field : [field];
                for (const item of list) {
                    if (typeof item === 'string') {
                        recipientEmails.push(item.trim().toLowerCase());
                    } else if (typeof item === 'object' && item !== null && item.email) {
                        recipientEmails.push(item.email.trim().toLowerCase());
                    }
                }
            };

            collectEmails(to);
            collectEmails(cc);
            collectEmails(bcc);

            // Filter out the sender's own emails so they do not receive a notification for sending an email
            const senderEmails = new Set<string>();
            if (account.email) senderEmails.add(account.email.trim().toLowerCase());
            if (req.user?.email) senderEmails.add(req.user.email.trim().toLowerCase());

            const filteredRecipients = recipientEmails.filter(email => !senderEmails.has(email));

            if (filteredRecipients.length > 0) {
                const senderName = req.user!.name || account.email;

                PushNotificationService.sendNotificationToEmails(filteredRecipients, {
                    title: 'New Email Received',
                    body: `You have received a new email from ${senderName}`,
                    url: '/mail'
                }).catch(err => {
                    console.error("[MailController] Push notification failed:", err.message);
                });
            }

            // Trigger background sync (Commented out as requested)
            /*
            try {
                await MailSyncProducer.enqueueSync({
                    userId,
                    tenantId,
                    email: account.email
                });
            } catch (err) {
                console.error("[MailController] Failed to queue sync after send:", err);
            }
            */

            return res.json({
                success: true,
                message: "Email sent successfully"
            });
        } catch (error: any) {
            console.error("[MailController] sendMessage error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to send email"
            });
        }
    }

    /**
     * Save a draft
     */
    static async saveDraft(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;
            const { to, subject, body, cc, bcc, id, threadId } = req.body;

            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: "No connected mail account found"
                });
            }

            const result = await MailService.saveDraft(userId, tenantId, account.email, {
                to: Array.isArray(to) ? to : [to],
                subject,
                body,
                cc,
                bcc,
                from: account.email,
                id,
                threadId
            });

            return res.json({
                success: true,
                data: result
            });
        } catch (error: any) {
            console.error("[MailController] saveDraft error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to save draft"
            });
        }
    }

    /**
     * Send a draft
     */
    static async sendDraft(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;
            const { draftId } = req.body;

            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: "No connected mail account found"
                });
            }

            await MailService.sendDraft(userId, tenantId, account.email, draftId);

            return res.json({
                success: true,
                message: "Draft sent successfully"
            });
        } catch (error: any) {
            console.error("[MailController] sendDraft error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to send draft"
            });
        }
    }

    /**
     * Delete a mail thread
     */
    static async deleteThread(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;
            const { id } = req.params;

            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: "No connected mail account found"
                });
            }

            await MailService.deleteThread(userId, tenantId, account.email, id);

            return res.json({
                success: true,
                message: "Thread deleted successfully"
            });
        } catch (error: any) {
            console.error("[MailController] deleteThread error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to delete thread"
            });
        }
    }

    /**
     * Restore a mail thread from trash
     */
    static async restoreThread(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;
            const { threadId } = req.body;

            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: "No connected mail account found"
                });
            }

            await MailService.restoreThread(userId, tenantId, account.email, threadId);

            return res.json({
                success: true,
                message: "Thread restored successfully"
            });
        } catch (error: any) {
            console.error("[MailController] restoreThread error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to restore thread"
            });
        }
    }

    /**
     * Empty the trash folder
     */
    static async emptyTrash(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;

            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: "No connected mail account found"
                });
            }

            await MailService.emptyTrash(userId, tenantId, account.email);

            return res.json({
                success: true,
                message: "Trash emptied successfully"
            });
        } catch (error: any) {
            console.error("[MailController] emptyTrash error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to empty trash"
            });
        }
    }

    /**
     * Delete multiple threads
     */
    static async deleteThreads(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;
            const { ids } = req.body;

            if (!ids || !Array.isArray(ids)) {
                return res.status(400).json({
                    success: false,
                    error: "Thread IDs array is required"
                });
            }

            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: "No connected mail account found"
                });
            }

            await MailService.deleteThreads(userId, tenantId, account.email, ids);

            return res.json({
                success: true,
                message: `${ids.length} threads deleted successfully`
            });
        } catch (error: any) {
            console.error("[MailController] deleteThreads error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to delete threads"
            });
        }
    }

    /**
     * Upload an attachment
     */
    static async uploadAttachment(req: AuthRequest, res: Response) {
        try {
            const tenantId = req.tenantId!;
            const { file, fileName } = req.body;

            if (!file) {
                return res.status(400).json({
                    success: false,
                    error: "No file data provided"
                });
            }

            const r2Result = await MailService.uploadAttachment(tenantId, file, fileName);

            return res.json({
                success: true,
                data: r2Result
            });
        } catch (error: any) {
            console.error("[MailController] uploadAttachment error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to upload attachment"
            });
        }
    }

    /**
     * Archive a mail thread
     */
    static async archiveThread(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;
            const { threadId } = req.body;

            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: "No connected mail account found"
                });
            }

            await MailService.archiveThread(userId, tenantId, account.email, threadId);

            return res.json({
                success: true,
                message: "Thread archived successfully"
            });
        } catch (error: any) {
            console.error("[MailController] archiveThread error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to archive thread"
            });
        }
    }

    /**
     * Archive multiple threads
     */
    static async bulkArchiveThreads(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;
            const { ids } = req.body;

            if (!ids || !Array.isArray(ids)) {
                return res.status(400).json({
                    success: false,
                    error: "Thread IDs array is required"
                });
            }

            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: "No connected mail account found"
                });
            }

            await MailService.bulkArchiveThreads(userId, tenantId, account.email, ids);

            return res.json({
                success: true,
                message: `${ids.length} threads archived successfully`
            });
        } catch (error: any) {
            console.error("[MailController] bulkArchiveThreads error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to archive threads"
            });
        }
    }

    /**
     * Mark a thread as read
     */
    static async markThreadAsRead(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;
            const { threadId } = req.body;

            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: "No connected mail account found"
                });
            }

            await MailService.markThreadAsRead(userId, tenantId, account.email, threadId);

            return res.json({
                success: true,
                message: "Thread marked as read"
            });
        } catch (error: any) {
            console.error("[MailController] markThreadAsRead error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to mark thread as read"
            });
        }
    }

    /**
     * Restore multiple threads from trash
     */
    static async bulkRestoreThreads(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;
            const { ids } = req.body;

            if (!ids || !Array.isArray(ids)) {
                return res.status(400).json({
                    success: false,
                    error: "Thread IDs array is required"
                });
            }

            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: "No connected mail account found"
                });
            }

            await MailService.bulkRestoreThreads(userId, tenantId, account.email, ids);

            return res.json({
                success: true,
                message: `${ids.length} threads restored successfully`
            });
        } catch (error: any) {
            console.error("[MailController] bulkRestoreThreads error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to restore threads"
            });
        }
    }

    /**
     * Permanently delete multiple threads
     */
    static async bulkDestroyThreads(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;
            const { ids } = req.body;

            if (!ids || !Array.isArray(ids)) {
                return res.status(400).json({
                    success: false,
                    error: "Thread IDs array is required"
                });
            }

            const account = await prisma.mail_accounts.findFirst({
                where: { user_id: userId, tenant_id: tenantId, is_active: true }
            });

            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: "No connected mail account found"
                });
            }

            await MailService.bulkDestroyThreads(userId, tenantId, account.email, ids);

            return res.json({
                success: true,
                message: `${ids.length} threads deleted permanently`
            });
        } catch (error: any) {
            console.error("[MailController] bulkDestroyThreads error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to delete threads permanently"
            });
        }
    }

    /**
     * Proxy attachment download from R2 using piping (Hardened Proxy Method)
     */
    static async downloadAttachment(req: AuthRequest, res: Response) {
        try {
            const { url, filename, mode, attachmentId } = req.query;
            syncLogger.info(`[MailController] Downloading attachment via hardened piping proxy`, { url, filename, mode, attachmentId });

            if (!url || typeof url !== 'string') {
                return res.status(400).json({ success: false, error: "URL is required" });
            }

            // Check if this is a provider-hosted attachment by looking up the attachment record
            if (attachmentId && typeof attachmentId === 'string') {
                try {
                    const attachment = await prisma.mail_attachments.findUnique({
                        where: { id: attachmentId },
                        select: { storage_key: true, download_url: true }
                    });

                    if (attachment && attachment.storage_key === 'provider_hosted') {
                        syncLogger.info(`[MailController] Redirecting to provider-hosted attachment: ${attachment.download_url}`);
                        return res.redirect(302, attachment.download_url);
                    }
                } catch (dbError) {
                    syncLogger.error(`[MailController] Error checking attachment record: ${dbError.message}`);
                    // Continue with URL-based detection as fallback
                }
            }

            // Convert internal R2 URLs to public URLs
            let finalUrl = url;
            let extractedAccountId = process.env.CF_R2_ACCOUNT_ID || "a7b954c93286b9aecbd1cd369b491aa0";
            
            if (url.includes('r2.cloudflarestorage.com')) {
                // Extract account ID dynamically from URL if available
                const accountIdMatch = url.match(/https:\/\/([a-zA-Z0-9\-]+)\.r2\.cloudflarestorage\.com/);
                if (accountIdMatch) {
                    extractedAccountId = accountIdMatch[1];
                }
                const internalEndpoint = `https://${extractedAccountId}.r2.cloudflarestorage.com`;
                const publicDomain = 'https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev';
                
                finalUrl = url.replace(internalEndpoint, publicDomain);
                syncLogger.info(`[MailController] Converted internal R2 URL to public URL: ${url} -> ${finalUrl}`);
            }

            // Comprehensive URL analysis
            const r2Domain = 'pub-7f315f14b4bb4930bd64cae157207c92.r2.dev';
            const bucketName = process.env.CF_R2_BUCKET_NAME || 'zithspace';
            
            // Extract public domain from CF_R2_PUBLIC_URL if present
            let envPublicDomain = '';
            if (process.env.CF_R2_PUBLIC_URL) {
                try {
                    envPublicDomain = new URL(process.env.CF_R2_PUBLIC_URL).hostname;
                } catch (e) {
                    // Ignore invalid URL
                }
            }

            const isR2Url = finalUrl.includes(r2Domain) || 
                            finalUrl.includes('r2.cloudflarestorage.com') ||
                            finalUrl.includes(bucketName) ||
                            (envPublicDomain && finalUrl.includes(envPublicDomain));
                            
            const isProviderHosted = !isR2Url;
            
            syncLogger.info(`[MailController] URL Analysis`, {
                originalUrl: url,
                finalUrl,
                isProviderHosted,
                containsR2Domain: finalUrl.includes(r2Domain),
                containsBucketName: finalUrl.includes(bucketName),
                containsR2Storage: finalUrl.includes('r2.cloudflarestorage.com'),
                envPublicDomain
            });
            
            if (isProviderHosted) {
                syncLogger.info(`[MailController] Redirecting to provider-hosted attachment: ${finalUrl}`);
                return res.redirect(302, finalUrl);
            }

            // Extract and sanitize key from URL
            let key = "";
            try {
                const urlObj = new URL(finalUrl);
                key = urlObj.pathname;
                key = decodeURIComponent(key);
                if (key.startsWith('/')) key = key.slice(1);
                if (key.startsWith(bucketName + '/')) {
                    key = key.substring(bucketName.length + 1);
                }
                syncLogger.info(`[MailController] Extracted R2 key: ${key} from URL: ${finalUrl}`);
            } catch (err) {
                return res.status(400).json({ success: false, error: "Invalid URL format" });
            }

            // Use a local client with forcePathStyle: true for R2 security compatibility
            const r2Client = new S3Client({
                region: "us-east-1", 
                endpoint: `https://${extractedAccountId}.r2.cloudflarestorage.com`,
                credentials: {
                    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID!,
                    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY!
                },
                forcePathStyle: true
            });

            const filenameStr = typeof filename === 'string' ? filename : 'file';
            const ext = filenameStr.split('.').pop()?.toLowerCase() || '';
            const MIME_MAP: Record<string, string> = {
                pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4',
                mp3: 'audio/mpeg', txt: 'text/plain', csv: 'text/csv', html: 'text/html',
                zip: 'application/zip', ics: 'text/calendar',
                docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            };
            const resolvedContentType = MIME_MAP[ext] || 'application/octet-stream';

            syncLogger.info(`[MailController] R2 Fetch Details`, {
                bucketName,
                key,
                filename: filenameStr,
                contentType: resolvedContentType,
                mode
            });

            const asciiFilename = filenameStr.replace(/[^\x20-\x7E]/g, '_');
            const encodedFilename = encodeURIComponent(filenameStr);
            const contentDispositionVal = mode === 'inline'
                ? `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
                : `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;

            // Fetch from R2 using S3 Client directly with extra response headers requested from R2
            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: key,
                ResponseContentDisposition: contentDispositionVal,
                ResponseContentType: resolvedContentType
            });

            const s3Response = await r2Client.send(command);

            if (!s3Response.Body) {
                throw new Error("Empty response body from R2");
            }

            syncLogger.info(`[MailController] Successfully fetched from R2 for key: ${key}`);

            // Set final headers for the browser
            res.setHeader('Content-Type', resolvedContentType);
            res.setHeader('Content-Disposition', contentDispositionVal);

            // Pipe the body stream to the response
            if (s3Response.Body instanceof Readable) {
                return s3Response.Body.pipe(res);
            } else {
                const bodyAny = s3Response.Body as any;
                if (typeof bodyAny.pipe === 'function') {
                    return bodyAny.pipe(res);
                } else {
                    return res.send(await s3Response.Body.transformToByteArray());
                }
            }
        } catch (error: any) {
            console.error("[MailController] downloadAttachment error:", error);
            syncLogger.error(`[MailController] Failed to download attachment`, { 
                url: req.query.url, 
                filename: req.query.filename, 
                error: error.message, 
                stack: error.stack,
                errorCode: error.Code,
                errorName: error.name
            });
            
            // Check if it's an R2 authorization error
            if (error.Code === 'InvalidArgument' && error.Message === 'Authorization') {
                syncLogger.error(`[MailController] R2 Authorization error for URL: ${req.query.url}. This suggests the file may not exist or permissions issue.`);
                return res.status(404).json({
                    success: false,
                    error: "Attachment not found or access denied"
                });
            }
            
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to download attachment"
            });
        }
    }

    /**
     * POST /api/mail/:provider/disconnect
     */
    static async disconnect(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;
            const { provider } = req.params;

            if (!provider) {
                return res.status(400).json({
                    success: false,
                    error: "Provider is required"
                });
            }

            const providerUpper = provider.toUpperCase();

            // Find matching accounts
            const accounts = await prisma.mail_accounts.findMany({
                where: {
                    user_id: userId,
                    tenant_id: tenantId,
                    provider: providerUpper as any
                }
            });

            if (accounts.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: `No connected mail account found for ${provider}`
                });
            }

            // Hard disconnect: delete accounts and related data
            // Cascades handle threads, messages, attachments
            for (const acc of accounts) {
                await prisma.mail_sync_logs.deleteMany({
                    where: { account_id: acc.id }
                });
                await prisma.mail_accounts.delete({
                    where: { id: acc.id }
                });
            }
            // Also clear shared tokens in CalendarIntegration if any
            await prisma.calendarIntegration.updateMany({
                where: {
                    userId: userId,
                    provider: providerUpper as any
                },
                data: {
                    accessToken: "",
                    refreshToken: null
                }
            });

            return res.json({
                success: true,
                message: `${provider} mail disconnected and data cleared successfully`
            });
        } catch (error: any) {
            console.error("[MailController] disconnect error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to disconnect mail"
            });
        }
    }

    /**
     * AI: enhance email body — expand detail and polish tone, preserve HTML.
     */
    static async aiEnhanceContent(req: AuthRequest, res: Response) {
        try {
            const { subject, body, context } = req.body || {};
            if (!body || typeof body !== "string") {
                return res.status(400).json({
                    success: false,
                    error: "body is required"
                });
            }
            const enhanced = await MailAiService.enhanceContent({ subject, body, context });
            return res.json({
                success: true,
                data: { body: enhanced }
            });
        } catch (error: any) {
            console.error("[MailController] aiEnhanceContent error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to enhance content"
            });
        }
    }

    /**
     * AI: light-touch grammar correction — preserve HTML and voice.
     */
    static async aiCorrectGrammar(req: AuthRequest, res: Response) {
        try {
            const { body } = req.body || {};
            if (!body || typeof body !== "string") {
                return res.status(400).json({
                    success: false,
                    error: "body is required"
                });
            }
            const corrected = await MailAiService.correctGrammar(body);
            return res.json({
                success: true,
                data: { body: corrected }
            });
        } catch (error: any) {
            console.error("[MailController] aiCorrectGrammar error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to correct grammar"
            });
        }
    }

    /**
     * Helper to map thread data from snake_case to camelCase
     */
    private static mapThread(thread: any) {
        if (!thread) return null;
        return {
            ...thread,
            fromAddress: thread.from_address,
            lastMessageAt: thread.last_message_at,
            isRead: thread.is_read,
            hasAttachments: thread.has_attachments,
            messageCount: thread.message_count,
            toEmails: thread.to_emails,
        };
    }

    /**
     * Helper to map message data from snake_case to camelCase
     */
    private static mapMessage(message: any) {
        if (!message) return null;
        return {
            ...message,
            externalId: message.external_id,
            threadId: message.thread_id,
            fromEmail: message.from_email,
            toEmails: message.to_emails,
            ccEmails: message.cc_emails,
            bccEmails: message.bcc_emails,
            bodyHtml: message.body_html,
            bodyText: message.body_text,
            receivedAt: message.received_at,
            isRead: message.is_read,
            isSent: message.is_sent,
            hasAttachments: message.has_attachments,
            attachments: message.mail_attachments?.map((att: any) => ({
                ...att,
                fileName: att.file_name,
                downloadUrl: att.download_url
            }))
        };
    }
}
