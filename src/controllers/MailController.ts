import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";
import { MailService } from "@/services/mail/MailService";

export class MailController {
    /**
     * Get mail account status (connected email address)
     */
    static async getStatus(req: AuthRequest, res: Response) {
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
        try {
            const userId = req.user!.id;
            const tenantId = req.tenantId!;
            const { label } = req.query;

            // 1. Find the connected mail account
            const account = await prisma.mailAccount.findFirst({
                where: { userId, tenantId, isActive: true }
            });

            if (!account) {
                return res.json({ success: true, data: [] });
            }

            // 2. Trigger sync in background (non-blocking to prevent UI timeout)
            MailService.syncMail(userId, tenantId, account.email).catch(err => {
                console.error("[MailController] Background sync error:", err);
            });

            // 3. Fetch from DB
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
                message: "Mail synchronization started"
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
            const { to, subject, body, cc, bcc } = req.body;

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

            await MailService.sendMessage(userId, tenantId, account.email, {
                to: Array.isArray(to) ? to : [to],
                subject,
                body,
                cc,
                bcc,
                from: account.email
            });

            // Trigger immediate background sync
            MailService.syncMail(userId, tenantId, account.email).catch(err => {
                console.error("[MailController] Background sync after send error:", err);
            });

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
            const { to, subject, body, cc, bcc, id } = req.body;

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
                id
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
}
