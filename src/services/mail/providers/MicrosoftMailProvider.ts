import axios from "axios";
import { IMailProvider, MailThreadData, MailMessageData } from "../IMailProvider";

export class MicrosoftMailProvider implements IMailProvider {
    private readonly MS_GRAPH_BASE = "https://graph.microsoft.com/v1.0/me";
    private folderMapCache: { [id: string]: string } | null = null;

    private decodeHtml(str: string): string {
        if (!str) return str;
        return str
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ');
    }

    private stripHtml(html: string): string {
        if (!html) return html;
        return html.replace(/<[^>]*>?/gm, '').trim();
    }

    private async getFolderMap(accessToken: string): Promise<{ [id: string]: string }> {
        if (this.folderMapCache) return this.folderMapCache;
        const response = await axios.get(`${this.MS_GRAPH_BASE}/mailFolders`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const folderMap: { [id: string]: string } = {};
        (response.data.value || []).forEach((f: any) => {
            let name = f.displayName.toUpperCase();
            if (name === 'SENT ITEMS') name = 'SENT';
            if (name === 'JUNK EMAIL') name = 'SPAM';
            if (name === 'DELETED ITEMS') name = 'TRASH';
            folderMap[f.id] = name;
        });
        this.folderMapCache = folderMap;
        return this.folderMapCache;
    }

    async getThreads(accessToken: string, cursor?: string, lastSyncedAt?: Date): Promise<{ threads: MailThreadData[], nextCursor?: string }> {
        let allMessages: any[] = [];
        let nextCursor: string | undefined;

        if (cursor) {
            // Incremental sync using skipToken
            const response = await axios.get(`${this.MS_GRAPH_BASE}/messages`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: {
                    $top: 20,
                    $orderby: "receivedDateTime desc",
                    $select: "id,conversationId,subject,receivedDateTime,bodyPreview,parentFolderId,hasAttachments",
                    $skipToken: cursor
                }
            });
            allMessages = response.data.value || [];
            nextCursor = response.data["@odata.nextLink"]?.split("skipToken=")[1];
        } else {
            const params: any = {
                $top: 20,
                $orderby: "receivedDateTime desc",
                $select: "id,conversationId,subject,receivedDateTime,bodyPreview,parentFolderId,hasAttachments"
            };

            if (lastSyncedAt) {
                // Microsoft Graph OData filter
                // Use a 5-minute buffer to catch messages that might have been indexed late
                const bufferTime = new Date(lastSyncedAt.getTime() - 5 * 60 * 1000);
                const isoDate = bufferTime.toISOString();
                params.$filter = `receivedDateTime ge ${isoDate}`;
            }

            const response = await axios.get(`${this.MS_GRAPH_BASE}/messages`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params
            });
            allMessages = response.data.value || [];
            nextCursor = response.data["@odata.nextLink"]?.split("skipToken=")[1];
        }

        const folderMap = await this.getFolderMap(accessToken);

        const threads: MailThreadData[] = allMessages.map((msg: any) => ({
            id: msg.conversationId || msg.id,
            subject: msg.subject || "No Subject",
            lastMessageAt: new Date(msg.receivedDateTime),
            messageCount: 1, // Simplified
            snippet: this.stripHtml(this.decodeHtml(msg.bodyPreview || "")),
            labels: msg.parentFolderId && folderMap[msg.parentFolderId] ? [folderMap[msg.parentFolderId]] : [],
            hasAttachments: msg.hasAttachments
        }));

        // Deduplicate threads if we got multiple messages from same conversation in the same page
        const threadMap = new Map<string, MailThreadData>();
        for (const t of threads) {
            if (threadMap.has(t.id)) {
                const existing = threadMap.get(t.id)!;
                // Merge labels
                existing.labels = Array.from(new Set([...existing.labels, ...t.labels]));
                // Keep the most recent timestamp
                if (t.lastMessageAt > existing.lastMessageAt) {
                    existing.lastMessageAt = t.lastMessageAt;
                    existing.snippet = t.snippet;
                }
            } else {
                threadMap.set(t.id, t);
            }
        }

