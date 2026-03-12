import { prisma } from "../../config/database";
import { MailAccount, MailThread, MailMessage, MailAttachment, MailProvider } from "@prisma/client";
import { IMailProvider, MailMessageData, MailThreadData } from "./IMailProvider";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { MailProviderFactory } from "./MailProviderFactory";
import { UnifiedAuthService } from "../UnifiedAuthService";
import { uploadFileToR2 } from "../../utils/r2Client";
import { syncLogger } from "../../utils/logger";

/**
 * Helper to strip characters that Postgres doesn't support in TEXT/VARCHAR fields,
 * specifically the null byte (\u0000).
 */
function sanitizeString(str: string | null | undefined): string {
    if (!str) return "";
    return str.replace(/\u0000/g, "");
}

export class MailService {
    /**
     * Generate HTML and Plain Text sections for attachments
     */
    private static generateAttachmentSection(attachments: any[]) {
        let attachmentSection = "\n\n--- Attachments ---\n";
        let attachmentHtml = `
            <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #333; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                <p style="font-size: 14px; color: #888; margin-bottom: 12px;">Attachments:</p>
                <div style="display: block;">
            `;

        for (const att of attachments) {
            const link = att.url;
            const name = att.filename || "Attachment";
            const sizeStr = att.size ? `${(att.size / 1024).toFixed(1)} KB` : "0 KB";
            const ext = name.split('.').pop()?.toLowerCase();

            // Select icon based on extension
            let icon = "&#128196;"; // Default 📄
            let iconBg = "#374151"; // Default Gray

            if (ext === 'pdf') {
                icon = "&#128196;"; // PDF same icon but orange
                iconBg = "#ff4d00"; // Orange
            } else if (['doc', 'docx', 'rtf', 'odt'].includes(ext || '')) {
                icon = "&#128221;"; // Memo 📝
                iconBg = "#2563eb"; // Blue for Work/Word
            } else if (['xls', 'xlsx', 'csv'].includes(ext || '')) {
                icon = "&#128202;"; // Chart 📊
                iconBg = "#16a34a"; // Green for Excel
            } else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) {
                icon = "&#128444;"; // Frame 🖼️
                iconBg = "#9333ea"; // Purple for Images
            }

            attachmentSection += `- ${name}: ${link}\n`;

            // Card Template (Using tables for universal email client compatibility)
            attachmentHtml += `
            <table cellpadding="0" cellspacing="0" border="0" style="background-color: #1a1a1a; border-radius: 8px; margin-bottom: 12px; border: 1px solid #333; width: 100%; max-width: 320px;">
                <tr>
                    <td style="padding: 12px;">
                        <table cellpadding="0" cellspacing="0" border="0" width="100%">
                            <tr>
                                <td width="48" style="background-color: ${iconBg}; border-radius: 6px; text-align: center; height: 48px; min-width: 48px;">
                                    <span style="color: white; font-size: 24px;">${icon}</span>
                                </td>
                                <td style="padding-left: 12px; text-align: left;">
                                    <div style="color: #e5e7eb; font-size: 14px; font-weight: 500; line-height: 1.4; word-break: break-all;">${name}</div>
                                    <div style="color: #9ca3af; font-size: 12px; margin-top: 4px;">${sizeStr}</div>
                                </td>
                                <td width="32" style="text-align: right; vertical-align: middle; white-space: nowrap; padding-right: 8px;">
                                    <a href="${link}" target="_blank" style="text-decoration: none; color: #9ca3af; font-size: 20px; font-weight: bold; padding: 4px;" title="Download">&#x2913;</a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            `;
        }
        attachmentHtml += "</div></div>";

