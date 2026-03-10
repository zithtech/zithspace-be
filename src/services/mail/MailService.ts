import { prisma } from "@/config/database";
import { MailProvider, MailAccount } from "@prisma/client";
import { MailProviderFactory } from "./MailProviderFactory";
import { UnifiedAuthService } from "../UnifiedAuthService";
import { uploadFileToR2 } from "@/utils/r2Client";
import { syncLogger } from "@/utils/logger";

export class MailService {
    /**
     * Get threads for a specific mail account
     */
    static async getThreads(userId: string, tenantId: string, email: string) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        return await provider.getThreads(accessToken, account.syncCursor || undefined);
    }

    /**
     * Sync threads and messages for an account
     */
    static async syncMail(userId: string, tenantId: string, email: string) {
        syncLogger.info(`[MailService] Starting sync for ${email} (User: ${userId})`);
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        const { threads, nextCursor } = await provider.getThreads(accessToken, account.syncCursor || undefined);

        for (const threadIdData of threads) { // Renamed loop variable to avoid confusion with thread object
            await prisma.mailThread.upsert({
                where: { id: threadIdData.id },
                update: {
                    subject: threadIdData.subject,
                    lastMessageAt: threadIdData.lastMessageAt,
                    messageCount: threadIdData.messageCount,
                    labels: threadIdData.labels || [],
                    snippet: threadIdData.snippet,
                    fromAddress: threadIdData.participants?.from, // Assuming we pass this or just extract from first message
                    toEmails: threadIdData.participants?.to as any
                },
                create: {
                    id: threadIdData.id,
                    accountId: account.id,
                    tenantId: tenantId,
                    externalThreadId: threadIdData.id,
                    subject: threadIdData.subject,
                    lastMessageAt: threadIdData.lastMessageAt,
                    messageCount: threadIdData.messageCount,
                    labels: threadIdData.labels || [],
                    snippet: threadIdData.snippet,
                    fromAddress: threadIdData.participants?.from,
                    toEmails: threadIdData.participants?.to as any
                }
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
                    subject: msg.subject,
                    fromEmail: msg.from,
                    toEmails: msg.to as any, // Json field
                    ccEmails: msg.cc as any,
                    bccEmails: msg.bcc as any,
                    bodyText: msg.body,
                    bodyHtml: msg.htmlBody,
                    snippet: msg.snippet || (msg.body ? msg.body.substring(0, 200) : ""),
                    receivedAt: msg.receivedAt,
                    isRead: false,
                    isSent: isSentByMe || isSentFolder,
                    labels: msg.labels || (isSentByMe ? ["SENT"] : [])
                };

                const upsertedMessage = await prisma.mailMessage.upsert({
                    where: { externalId_accountId: { externalId: msg.id, accountId: account.id } },
                    update: {
                        bodyText: msg.body,
                        bodyHtml: msg.htmlBody,
                        subject: msg.subject,
                        fromEmail: msg.from,
                        toEmails: msg.to as any,
                        ccEmails: msg.cc as any,
                        bccEmails: msg.bcc as any,
                        snippet: msg.snippet || (msg.body ? msg.body.substring(0, 200) : ""),
                        labels: msg.labels || (isSentByMe ? ["SENT"] : [])
                    },
                    create: messageData
                });

                // Handle attachments
                if (msg.attachments && msg.attachments.length > 0) {
                    for (const attachment of msg.attachments) {
                        try {
                            // uploadFileToR2 expects (base64File, fileName, tenantId, ticketId)
                            const base64Content = `data:${attachment.contentType};base64,${(attachment.content as Buffer).toString('base64')}`;

                            const r2Result = await uploadFileToR2(
                                base64Content,
                                attachment.filename,
                                tenantId,
                                `mail_${threadIdData.id}`
                            );

                            await prisma.mailAttachment.create({
                                data: {
                                    id: `att_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                                    messageId: upsertedMessage.id,
                                    tenantId: tenantId,
                                    fileName: attachment.filename,
                                    mimeType: attachment.contentType,
                                    size: attachment.size,
                                    storageKey: r2Result.fileUrl.split('/').pop() || '',
                                    downloadUrl: r2Result.fileUrl
                                }
                            });
                        } catch (err) {
                            syncLogger.error(`[MailService] Failed to upload attachment ${attachment.filename}: ${err.message}`);
                        }
                    }
                }
            }

            // Sync thread level info from the latest message
            const latestMessage = await prisma.mailMessage.findFirst({
                where: { threadId: threadIdData.id },
                orderBy: { receivedAt: 'desc' }
            });

            if (latestMessage) {
                await prisma.mailThread.update({
                    where: { id: threadIdData.id },
                    data: {
                        fromAddress: latestMessage.fromEmail,
                        toEmails: latestMessage.toEmails as any,
                        snippet: latestMessage.snippet,
                        labels: latestMessage.labels || []
                    }
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

        // Check if thread is already in TRASH
        const thread = await prisma.mailThread.findUnique({
            where: { id: threadId },
            select: { labels: true }
        });

        const isTrashed = thread?.labels.includes('TRASH');

        if (isTrashed) {
            // Permanent delete from provider
            await provider.deleteThread(accessToken, threadId);

            // Delete from local DB
            await prisma.mailThread.delete({ where: { id: threadId } });
            // Messages and attachments will be deleted via cascade if set up, or we manually delete
            await prisma.mailMessage.deleteMany({ where: { threadId } });
            return;
        }

        // Instead of permanent delete, move to trash
        const accountId = await (provider as any).getZohoAccountId(accessToken);
        const folderMap = await (provider as any).getFolderMap(accessToken, accountId);
        const trashId = Object.keys(folderMap).find(id => folderMap[id] === 'TRASH' || folderMap[id] === 'DELETED') || '2';

        await provider.moveThread(accessToken, threadId, trashId);

        // Update local DB
        await prisma.mailThread.update({
            where: { id: threadId },
            data: { labels: ['TRASH'] }
        });

        await prisma.mailMessage.updateMany({
            where: { threadId: threadId },
            data: { labels: ['TRASH'] }
        });
    }

    /**
     * Delete multiple threads
     */
    static async deleteThreads(userId: string, tenantId: string, email: string, threadIds: string[]) {
        for (const threadId of threadIds) {
            await this.deleteThread(userId, tenantId, email, threadId);
        }
    }

    /**
     * Empty the trash folder
     */
    static async emptyTrash(userId: string, tenantId: string, email: string) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        // Tell provider to empty trash
        await provider.emptyTrash(accessToken);

        // Delete all TRASH threads from local DB
        const trashedThreads = await prisma.mailThread.findMany({
            where: { accountId: account.id, labels: { has: 'TRASH' } },
            select: { id: true }
        });

        const threadIds = trashedThreads.map(t => t.id);

        await prisma.mailThread.deleteMany({
            where: { id: { in: threadIds } }
        });

        await prisma.mailMessage.deleteMany({
            where: { threadId: { in: threadIds } }
        });
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

        // Based on the thread's last message, decide where to move it back
        // If fromAddress is the user's email, it belongs in SENT
        const fromMe = thread?.fromAddress?.toLowerCase().includes(email.toLowerCase());
        const targetLabel = fromMe ? 'SENT' : 'INBOX';

        const accountId = await (provider as any).getZohoAccountId(accessToken);
        const folderMap = await (provider as any).getFolderMap(accessToken, accountId);
        const destFolderId = Object.keys(folderMap).find(id => folderMap[id] === targetLabel);

        await provider.restoreThread(accessToken, threadId, destFolderId);

        // Update local DB: remove TRASH, add targetLabel
        await prisma.mailThread.update({
            where: { id: threadId },
            data: { labels: [targetLabel] }
        });

        await prisma.mailMessage.updateMany({
            where: { threadId: threadId },
            data: { labels: [targetLabel] }
        });
    }

    /**
     * Send an email
     */
    static async sendMessage(userId: string, tenantId: string, email: string, mailData: any) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        await provider.sendMessage(accessToken, mailData);

        // Optional: We could save the sent message to our DB here or wait for next sync
    }

    /**
     * Save a draft
     */
    static async saveDraft(userId: string, tenantId: string, email: string, draftData: any) {
        const account = await this.getAccount(userId, tenantId, email);
        const accessToken = await UnifiedAuthService.getValidAccessToken(userId, account.provider as any);
        const provider = MailProviderFactory.getProvider(account.provider);

        if (draftData.id) {
            await provider.updateDraft(accessToken, draftData.id, draftData);
            return { id: draftData.id };
        } else {
            return await provider.saveDraft(accessToken, draftData);
        }
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

                await prisma.mailThread.delete({ where: { id: thread.id } });
                await prisma.mailMessage.deleteMany({ where: { threadId: thread.id } });

                syncLogger.info(`[MailService] Auto-deleted old trash thread: ${thread.id}`);
            } catch (err: any) {
                syncLogger.error(`[MailService] Failed to auto-delete old trash thread ${thread.id}: ${err.message}`);
            }
        }
    }
}