        return {
            threads: Array.from(threadMap.values()),
            nextCursor
        };
    }

    async getMessages(accessToken: string, threadId: string): Promise<MailMessageData[]> {
        // Fetch messages in the same conversation
        const response = await axios.get(`${this.MS_GRAPH_BASE}/messages`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
                $filter: `conversationId eq '${threadId}'`,
                $expand: "attachments",
                $select: "id,conversationId,subject,from,toRecipients,body,receivedDateTime,hasAttachments,parentFolderId,attachments"
            }
        });

        const folderMap = await this.getFolderMap(accessToken);

        return await Promise.all(
            (response.data.value || []).map(async (msg: any) => {
                const attachments = [];
                if (msg.hasAttachments && msg.attachments) {
                    for (const attr of msg.attachments) {
                        if (attr["@odata.type"] === "#microsoft.graph.fileAttachment") {
                            attachments.push({
                                filename: attr.name,
                                content: Buffer.from(attr.contentBytes, 'base64'),
                                contentType: attr.contentType,
                                size: attr.size
                            });
                        }
                    }
                }

                return {
                    id: msg.id,
                    threadId: threadId,
                    subject: msg.subject,
                    from: `${msg.from?.emailAddress?.name} <${msg.from?.emailAddress?.address}>`,
                    to: msg.toRecipients?.map((r: any) => `${r.emailAddress?.name} <${r.emailAddress?.address}>`) || [],
                    body: this.stripHtml(this.decodeHtml(msg.body?.content || "")),
                    htmlBody: msg.body?.contentType === "html" ? msg.body.content : undefined,
                    receivedAt: new Date(msg.receivedDateTime),
                    hasAttachments: msg.hasAttachments,
                    attachments: attachments.length > 0 ? attachments : undefined,
                    labels: msg.parentFolderId && folderMap[msg.parentFolderId] ? [folderMap[msg.parentFolderId]] : []
                };
            })
        );
    }

    async sendMessage(accessToken: string, mailData: Partial<MailMessageData>): Promise<{ messageId: string, threadId?: string } | void> {
        // Step 1: Create message in Drafts to get a real messageId & conversationId
        const createPayload: any = {
            subject: mailData.subject,
            body: {
                contentType: "html",
                content: mailData.body
            },
            toRecipients: mailData.to?.map(email => ({
                emailAddress: { address: email }
            })),
            ccRecipients: mailData.cc?.map(email => ({
                emailAddress: { address: email }
            })),
            bccRecipients: mailData.bcc?.map(email => ({
                emailAddress: { address: email }
            }))
        };

        const createResponse = await axios.post(`${this.MS_GRAPH_BASE}/messages`, createPayload, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const messageId: string = createResponse.data.id;
        const conversationId: string | undefined = createResponse.data.conversationId;

        // Step 2: Send the created message
        await axios.post(`${this.MS_GRAPH_BASE}/messages/${messageId}/send`, null, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        return { messageId, threadId: conversationId };
    }

    async saveDraft(accessToken: string, draftData: Partial<MailMessageData>): Promise<{ id: string, messageId?: string, threadId?: string }> {
        const payload = {
            subject: draftData.subject,
            body: {
                contentType: "html",
                content: draftData.body
            },
            toRecipients: draftData.to?.map(email => ({
                emailAddress: { address: email }
            })),
            ccRecipients: draftData.cc?.map(email => ({
                emailAddress: { address: email }
            })),
            bccRecipients: draftData.bcc?.map(email => ({
                emailAddress: { address: email }
            }))
        };

        const response = await axios.post(`${this.MS_GRAPH_BASE}/messages`, payload, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        return {
            id: response.data.id,
            messageId: response.data.id,
            threadId: response.data.conversationId
        };
    }

    async updateDraft(accessToken: string, draftId: string, draftData: Partial<MailMessageData>): Promise<void> {
        const payload = {
            subject: draftData.subject,
            body: {
                contentType: "html",
                content: draftData.body
            },
            toRecipients: draftData.to?.map(email => ({
                emailAddress: { address: email }
            })),
            ccRecipients: draftData.cc?.map(email => ({
                emailAddress: { address: email }
            })),
            bccRecipients: draftData.bcc?.map(email => ({
                emailAddress: { address: email }
            }))
        };

        await axios.patch(`${this.MS_GRAPH_BASE}/messages/${draftId}`, payload, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    async sendDraft(accessToken: string, draftId: string): Promise<void> {
        await axios.post(`${this.MS_GRAPH_BASE}/messages/${draftId}/send`, null, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    async trashThread(accessToken: string, threadId: string): Promise<void> {
        const messages = await this.getMessages(accessToken, threadId);
        await Promise.all(messages.map(msg => this.trashMessage(accessToken, msg.id)));
    }

    async trashMessage(accessToken: string, messageId: string): Promise<void> {
        const folderMap = await this.getFolderMap(accessToken);
        const trashId = Object.keys(folderMap).find(id => folderMap[id] === 'TRASH') || 'deleteditems';

        await axios.post(`${this.MS_GRAPH_BASE}/messages/${messageId}/move`, {
            destinationId: trashId
        }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    async deleteThread(accessToken: string, threadId: string): Promise<void> {
        const messages = await this.getMessages(accessToken, threadId);
        await Promise.all(messages.map(msg => this.deleteMessage(accessToken, msg.id)));
    }

    async deleteMessage(accessToken: string, messageId: string): Promise<void> {
        await axios.delete(`${this.MS_GRAPH_BASE}/messages/${messageId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    async moveThread(accessToken: string, threadId: string, destFolderId: string): Promise<void> {
        const messages = await this.getMessages(accessToken, threadId);
        for (const msg of messages) {
            await axios.post(`${this.MS_GRAPH_BASE}/messages/${msg.id}/move`, {
                destinationId: destFolderId
            }, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
        }
    }

    async restoreThread(accessToken: string, threadId: string, destFolderId?: string): Promise<void> {
        const folderMap = await this.getFolderMap(accessToken);
        const targetFolderId = destFolderId || Object.keys(folderMap).find(id => folderMap[id] === 'INBOX') || 'inbox';
        await this.moveThread(accessToken, threadId, targetFolderId);
    }

    async emptyTrash(accessToken: string): Promise<void> {
        const folderMap = await this.getFolderMap(accessToken);
        const trashId = Object.keys(folderMap).find(id => folderMap[id] === 'TRASH');

        if (!trashId) return;

        const response = await axios.get(`${this.MS_GRAPH_BASE}/mailFolders/${trashId}/messages`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { $top: 100, $select: "id" }
        });

        await Promise.all((response.data.value || []).map((msg: any) => this.deleteMessage(accessToken, msg.id)));
    }

    async markAsRead(accessToken: string, threadId: string): Promise<void> {
        const messages = await this.getMessages(accessToken, threadId);
        await Promise.all(messages.map(msg =>
            axios.patch(`${this.MS_GRAPH_BASE}/messages/${msg.id}`, { isRead: true }, {
                headers: { Authorization: `Bearer ${accessToken}` }
            })
        ));
    }

    async archiveThread(accessToken: string, threadId: string): Promise<void> {
        const folderMap = await this.getFolderMap(accessToken);
        const archiveId = Object.keys(folderMap).find(id => folderMap[id] === 'ARCHIVE') || 'archive';
        await this.moveThread(accessToken, threadId, archiveId);
    }
}