        return { attachmentSection, attachmentHtml };
    }

    /**
     * Get threads for a specific mail account
     */
    static async getThreads(userId: string, tenantId: string, email: string) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        return await provider.getThreads(accessToken, account.syncCursor || undefined, account.lastSyncedAt || undefined);
    }

    /**
     * Sync threads and messages for an account
     */
    static async syncMail(userId: string, tenantId: string, email: string) {
        syncLogger.info(`[MailService] Starting sync for ${email} (User: ${userId})`);
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        // Use a 5-minute buffer for incremental sync to avoid missing messages due to provider lag or clock skew
        const lastSyncedAtWithBuffer = account.lastSyncedAt
            ? new Date(account.lastSyncedAt.getTime() - 5 * 60 * 1000)
            : undefined;

        const { threads, nextCursor } = await provider.getThreads(
            accessToken,
            account.syncCursor || undefined,
            lastSyncedAtWithBuffer
        );

        for (const threadIdData of threads) { // Renamed loop variable to avoid confusion with thread object
            const existingThread = await prisma.mailThread.findUnique({
                where: { id: threadIdData.id }
            });

            const mergedLabels = Array.from(new Set([
                ...(existingThread?.labels || []),
                ...(threadIdData.labels || [])
            ]));

            await prisma.mailThread.upsert({
                where: { id: threadIdData.id },
                create: {
                    id: threadIdData.id,
                    accountId: account.id,
                    tenantId: tenantId,
                    externalThreadId: threadIdData.id,
                    subject: sanitizeString(threadIdData.subject),
                    lastMessageAt: threadIdData.lastMessageAt,
                    snippet: sanitizeString(threadIdData.snippet),
                    labels: mergedLabels,
                    hasAttachments: threadIdData.hasAttachments || false,
                    messageCount: threadIdData.messageCount || 1,
                    fromAddress: threadIdData.participants?.from,
                    toEmails: (threadIdData.participants?.to || []) as any,
                    isRead: threadIdData.isRead ?? true
                } as any,
                update: {
                    subject: sanitizeString(threadIdData.subject),
                    lastMessageAt: threadIdData.lastMessageAt,
                    snippet: sanitizeString(threadIdData.snippet),
                    labels: mergedLabels,
                    hasAttachments: threadIdData.hasAttachments || false,
                    messageCount: threadIdData.messageCount,
                    fromAddress: threadIdData.participants?.from,
                    toEmails: (threadIdData.participants?.to || []) as any,
                    isRead: threadIdData.isRead ?? true
                } as any
            });

            const messages = await provider.getMessages(accessToken, threadIdData.id);
            // After sync, we should update the thread again with the real sender/recipients from the most recent message if needed
            // But for now let's just update messages first
            for (const msg of messages) {
                const fromEmail = msg.from?.toLowerCase() || "";
                const userEmail = account.email.toLowerCase();
                const isSentByMe = fromEmail.includes(`<${userEmail}>`) || fromEmail === userEmail;
                const isSentFolder = msg.labels && msg.labels.includes("SENT");

                // Prepare message data for Prisma
                const messageData: any = {
                    id: msg.id,
                    threadId: threadIdData.id,
                    accountId: account.id,
                    tenantId: tenantId,
                    externalId: msg.id,
                    subject: sanitizeString(msg.subject),
                    fromEmail: sanitizeString(msg.from),
                    toEmails: msg.to as any, // Json field
                    ccEmails: msg.cc as any,
                    bccEmails: msg.bcc as any,
                    bodyText: sanitizeString(msg.body),
                    bodyHtml: sanitizeString(msg.htmlBody),
                    snippet: sanitizeString(msg.snippet || (msg.body ? msg.body.replace(/<[^>]*>?/gm, '').substring(0, 200) : "")),
                    receivedAt: msg.receivedAt,
                    isRead: msg.isRead ?? false,
                    hasAttachments: msg.hasAttachments || false, // Added this
                    isSent: isSentByMe || isSentFolder,
                    labels: msg.labels || (isSentByMe ? ["SENT"] : [])
                };

                // Check if message already exists by its real externalId
                const existingMessage = await prisma.mailMessage.findUnique({
                    where: { externalId_accountId: { externalId: msg.id, accountId: account.id } }
                }) as any;

                // Also check if a locally-saved SENT copy exists for this thread or with a null
                // threadId (happens when MS sendMail returned void and no threadId was recorded).
                // Match by: temp externalId (starts with 'sent_') + same subject + sent within last 10 min.
                let localSentDuplicate: any = null;
                if (!existingMessage && (isSentByMe || isSentFolder)) {
                    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
                    localSentDuplicate = await prisma.mailMessage.findFirst({
                        where: {
                            accountId: account.id,
                            isSent: true,
                            externalId: { startsWith: 'sent_' },
                            subject: sanitizeString(msg.subject), // same subject
                            receivedAt: { gte: tenMinutesAgo },   // sent recently
                            OR: [
                                { threadId: threadIdData.id },    // thread-matched
                                { threadId: null }                 // null threadId (MS case)
                            ]
                        } as any
                    }) as any;
                }

                let upsertedMessage;
                if (existingMessage) {
                    // Update existing by real provider ID
                    const updateData: any = {
                        threadId: threadIdData.id,
                        subject: sanitizeString(msg.subject),
                        fromEmail: sanitizeString(msg.from),
                        toEmails: msg.to as any,
                        ccEmails: msg.cc as any,
                        bccEmails: msg.bcc as any,
                        snippet: sanitizeString(msg.snippet || (msg.body ? msg.body.replace(/<[^>]*>?/gm, '').substring(0, 200) : "")),
                        labels: msg.labels || (isSentByMe ? ["SENT"] : []),
                        isRead: msg.isRead ?? false,
                        hasAttachments: (existingMessage.hasAttachments || msg.hasAttachments) ? true : false
                    };

                    // Avoid overwriting body of Sent messages with provider-returned content 
                    // unless our current body is empty (e.g. initial sync)
                    const shouldUpdateBody = !existingMessage.isSent || !existingMessage.bodyHtml;
                    if (shouldUpdateBody) {
                        updateData.bodyText = sanitizeString(msg.body);
                        updateData.bodyHtml = sanitizeString(msg.htmlBody);
                    }

                    upsertedMessage = await prisma.mailMessage.update({
                        where: { id: existingMessage.id },
                        data: updateData
                    });
                } else if (localSentDuplicate) {
                    // This is the provider's copy of a message we already saved locally with a temp ID.
                    // Update it with the real provider ID so future syncs will match correctly.
                    syncLogger.info(`[MailService] Linking local sent message ${localSentDuplicate.id} to real externalId ${msg.id}`);
                    const updateData: any = {
                        externalId: msg.id,
                        threadId: threadIdData.id,
                        labels: msg.labels || ["SENT"],
                        isRead: msg.isRead ?? false,
                        hasAttachments: (localSentDuplicate.hasAttachments || msg.hasAttachments) ? true : false
                    };

                    // Only update body if the local copy has no body (it should already have ours)
                    if (!localSentDuplicate.bodyHtml && msg.htmlBody) {
                        updateData.bodyHtml = sanitizeString(msg.htmlBody);
                        updateData.bodyText = sanitizeString(msg.body);
                    }

                    upsertedMessage = await prisma.mailMessage.update({
                        where: { id: localSentDuplicate.id },
                        data: updateData
                    });
                } else {
                    // Create new
                    upsertedMessage = await prisma.mailMessage.create({
                        data: messageData as any
                    });
                }

                // Handle attachments
                if (msg.attachments && msg.attachments.length > 0) {
                    syncLogger.info(`[MailService] Found ${msg.attachments.length} attachments for message ${msg.id}`);
                    for (const attachment of msg.attachments) {
                        try {
                            // Check if attachment already exists to avoid duplicates
                            const existingAtt = await prisma.mailAttachment.findFirst({
                                where: {
                                    messageId: upsertedMessage.id,
                                    fileName: attachment.filename,
                                    size: attachment.size
                                }
                            });

                            if (existingAtt) {
                                syncLogger.info(`[MailService] Attachment ${attachment.filename} already exists, skipping upload`);
                                continue;
                            }

                            // uploadFileToR2 expects (base64File, fileName, tenantId, ticketId)
                            const base64Content = `data:${attachment.contentType};base64,${(attachment.content as Buffer).toString('base64')}`;

                            const r2Result = await uploadFileToR2(
                                base64Content,
                                attachment.filename,
                                tenantId,
                                `mail_${threadIdData.id.replace('|', '_')}` // Replace | to avoid path issues
                            );

                            await prisma.mailAttachment.create({
                                data: {
                                    id: `att_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                                    messageId: upsertedMessage.id,
                                    tenantId: tenantId,
                                    fileName: attachment.filename,
                                    mimeType: attachment.contentType || 'application/octet-stream',
                                    size: attachment.size,
                                    storageKey: r2Result.fileUrl.split('/').pop() || '',
                                    downloadUrl: r2Result.fileUrl
                                }
                            });
                            syncLogger.info(`[MailService] Successfully uploaded and saved attachment ${attachment.filename}`);
                        } catch (err) {
                            syncLogger.error(`[MailService] Failed to upload attachment ${attachment.filename}: ${err.message}`);
                        }
                    }
                }
            }

            // Sync thread level info from the latest message.
            // Also check if ANY message OR any stored attachment in the thread
            // marks it as having attachments — this is the source of truth.
            const latestMessage = await prisma.mailMessage.findFirst({
                where: { threadId: threadIdData.id },
                orderBy: { receivedAt: 'desc' }
            });

            if (latestMessage) {
                // Fetch existing thread to merge labels
                const existingThread = await prisma.mailThread.findUnique({
                    where: { id: threadIdData.id }
                });

                // A thread 'has attachments' if:
                //   (a) any of its messages has hasAttachments=true, OR
                //   (b) there are actual MailAttachment rows stored for it
                const msgWithAttachment = await prisma.mailMessage.findFirst({
                    where: { threadId: threadIdData.id, hasAttachments: true } as any
                });

                const storedAttachment = await prisma.mailAttachment.findFirst({
                    where: { message: { threadId: threadIdData.id } } as any
                });

                const resolvedHasAttachments = !!(msgWithAttachment || storedAttachment);

                // Union labels from message level to ensure folder visibility
                const mergedLabels = Array.from(new Set([
                    ...(existingThread?.labels || []),
                    ...(latestMessage.labels || [])
                ]));

                await prisma.mailThread.update({
                    where: { id: threadIdData.id },
                    data: {
                        fromAddress: latestMessage.fromEmail,
                        toEmails: latestMessage.toEmails as any,
                        snippet: latestMessage.snippet,
                        labels: mergedLabels,
                        hasAttachments: resolvedHasAttachments
                    } as any
                });
            }
        }

        // Update sync cursor
        await prisma.mailAccount.update({
            where: { id: account.id },
            data: {
                syncCursor: nextCursor,
                lastSyncedAt: new Date()
            }
        });
    }

    /**
     * Delete a thread
     */
    static async deleteThread(userId: string, tenantId: string, email: string, threadId: string) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        // Check if thread is already in TRASH in local DB
        const thread = await prisma.mailThread.findUnique({
            where: { id: threadId },
            select: { labels: true }
        });

        const isTrashed = thread?.labels.includes('TRASH');

        if (isTrashed) {
            // Permanent delete from provider
            await provider.deleteThread(accessToken, threadId);

            // Delete from local DB - delete messages first to avoid FK violation
            await prisma.mailMessage.deleteMany({ where: { threadId } });
            await prisma.mailThread.delete({ where: { id: threadId } });
            return;
        }

        // 1. Update local DB status first for immediate UI responsiveness
        await prisma.mailThread.update({
            where: { id: threadId },
            data: { labels: { set: ['TRASH'] } }
        });

        await prisma.mailMessage.updateMany({
            where: { threadId: threadId },
            data: { labels: { set: ['TRASH'] } }
        });

        // 2. Perform provider trash operation
        await provider.trashThread(accessToken, threadId);
    }

    /**
     * Delete multiple threads
     */
    static async deleteThreads(userId: string, tenantId: string, email: string, threadIds: string[]) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        // 1. Update local DB status first for all threads (Immediate UI feedback)
        await prisma.mailThread.updateMany({
            where: { id: { in: threadIds }, accountId: account.id },
            data: { labels: { set: ['TRASH'] } }
        });

        await prisma.mailMessage.updateMany({
            where: { threadId: { in: threadIds }, accountId: account.id },
            data: { labels: { set: ['TRASH'] } }
        });

        // 2. Perform provider trash operations
        if (provider.bulkTrashThreads) {
            await provider.bulkTrashThreads(accessToken, threadIds);
        } else {
            await Promise.all(threadIds.map(id => provider.trashThread(accessToken, id)));
        }
    }

    /**
     * Empty the trash folder
     */
    static async emptyTrash(userId: string, tenantId: string, email: string) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        // 1. Delete all TRASH threads from local DB first (Immediate UI feedback)
        const trashedThreads = await prisma.mailThread.findMany({
            where: { accountId: account.id, labels: { has: 'TRASH' } },
            select: { id: true }
        });

        const threadIds = trashedThreads.map(t => t.id);

        if (threadIds.length > 0) {
            await prisma.mailMessage.deleteMany({
                where: { threadId: { in: threadIds } }
            });

            await prisma.mailThread.deleteMany({
                where: { id: { in: threadIds } }
            });
        }

        // 2. Tell provider to empty trash
        await provider.emptyTrash(accessToken);
    }

    /**
     * Restore a thread from trash
     */
    static async restoreThread(userId: string, tenantId: string, email: string, threadId: string) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        // Infer original folder
        const thread = await prisma.mailThread.findUnique({
            where: { id: threadId },
            include: { messages: { orderBy: { receivedAt: 'desc' }, take: 1 } }
        } as any); // Type cast if relation is missing or misnamed

        // If fromAddress is the user's email, it belongs in SENT
        const fromMe = thread?.fromAddress?.toLowerCase().includes(email.toLowerCase());
        const targetLabel = fromMe ? 'SENT' : 'INBOX';

        // 1. Update local DB: remove TRASH, add targetLabel (Immediate UI feedback)
        await prisma.mailThread.update({
            where: { id: threadId },
            data: { labels: { set: [targetLabel] } }
        });

        await prisma.mailMessage.updateMany({
            where: { threadId: threadId },
            data: { labels: { set: [targetLabel] } }
        });

        // 2. Update Provider
        await provider.restoreThread(accessToken, threadId);
    }

    /**
     * Send an email
     */
    static async sendMessage(userId: string, tenantId: string, email: string, mailData: any) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        if (mailData.scheduledAt && new Date(mailData.scheduledAt) > new Date()) {
            // Save as scheduled message in DB, don't send yet
            const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const message = await prisma.mailMessage.create({
                data: {
                    id: messageId,
                    accountId: account.id,
                    tenantId: tenantId,
                    externalId: `sched_${messageId}`, // Temporary external ID
                    subject: mailData.subject,
                    fromEmail: mailData.from,
                    toEmails: mailData.to as any,
                    ccEmails: mailData.cc as any,
                    bccEmails: mailData.bcc as any,
                    bodyHtml: mailData.body,
                    snippet: mailData.body ? mailData.body.replace(/<[^>]*>?/gm, '').substring(0, 200) : "",
                    isSent: false,
                    scheduledAt: new Date(mailData.scheduledAt),
                    labels: ["SCHEDULED"]
                }
            });

            // Save attachments if any
            if (mailData.attachments && mailData.attachments.length > 0) {
                for (const att of mailData.attachments) {
                    await prisma.mailAttachment.create({
                        data: {
                            id: `att_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                            messageId: message.id,
                            tenantId: tenantId,
                            fileName: att.filename,
                            mimeType: att.contentType,
                            size: att.size || 0,
                            storageKey: att.url.split('/').pop() || '',
                            downloadUrl: att.url
                        }
                    });
                }
            }

            syncLogger.info(`[MailService] Email scheduled for ${mailData.scheduledAt} (User: ${userId})`);
            return;
        }

        const hasAttachments = mailData.attachments && mailData.attachments.length > 0;

        // Store original bodies to avoid saving appended cards to our local DB
        const originalBodyHtml = mailData.body;
        const originalBodyText = mailData.bodyText;

        if (hasAttachments) {
            const { attachmentSection, attachmentHtml } = MailService.generateAttachmentSection(mailData.attachments);
            mailData.body = (mailData.body || "") + attachmentHtml;
            if (mailData.bodyText) {
                mailData.bodyText += attachmentSection;
            }
        }

        const sendResult = await provider.sendMessage(accessToken, mailData) as { messageId: string, threadId?: string };

        // Restore original bodies
        mailData.body = originalBodyHtml;
        mailData.bodyText = originalBodyText;

        syncLogger.info(`[MailService] Message sent via provider (messageId=${sendResult?.messageId}). Saving optimistic copy and triggering sync.`);

        // Step 3: Create an optimistic local copy so the UI reflects the sent mail immediately.
        // We use a temporary externalId starting with 'sent_' which MailService.syncMail 
        // will later link to the real provider ID.
        try {
            const threadId = sendResult?.threadId;
            const tempExternalId = `sent_${sendResult?.messageId || Date.now()}`;

            // 1. Create or update thread
            if (threadId) {
                const existingThread = await prisma.mailThread.findUnique({
                    where: { id: threadId }
                });

                const mergedLabels = Array.from(new Set([
                    ...(existingThread?.labels || []),
                    "SENT"
                ]));

                await prisma.mailThread.upsert({
                    where: { id: threadId },
                    create: {
                        id: threadId,
                        accountId: account.id,
                        tenantId: tenantId,
                        externalThreadId: threadId,
                        subject: sanitizeString(mailData.subject || "(No Subject)"),
                        lastMessageAt: new Date(),
                        snippet: sanitizeString(mailData.body?.replace(/<[^>]*>?/gm, '').substring(0, 200) || ""),
                        labels: ["SENT"],
                        fromAddress: account.email,
                        toEmails: (mailData.to || []) as any
                    },
                    update: {
                        lastMessageAt: new Date(),
                        snippet: sanitizeString(mailData.body?.replace(/<[^>]*>?/gm, '').substring(0, 200) || ""),
                        labels: mergedLabels,
                        fromAddress: account.email,
                        toEmails: (mailData.to || []) as any
                    }
                });
            }

            // 2. Create message
            const message = await prisma.mailMessage.create({
                data: {
                    id: uuidv4(),
                    accountId: account.id,
                    tenantId: tenantId,
                    threadId: threadId || null,
                    externalId: tempExternalId,
                    subject: sanitizeString(mailData.subject),
                    fromEmail: account.email,
                    toEmails: (mailData.to || []) as any,
                    ccEmails: (mailData.cc || []) as any,
                    bccEmails: (mailData.bcc || []) as any,
                    bodyHtml: mailData.body,
                    bodyText: mailData.bodyText || mailData.body?.replace(/<[^>]*>?/gm, ''),
                    snippet: sanitizeString(mailData.body?.replace(/<[^>]*>?/gm, '').substring(0, 200) || ""),
                    receivedAt: new Date(),
                    isRead: true,
                    isSent: true,
                    labels: ["SENT"]
                } as any // Use any to bypass strict relation/unchecked mix validation
            });

            // 3. Save attachments if any
            if (mailData.attachments && mailData.attachments.length > 0) {
                for (const att of mailData.attachments) {
                    await prisma.mailAttachment.create({
                        data: {
                            id: `att_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                            messageId: message.id,
                            tenantId: tenantId,
                            fileName: att.filename,
                            mimeType: att.contentType,
                            size: att.size || 0,
                            storageKey: att.url.split('/').pop() || '',
                            downloadUrl: att.url
                        }
                    });
                }
            }
        } catch (optimisticErr: any) {
            syncLogger.warn(`[MailService] Optimistic sent mail storage failed (non-fatal): ${optimisticErr.message}`);
        }

        // Immediately sync so the sent mail appears with the correct provider IDs.
        try {
            await MailService.syncMail(userId, tenantId, email);
        } catch (syncErr: any) {
            syncLogger.warn(`[MailService] Post-send sync failed (non-fatal): ${syncErr.message}`);
        }
    }

    /**
     * Process scheduled emails that are due
     */
    static async processScheduledEmails() {
        const now = new Date();
        const scheduledMessages = await prisma.mailMessage.findMany({
            where: {
                scheduledAt: { lte: now },
                isSent: false
            },
            include: {
                account: true,
                attachments: true
            }
        });

        if (scheduledMessages.length === 0) return;

        syncLogger.info(`[MailService] Processing ${scheduledMessages.length} scheduled emails`);

        for (const msg of scheduledMessages) {
            try {
                const accessToken = await UnifiedAuthService.getValidAccessToken(msg.account.userId, msg.account.provider as any);
                const provider = MailProviderFactory.getProvider(msg.account.provider);

                await provider.sendMessage(accessToken, {
                    to: msg.toEmails as string[],
                    cc: msg.ccEmails as string[],
                    bcc: msg.bccEmails as string[],
                    subject: msg.subject,
                    body: msg.bodyHtml || msg.bodyText,
                    from: msg.account.email,
                    attachments: msg.attachments.map(att => ({
                        filename: att.fileName,
                        url: att.downloadUrl,
                        contentType: att.mimeType,
                        size: att.size
                    }))
                });

                // Update message as sent
                await prisma.mailMessage.update({
                    where: { id: msg.id },
                    data: {
                        isSent: true,
                        sentAt: new Date(),
                        scheduledAt: null, // Clear scheduled status
                        labels: { set: ["SENT"] }
                    }
                });

                syncLogger.info(`[MailService] Sent scheduled email: ${msg.id}`);
            } catch (err: any) {
                syncLogger.error(`[MailService] Failed to send scheduled email ${msg.id}: ${err.message}`);
            }
        }
    }

    static async saveDraft(userId: string, tenantId: string, email: string, draftData: any) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        let result;
        if (draftData.id) {
            await provider.updateDraft(accessToken, draftData.id, draftData);
            result = { id: draftData.id };
        } else {
            result = await provider.saveDraft(accessToken, draftData);
        }

        // Save to local DB immediately for better UX
        try {
            const messageExternalId = result.messageId || `draft_${result.id}`;
            const threadId = result.threadId || draftData.threadId || messageExternalId;

            if (threadId) {
                // Ensure thread exists
                await prisma.mailThread.upsert({
                    where: { id: threadId },
                    create: {
                        id: threadId,
                        accountId: account.id,
                        tenantId: tenantId,
                        externalThreadId: threadId,
                        subject: sanitizeString(draftData.subject || "(No Subject)"),
                        lastMessageAt: new Date(),
                        messageCount: 1,
                        labels: ["DRAFTS"],
                        snippet: sanitizeString(draftData.body ? draftData.body.replace(/<[^>]*>?/gm, '').substring(0, 200) : ""),
                        fromAddress: account.email
                    },
                    update: {
                        lastMessageAt: new Date(),
                        subject: sanitizeString(draftData.subject || "(No Subject)"),
                        snippet: sanitizeString(draftData.body ? draftData.body.replace(/<[^>]*>?/gm, '').substring(0, 200) : "")
                    }
                });
            }

            // Create or update message
            await prisma.mailMessage.upsert({
                where: {
                    externalId_accountId: {
                        externalId: messageExternalId,
                        accountId: account.id
                    }
                },
                create: {
                    id: `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                    accountId: account.id,
                    tenantId: tenantId,
                    threadId: threadId,
                    externalId: messageExternalId,
                    subject: sanitizeString(draftData.subject || "(No Subject)"),
                    fromEmail: sanitizeString(account.email),
                    toEmails: draftData.to as any || [],
                    ccEmails: draftData.cc as any || [],
                    bccEmails: draftData.bcc as any || [],
                    bodyHtml: sanitizeString(draftData.body),
                    bodyText: sanitizeString(draftData.bodyText || draftData.body?.replace(/<[^>]*>?/gm, '')),
                    snippet: sanitizeString(draftData.body ? draftData.body.replace(/<[^>]*>?/gm, '').substring(0, 200) : ""),
                    isSent: false,
                    receivedAt: new Date(),
                    labels: { set: ["DRAFTS"] }
                },
                update: {
                    subject: sanitizeString(draftData.subject || "(No Subject)"),
                    toEmails: draftData.to as any || [],
                    ccEmails: draftData.cc as any || [],
                    bccEmails: draftData.bcc as any || [],
                    bodyHtml: sanitizeString(draftData.body),
                    bodyText: sanitizeString(draftData.bodyText || draftData.body?.replace(/<[^>]*>?/gm, '')),
                    snippet: sanitizeString(draftData.body ? draftData.body.replace(/<[^>]*>?/gm, '').substring(0, 200) : ""),
                    updatedAt: new Date()
                }
            } as any);

            syncLogger.info(`[MailService] Draft ${result.id} saved to local DB`);

            // Handle attachments for drafts
            if (draftData.attachments && draftData.attachments.length > 0) {
                // Ensure draft message has premium card UI if not already present
                let hasCardUI = draftData.body?.includes('background-color: #1a1a1a');
                if (!hasCardUI) {
                    const { attachmentHtml } = MailService.generateAttachmentSection(draftData.attachments);
                    await prisma.mailMessage.update({
                        where: { id_accountId: { id: (await prisma.mailMessage.findFirst({ where: { externalId: messageExternalId, accountId: account.id } }))?.id || '', accountId: account.id } },
                        data: { bodyHtml: (draftData.body || "") + attachmentHtml }
                    } as any);
                }

                for (const att of draftData.attachments) {
                    if (!att.url) continue;

                    // Check if attachment already exists for this message
                    const msg = await prisma.mailMessage.findUnique({
                        where: { externalId_accountId: { externalId: messageExternalId, accountId: account.id } }
                    });

                    if (!msg) continue;

                    const existing = await prisma.mailAttachment.findFirst({
                        where: { messageId: msg.id, fileName: att.filename }
                    });

                    if (!existing) {
                        await prisma.mailAttachment.create({
                            data: {
                                id: `att_draft_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                                messageId: msg.id,
                                tenantId: tenantId,
                                fileName: att.filename || 'attachment',
                                mimeType: att.contentType || 'application/octet-stream',
                                size: att.size || 0,
                                storageKey: att.url.split('/').pop() || '',
                                downloadUrl: att.url
                            }
                        });
                    }
                }
            }
        } catch (err: any) {
            syncLogger.error(`[MailService] Failed to save draft to local DB: ${err.message}`);
        }

        return result;
    }

    /**
     * Send a draft
     */
    static async sendDraft(userId: string, tenantId: string, email: string, draftId: string) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        await provider.sendDraft(accessToken, draftId);
    }

    /**
     * Mark a thread as read
     */
    static async markThreadAsRead(userId: string, tenantId: string, email: string, threadId: string) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        // 1. Update Local DB first
        await prisma.mailThread.update({
            where: { id: threadId },
            data: { isRead: true } as any
        });

        // Also update all messages in the thread
        await prisma.mailMessage.updateMany({
            where: { threadId, accountId: account.id },
            data: { isRead: true } as any
        });

        // 2. Update Provider
        await provider.markAsRead(accessToken, threadId);
    }

    private static async getAccount(userId: string, tenantId: string, email: string): Promise<MailAccount> {
        const account = await prisma.mailAccount.findFirst({
            where: { userId, tenantId, email }
        });

        if (!account) {
            throw new Error(`Mail account ${email} not found for user ${userId}`);
        }

        return account;
    }

    /**
     * Automatically clean trash older than 30 days
     */
    static async cleanOldTrash() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const oldThreads = await prisma.mailThread.findMany({
            where: {
                labels: { has: 'TRASH' },
                updatedAt: { lte: thirtyDaysAgo }
            },
            include: { account: true }
        });

        for (const thread of oldThreads) {
            try {
                const accessToken = await UnifiedAuthService.getValidAccessToken(thread.account.userId, thread.account.provider as any);
                const provider = MailProviderFactory.getProvider(thread.account.provider);

                await provider.deleteThread(accessToken, thread.id);

                await prisma.mailMessage.deleteMany({ where: { threadId: thread.id } });
                await prisma.mailThread.delete({ where: { id: thread.id } });

                syncLogger.info(`[MailService] Auto-deleted old trash thread: ${thread.id}`);
            } catch (err: any) {
                syncLogger.error(`[MailService] Failed to auto-delete old trash thread ${thread.id}: ${err.message}`);
            }
        }
    }

    /**
     * Upload an attachment to R2
     */
    static async uploadAttachment(tenantId: string, base64File: string, fileName: string) {
        try {
            let fileToUpload = base64File;

            // Ensure we have the data URL prefix required by r2Client.ts
            // r2Client expects: /^data:([^;]+);base64,(.+)$/
            if (!fileToUpload.startsWith('data:')) {
                console.log(`[MailService] Uploading file ${fileName} missing data: prefix. Attempting to determine type...`);
                // If it's raw base64, we need to guess the content type if possible, or use a default
                const extension = fileName.split('.').pop()?.toLowerCase();
                const mimeMap: Record<string, string> = {
                    'pdf': 'application/pdf',
                    'png': 'image/png',
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg',
                    'gif': 'image/gif',
                    'txt': 'text/plain',
                    'csv': 'text/csv',
                    'doc': 'application/msword',
                    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'xls': 'application/vnd.ms-excel',
                    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                };
                const contentType = mimeMap[extension || ''] || 'application/octet-stream';
                fileToUpload = `data:${contentType};base64,${fileToUpload}`;
            }

            const r2Result = await uploadFileToR2(
                fileToUpload,
                fileName,
                tenantId,
                'mail_uploads'
            );

            return {
                filename: fileName,
                contentType: r2Result.fileType,
                size: r2Result.fileSize,
                url: r2Result.fileUrl
            };
        } catch (error: any) {
            syncLogger.error(`[MailService] Failed to upload attachment ${fileName}: ${error.message}`);
            throw error;
        }
    }

    static async archiveThread(userId: string, tenantId: string, email: string, threadId: string) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        // 1. Update local DB: remove current labels, add ARCHIVE (Immediate UI feedback)
        await prisma.mailThread.update({
            where: { id: threadId },
            data: { labels: { set: ['ARCHIVE'] } }
        });

        await prisma.mailMessage.updateMany({
            where: { threadId: threadId },
            data: { labels: { set: ['ARCHIVE'] } }
        });

        // 2. Update Provider
        await provider.archiveThread(accessToken, threadId);
    }

    /**
     * Archive multiple threads
     */
    static async bulkArchiveThreads(userId: string, tenantId: string, email: string, threadIds: string[]) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        // 1. Update local DB (Immediate UI feedback)
        await prisma.mailThread.updateMany({
            where: { id: { in: threadIds }, accountId: account.id },
            data: { labels: { set: ['ARCHIVE'] } }
        });

        await prisma.mailMessage.updateMany({
            where: { threadId: { in: threadIds }, accountId: account.id },
            data: { labels: { set: ['ARCHIVE'] } }
        });

        // 2. Parallelize provider operations
        await Promise.all(threadIds.map(id => provider.archiveThread(accessToken, id)));
    }

    /**
     * Restore multiple threads from trash
     */
    static async bulkRestoreThreads(userId: string, tenantId: string, email: string, threadIds: string[]) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        // 1. Update local DB (Immediate UI feedback)
        // We'll restore to INBOX for simplicity in bulk
        await prisma.mailThread.updateMany({
            where: { id: { in: threadIds }, accountId: account.id },
            data: { labels: { set: ['INBOX'] } }
        });

        await prisma.mailMessage.updateMany({
            where: { threadId: { in: threadIds }, accountId: account.id },
            data: { labels: { set: ['INBOX'] } }
        });

        // 2. Perform provider operations
        if ((provider as any).bulkRestoreThreads) {
            // Priority is a dedicated bulkRestore
            await (provider as any).bulkRestoreThreads(accessToken, threadIds);
        } else if (provider.bulkMoveThreads) {
            const folderMap = await (provider as any).getFolderMap(accessToken, (provider as any).accountIdCache || "");
            const inboxId = Object.keys(folderMap).find(id => folderMap[id] === 'INBOX') || '1';
            await provider.bulkMoveThreads(accessToken, threadIds, inboxId);
        } else {
            await Promise.all(threadIds.map(id => provider.restoreThread(accessToken, id)));
        }
    }

    /**
     * Permanently delete multiple threads
     */
    static async bulkDestroyThreads(userId: string, tenantId: string, email: string, threadIds: string[]) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        // 1. Delete from local DB first (Immediate UI feedback)
        await prisma.mailMessage.deleteMany({
            where: { threadId: { in: threadIds }, accountId: account.id }
        });

        await prisma.mailThread.deleteMany({
            where: { id: { in: threadIds }, accountId: account.id }
        });

        // 2. Perform provider delete operations
        if (provider.bulkDeleteThreads) {
            await provider.bulkDeleteThreads(accessToken, threadIds);
        } else {
            // Parallelizing is fine if we chunk it, but let's try to be efficient
            // Move to trash first or just delete in parallel
            await Promise.all(threadIds.map(id => provider.deleteThread(accessToken, id)));
        }
    }
}
