import axios from "axios";
import { IMailProvider, MailThreadData, MailMessageData } from "../IMailProvider";

export class ZohoMailProvider implements IMailProvider {
    private readonly ZOHO_MAIL_API = "https://mail.zoho.in/api";
    private folderMapCache: { [id: string]: string } | null = null;
    private accountIdCache: string | null = null;

    /**
     * Zoho Mail requires an accountId for most operations.
     * In handleCallback of UnifiedAuthService, we fetched the email.
     * Here we'll need to resolve the accountId first or store it.
     */
    private decodeHtml(str: string): string {
        if (!str) return str;
        return str
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'");
    }

    private stripHtml(html: string): string {
        if (!html) return html;
        // Basic regex to strip HTML tags
        return html.replace(/<[^>]*>?/gm, '');
    }

    private async getZohoAccountId(accessToken: string): Promise<string> {
        if (this.accountIdCache) return this.accountIdCache;
        const response = await axios.get(`${this.ZOHO_MAIL_API}/accounts`, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        });
        this.accountIdCache = response.data.data[0].accountId;
        return this.accountIdCache!;
    }

    private async getFolderMap(accessToken: string, accountId: string): Promise<{ [id: string]: string }> {
        if (this.folderMapCache) return this.folderMapCache;

        const defaultMap: { [id: string]: string } = {};

        try {
            const response = await axios.get(`${this.ZOHO_MAIL_API}/accounts/${accountId}/folders`, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
            });
            const folderMap: { [id: string]: string } = {};
            (response.data.data || []).forEach((f: any) => {
                let name = f.folderName.toUpperCase();
                if (name === 'SENT MESSAGES') name = 'SENT';
                if (name === 'DRAFT') name = 'DRAFTS';
                folderMap[f.folderId] = name;
            });

            // If we have actual folders from the API, we use them.
            // Only use defaultMap if we got nothing from the API.
            if (Object.keys(folderMap).length > 0) {
                this.folderMapCache = folderMap;
            } else {
                this.folderMapCache = defaultMap;
            }
        } catch (error: any) {
            console.warn(`[ZohoMailProvider] Failed to fetch folder map, using defaults: ${error.message}`);
            this.folderMapCache = defaultMap;
        }
        return this.folderMapCache;
    }


    async getThreads(accessToken: string, cursor?: string): Promise<{ threads: MailThreadData[], nextCursor?: string }> {
        // Clear cache on full sync (reconnection)
        if (!cursor) {
            this.folderMapCache = null;
            this.accountIdCache = null;
        }

        const accountId = await this.getZohoAccountId(accessToken);
        const folderMap = await this.getFolderMap(accessToken, accountId);
        try {
            const findFolder = (name: string) =>
                Object.keys(folderMap).find(id => folderMap[id] === name && id.length > 5) ||
                Object.keys(folderMap).find(id => folderMap[id] === name);

            const inboxId = findFolder('INBOX') || '1';
            const sentId = findFolder('SENT') || '3';
            const draftId = findFolder('DRAFTS') || '2';

            // Priority folders are always checked (page 1) to catch new items
            // Other folders are synced only during full scans (no cursor)
            let folderIds: (string | null)[] = [inboxId, sentId, draftId];
            if (!cursor) {
                // We can add more folders here for a full scan if needed
            }

            const allThreads: MailThreadData[] = [];
            let lastNextCursor: string | undefined;

            for (const fId of folderIds) {
                const params: any = {
                    status: "all",
                    limit: 20,
                    // Priority folders check first page to catch new items
                    start: (fId === inboxId || fId === sentId || fId === draftId) ? 1 : (cursor ? parseInt(cursor) : 1)
                };

                // Zoho API requires folderId as a query parameter for /messages/view
                if (fId && fId !== 'all') {
                    params.folderId = fId;
                }

                const url = `${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/view`;

                const response = await axios.get(url, {
                    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                    params
                });

                const threads: MailThreadData[] = (response.data.data || []).map((msg: any) => ({
                    id: `${msg.messageId}|${msg.folderId || fId || '1'}`,
                    subject: this.decodeHtml(msg.subject) || "No Subject",
                    lastMessageAt: new Date(parseInt(msg.receivedTime)),
                    messageCount: 1,
                    snippet: this.stripHtml(this.decodeHtml(msg.summary || "")),
                    labels: (msg.folderId || fId) && folderMap[msg.folderId || fId] ? [folderMap[msg.folderId || fId]] : ["INBOX"],
                    participants: {
                        from: this.decodeHtml(msg.sender || msg.fromAddress),
                        to: msg.toAddress ? [this.decodeHtml(msg.toAddress)] : []
                    }
                }));

                allThreads.push(...threads);
                if (!lastNextCursor && response.data.data?.length === 20) {
                    lastNextCursor = (cursor ? parseInt(cursor) + 20 : 21).toString();
                }
            }

            return { threads: allThreads, nextCursor: lastNextCursor };
        } catch (error: any) {
            if (error.response) {
                console.error(`[ZohoMailProvider] getThreads API Error:`, JSON.stringify(error.response.data));
            }
            throw error;
        }
    }


    async getMessages(accessToken: string, threadId: string): Promise<MailMessageData[]> {
        const accountId = await this.getZohoAccountId(accessToken);
        const [messageId, folderId] = threadId.split('|');

        // 1. Fetch Metadata (subject, from, time)
        const infoUrl = folderId
            ? `${this.ZOHO_MAIL_API}/accounts/${accountId}/folders/${folderId}/messages/${messageId}/details`
            : `${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/${messageId}/details`;

        let infoData: any = {};
        try {
            const infoResponse = await axios.get(infoUrl, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
            });
            infoData = infoResponse.data.data || {};
        } catch (err: any) {
            console.error(`[ZohoMailProvider] Failed to fetch message metadata for ${messageId}: ${err.message}`);
        }

        // 2. Fetch Content
        const contentUrl = folderId
            ? `${this.ZOHO_MAIL_API}/accounts/${accountId}/folders/${folderId}/messages/${messageId}/content`
            : `${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/${messageId}/content`;

        let contentData: any = {};
        try {
            const contentResponse = await axios.get(contentUrl, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
            });
            contentData = contentResponse.data.data || {};
        } catch (err: any) {
            console.error(`[ZohoMailProvider] Failed to fetch message content for ${messageId}: ${err.message}`);
            // If we have no content, we can't really sync this message
            if (!infoData.subject) throw err;
        }

        // Combine data
        const attachments = [];
        const rawAttachments = contentData.attachments || infoData.attachments || [];

        if (rawAttachments.length > 0) {
            for (const attr of rawAttachments) {
                const attrUrl = folderId
                    ? `${this.ZOHO_MAIL_API}/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachments/${attr.attachmentId}`
                    : `${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/${messageId}/attachments/${attr.attachmentId}`;

                try {
                    const attrRes = await axios.get(attrUrl, {
                        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                        responseType: 'arraybuffer'
                    });

                    attachments.push({
                        filename: attr.attachmentName,
                        content: Buffer.from(attrRes.data),
                        contentType: attr.contentType,
                        size: parseInt(attr.attachmentSize)
                    });
                } catch (err: any) {
                    console.error(`[ZohoMailProvider] Failed to fetch attachment ${attr.attachmentId}: ${err.message}`);
                }
            }
        }

        const subject = this.decodeHtml(infoData.subject || contentData.subject) || "No Subject";
        const fromAddress = this.decodeHtml(infoData.fromAddress || contentData.fromAddress) || "unknown@zoho.com";
        const receivedTime = infoData.receivedTime || contentData.receivedTime;

        return [{
            id: messageId,
            threadId: threadId,
            subject: subject,
            from: fromAddress,
            to: (infoData.toAddress || contentData.toAddress) ? [this.decodeHtml(infoData.toAddress || contentData.toAddress)] : [],
            cc: (infoData.ccAddress || contentData.ccAddress) ? [this.decodeHtml(infoData.ccAddress || contentData.ccAddress)] : undefined,
            bcc: (infoData.bccAddress || contentData.bccAddress) ? [this.decodeHtml(infoData.bccAddress || contentData.bccAddress)] : undefined,
            body: this.stripHtml(contentData.content || infoData.content || ""),
            htmlBody: contentData.content || infoData.content || "",
            receivedAt: receivedTime ? new Date(parseInt(receivedTime)) : new Date(),
            hasAttachments: attachments.length > 0,
            attachments: attachments.length > 0 ? attachments : undefined,
            snippet: this.stripHtml(this.decodeHtml(infoData.summary || contentData.summary || (contentData.content ? contentData.content.substring(0, 200) : ""))),
            labels: folderId && (await this.getFolderMap(accessToken, accountId))[folderId]
                ? [(await this.getFolderMap(accessToken, accountId))[folderId]]
                : []
        }];
    }

    async sendMessage(accessToken: string, mailData: Partial<MailMessageData>): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const payload = {
            fromAddress: mailData.from,
            toAddress: mailData.to?.join(","),
            subject: mailData.subject,
            content: mailData.body
        };

        await axios.post(`${this.ZOHO_MAIL_API}/accounts/${accountId}/messages`, payload, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        });
    }

    async saveDraft(accessToken: string, draftData: Partial<MailMessageData>): Promise<{ id: string }> {
        const accountId = await this.getZohoAccountId(accessToken);
        const payload = {
            fromAddress: draftData.from,
            toAddress: draftData.to?.join(","),
            subject: draftData.subject,
            content: draftData.body,
            mode: "draft"
        };

        try {
            const response = await axios.post(`${this.ZOHO_MAIL_API}/accounts/${accountId}/messages`, payload, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
            });

            // Zoho returns the messageId in the data object for the POST /messages call
            return { id: response.data.data.messageId };
        } catch (error: any) {
            if (error.response) {
                console.error("[ZohoMailProvider] saveDraft API Error Response:", JSON.stringify(error.response.data));
            }
            throw error;
        }
    }

    async updateDraft(accessToken: string, draftId: string, draftData: Partial<MailMessageData>): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const payload = {
            fromAddress: draftData.from,
            toAddress: draftData.to?.join(","),
            subject: draftData.subject,
            content: draftData.body,
            mode: "draft"
        };

        try {
            await axios.put(`${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/${draftId}`, payload, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
            });
        } catch (error: any) {
            if (error.response) {
                console.error("[ZohoMailProvider] updateDraft API Error Response:", JSON.stringify(error.response.data));
            }
            throw error;
        }
    }

    async sendDraft(accessToken: string, draftId: string): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        try {
            // Sending a draft in standard Zoho Mail API is done by POSTing to /messages/{messageId} with action=send
            await axios.post(`${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/${draftId}`, {}, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                params: { action: "send" }
            });
        } catch (error: any) {
            if (error.response) {
                console.error("[ZohoMailProvider] sendDraft API Error Response:", JSON.stringify(error.response.data));
            }
            throw error;
        }
    }

    async moveThread(accessToken: string, threadId: string, destFolderId: string): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const [messageId] = threadId.split('|');

        await axios.put(`${this.ZOHO_MAIL_API}/accounts/${accountId}/updatemessage`, {
            mode: "moveMessage",
            messageId: [messageId],
            destfolderId: destFolderId
        }, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        });
    }

    async restoreThread(accessToken: string, threadId: string, destFolderId?: string): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const folderMap = await this.getFolderMap(accessToken, accountId);
        const targetFolderId = destFolderId || Object.keys(folderMap).find(id => folderMap[id] === 'INBOX') || '1';

        await this.moveThread(accessToken, threadId, targetFolderId);
    }

    async deleteThread(accessToken: string, threadId: string): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const [messageId, folderId] = threadId.split('|');

        // Zoho's singular delete endpoint
        const url = folderId
            ? `${this.ZOHO_MAIL_API}/accounts/${accountId}/folders/${folderId}/messages/${messageId}`
            : `${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/${messageId}`;

        await axios.delete(url, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            params: { expunge: "true" }
        });
    }

    async deleteMessage(accessToken: string, messageId: string): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);

        // If messageId contains folderId, split it
        const [mid, fid] = messageId.split('|');

        const url = fid
            ? `${this.ZOHO_MAIL_API}/accounts/${accountId}/folders/${fid}/messages/${mid}`
            : `${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/${mid}`;

        await axios.delete(url, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            params: { expunge: "true" }
        });
    }

    async emptyTrash(accessToken: string): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const folderMap = await this.getFolderMap(accessToken, accountId);
        const trashId = Object.keys(folderMap).find(id => folderMap[id] === 'TRASH' || folderMap[id] === 'DELETED');

        if (!trashId) return;

        // Use the dedicated "Empty Folder" API (PUT)
        await axios.put(`${this.ZOHO_MAIL_API}/accounts/${accountId}/folders/${trashId}`, {
            mode: "emptyFolder"
        }, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        });
    }
}
