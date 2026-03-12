import { Response } from "express";
import axios from "axios";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";
import { MailService } from "@/services/mail/MailService";
import { syncLogger } from "@/utils/logger";

export class MailController {
    /**
     * Get mail account status (connected email address)
     */
    static async getStatus(req: AuthRequest, res: Response) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;

            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true },
                select: { email: true, provider: true }
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
     * Get unique contacts from system users and calendar attendees
     */
    static async getContacts(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;

            const contactsMap = new Map<string, { name: string; email: string }>();

            // 1. Fetch system users
            const users = await prisma.user.findMany({
                where: { tenantId, isActive: true },
                select: { name: true, workEmail: true, personalEmail: true }
            });

            for (const user of users) {
                if (user.workEmail) {
                    contactsMap.set(user.workEmail.toLowerCase(), { name: user.name, email: user.workEmail });
                }
                if (user.personalEmail) {
                    contactsMap.set(user.personalEmail.toLowerCase(), { name: user.name, email: user.personalEmail });
                }
            }

            // 2. Fetch unique attendees from calendar events
            const events = await prisma.calendarEvent.findMany({
                where: { tenantId, userId },
                select: { attendees: true, organizerEmail: true }
            });

            for (const event of events) {
                if (event.organizerEmail && !contactsMap.has(event.organizerEmail.toLowerCase())) {
                    contactsMap.set(event.organizerEmail.toLowerCase(), { name: event.organizerEmail, email: event.organizerEmail });
                }

                if (event.attendees && Array.isArray(event.attendees)) {
                    for (const attendee of event.attendees as any[]) {
                        let email = '';
                        let name = '';

                        if (typeof attendee === 'string') {
                            email = attendee;
                            name = attendee;
                        } else if (typeof attendee === 'object' && attendee !== null) {
                            email = attendee.email || attendee.emailAddress?.address || attendee.address || '';
                            name = attendee.displayName || attendee.name || attendee.emailAddress?.name || email;
                        }

                        if (email && email.includes('@') && !contactsMap.has(email.toLowerCase())) {
                            contactsMap.set(email.toLowerCase(), { name: name || email, email });
                        }
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
            const { label, filter, search } = req.query;

            // 1. Find the connected mail account
            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
            });

            if (!account) {
                return res.json({ success: true, data: [] });
            }

            // 2. Fetch from DB
            const whereClause: any = { accountId: account.id, tenantId };

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
                whereClause.isRead = false;
            } else if (filter === 'READ') {
                whereClause.isRead = true;
            } else if (filter === 'HAS_ATTACHMENTS') {
                whereClause.hasAttachments = true;
            } else if (filter === 'NO_ATTACHMENTS') {
                whereClause.hasAttachments = false;
            }

            // Search filter
            if (search && typeof search === 'string' && search.trim()) {
                const searchLower = search.trim();
                const searchFilter = {
                    OR: [
                        { subject: { contains: searchLower, mode: 'insensitive' } },
                        { fromAddress: { contains: searchLower, mode: 'insensitive' } },
                        { snippet: { contains: searchLower, mode: 'insensitive' } },
                        // Standard Prisma JSON array search
                        { toEmails: { array_contains: searchLower } }
                    ]
                };

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

            const threads = await prisma.mailThread.findMany({
                where: whereClause,
                orderBy: { lastMessageAt: 'desc' }
            });

            return res.json({
                success: true,
                data: threads
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

            const messages = await prisma.mailMessage.findMany({
                where: {
                    threadId,
                    tenantId
                },
                include: {
                    attachments: true
                },
                orderBy: {
                    receivedAt: 'asc'
                }
            });

            return res.json({
                success: true,
                data: messages
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
            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
            });

            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: "No connected mail account found"
                });
            }

            await MailService.syncMail(userId, tenantId, account.email);

            return res.json({
                success: true,
                message: "Mail synchronization completed"
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
            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
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

            // Trigger immediate sync and wait for it to ensure UI updates correctly
            try {
                await MailService.syncMail(userId, tenantId, account.email);
            } catch (err) {
                console.error("[MailController] Sync after send error:", err);
            }

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

            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
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

            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
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

            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
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

            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
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

            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
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

            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
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

            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
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

            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
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

            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
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

            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
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

            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
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
     * Proxy attachment download from R2 to handle CORS and Content-Disposition
     */
    static async downloadAttachment(req: AuthRequest, res: Response) {
        try {
            const { url, filename, mode } = req.query;
            syncLogger.info(`[MailController] Proxying attachment`, { url, filename, mode });

            if (!url || typeof url !== 'string') {
                return res.status(400).json({ success: false, error: "URL is required" });
            }

            // For security, verify the URL is from our R2 bucket
            if (!url.includes('r2.dev')) {
                return res.status(403).json({ success: false, error: "Unauthorized attachment source" });
            }

            const response = await axios.get(url, { responseType: 'stream' });

            // Set headers — derive content-type from filename when R2 serves generic octet-stream
            const r2ContentType = response.headers['content-type'] || '';
            const filenameStr = typeof filename === 'string' ? filename : 'file';
            const ext = filenameStr.split('.').pop()?.toLowerCase() || '';

            const MIME_MAP: Record<string, string> = {
                pdf: 'application/pdf',
                png: 'image/png',
                jpg: 'image/jpeg',
                jpeg: 'image/jpeg',
                gif: 'image/gif',
                webp: 'image/webp',
                svg: 'image/svg+xml',
                mp4: 'video/mp4',
                mp3: 'audio/mpeg',
                txt: 'text/plain',
                csv: 'text/csv',
                html: 'text/html',
                htm: 'text/html',
            };

            const resolvedContentType =
                (!r2ContentType || r2ContentType === 'application/octet-stream')
                    ? (MIME_MAP[ext] || 'application/octet-stream')
                    : r2ContentType;

            res.setHeader('Content-Type', resolvedContentType);

            if (mode === 'inline') {
                res.setHeader('Content-Disposition', `inline; filename="${filenameStr}"`);
            } else {
                res.setHeader('Content-Disposition', `attachment; filename="${filenameStr}"`);
            }

            // Allow iframe embedding from same origin
            res.setHeader('X-Frame-Options', 'SAMEORIGIN');
            res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");

            return response.data.pipe(res);
        } catch (error: any) {
            console.error("[MailController] downloadAttachment error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Failed to proxy attachment"
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
            const accounts = await prisma.mailAccount.findMany({
                where: {
                    userId,
                    tenantId,
                    provider: providerUpper as any
                }
            });

            if (accounts.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: `No connected mail account found for ${provider}`
                });
            }

            // Delete each account and its logs
            // Cascades handle threads, messages, attachments
            for (const acc of accounts) {
                await prisma.mailSyncLog.deleteMany({
                    where: { accountId: acc.id }
                });
                await prisma.mailAccount.delete({
                    where: { id: acc.id }
                });
            }

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
}
