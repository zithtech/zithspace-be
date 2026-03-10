import axios from "axios";
import { IMailProvider, MailThreadData, MailMessageData } from "../IMailProvider";

export class MicrosoftMailProvider implements IMailProvider {
    private readonly MS_GRAPH_BASE = "https://graph.microsoft.com/v1.0/me";
    private folderMapCache: { [id: string]: string } | null = null;

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


    async getThreads(accessToken: string, cursor?: string): Promise<{ threads: MailThreadData[], nextCursor?: string }> {
        // MS Graph doesn't have a direct "Thread" list like Gmail, but we can group by conversationId
        // or just fetch recent messages as "Threads" for simplicity in this MVP.
        const response = await axios.get(`${this.MS_GRAPH_BASE}/messages`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
                $top: 20,
                $orderby: "receivedDateTime desc",
                $select: "id,conversationId,subject,receivedDateTime,bodyPreview,parentFolderId",
                $skipToken: cursor
            }
        });

        const folderMap = await this.getFolderMap(accessToken);

        const threads: MailThreadData[] = (response.data.value || []).map((msg: any) => ({
            id: msg.conversationId || msg.id,
            subject: msg.subject || "No Subject",
            lastMessageAt: new Date(msg.receivedDateTime),
            messageCount: 1, // Simplified
            snippet: msg.bodyPreview,
            labels: msg.parentFolderId && folderMap[msg.parentFolderId] ? [folderMap[msg.parentFolderId]] : []
        }));

        return {
            threads,
            nextCursor: response.data["@odata.nextLink"]?.split("skipToken=")[1]
        };
    }

    async getMessages(accessToken: string, threadId: string): Promise<MailMessageData[]> {
        // Fetch messages in the same conversation
        const response = await axios.get(`${this.MS_GRAPH_BASE}/messages`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
                $filter: `conversationId eq '${threadId}'`,
                $expand: "attachments",
                $select: "id,conversationId,subject,from,toRecipients,body,receivedDateTime,hasAttachments,parentFolderId"
            }
        });

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
                    body: msg.body?.content || "",
                    htmlBody: msg.body?.contentType === "html" ? msg.body.content : undefined,
                    receivedAt: new Date(msg.receivedDateTime),
                    hasAttachments: msg.hasAttachments,
                    attachments: attachments.length > 0 ? attachments : undefined,
                    labels: msg.parentFolderId && (await this.getFolderMap(accessToken))[msg.parentFolderId]
                        ? [(await this.getFolderMap(accessToken))[msg.parentFolderId]]
                        : []
                };
            })
        );
    }

    async sendMessage(accessToken: string, mailData: Partial<MailMessageData>): Promise<void> {
        const payload = {
            message: {
                subject: mailData.subject,
                body: {
                    contentType: "Text",
                    content: mailData.body
                },
                toRecipients: mailData.to?.map(email => ({
                    emailAddress: { address: email }
                }))
            }
        };

        await axios.post(`${this.MS_GRAPH_BASE}/sendMail`, payload, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    async saveDraft(accessToken: string, draftData: Partial<MailMessageData>): Promise<{ id: string }> {
        const payload = {
            subject: draftData.subject,
            body: {
                contentType: "Text",
                content: draftData.body
            },
            toRecipients: draftData.to?.map(email => ({
                emailAddress: { address: email }
            }))
        };

        const response = await axios.post(`${this.MS_GRAPH_BASE}/messages`, payload, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        return { id: response.data.id };
    }

    async updateDraft(accessToken: string, draftId: string, draftData: Partial<MailMessageData>): Promise<void> {
        const payload = {
            subject: draftData.subject,
            body: {
                contentType: "Text",
                content: draftData.body
            },
            toRecipients: draftData.to?.map(email => ({
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

    async deleteThread(accessToken: string, threadId: string): Promise<void> {
        // Microsoft Graph doesn't have a direct "Delete Thread" like Gmail
        // We delete all messages in that conversation by first finding them
        const messages = await this.getMessages(accessToken, threadId);
        for (const msg of messages) {
            await this.deleteMessage(accessToken, msg.id);
        }
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
        // Move back to Inbox conceptually or to specific folder
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

        for (const msg of (response.data.value || [])) {
            await this.deleteMessage(accessToken, msg.id);
        }
    }
}
