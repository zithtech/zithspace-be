import axios from "axios";
import FormData from "form-data";
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

    private getMimeType(filename: string): string {
        const ext = filename.split('.').pop()?.toLowerCase();
        const mimeMap: { [key: string]: string } = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'zip': 'application/zip',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'txt': 'text/plain',
            'html': 'text/html',
            'json': 'application/json',
            'xml': 'application/xml',
            'csv': 'text/csv'
        };
        return ext ? (mimeMap[ext] || 'application/octet-stream') : 'application/octet-stream';
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
                // Map common Zoho folder names to our internal labels
                if (name === 'SENT' || name === 'SENT MESSAGES' || name === 'SENT ITEMS' || name.includes('SENT')) name = 'SENT';
                if (name === 'DRAFT' || name === 'DRAFTS' || name === 'DRAFT MESSAGES' || name.includes('DRAFT')) name = 'DRAFTS';
                if (name === 'TRASH' || name === 'DELETED' || name === 'DELETED ITEMS' || name.includes('TRASH')) name = 'TRASH';
                if (name === 'SPAM' || name === 'JUNK' || name === 'JUNK EMAIL') name = 'SPAM';
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


    async getThreads(accessToken: string, cursor?: string, lastSyncedAt?: Date): Promise<{ threads: MailThreadData[], nextCursor?: string }> {
        // Clear cache on full sync (reconnection)
        if (!cursor && !lastSyncedAt) {
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

            // Incremental sync usually only needs to check primary folders
            let folderIds: (string | null)[] = [inboxId, sentId, draftId];

            // Parallelize fetching across primary folders
            const folderRequests = folderIds.filter(fId => !!fId).map(async (fId) => {
                const params: any = {
                    status: "all",
                    limit: 50, // Fetch more in one go for efficiency
                    start: cursor ? parseInt(cursor) : 1
                };

                if (fId && fId !== 'all') {
                    params.folderId = fId;
                }

                const url = `${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/view`;
                const response = await axios.get(url, {
                    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                    params
                });

                return (response.data.data || []).map((msg: any) => ({
                    id: `${msg.messageId}|${msg.folderId || fId}`,
                    subject: this.decodeHtml(msg.subject) || "No Subject",
                    lastMessageAt: new Date(parseInt(msg.receivedTime)),
                    messageCount: 1,
                    snippet: this.stripHtml(this.decodeHtml(msg.summary || "")),
                    labels: (msg.folderId || fId) && folderMap[msg.folderId || fId] ? [folderMap[msg.folderId || fId]] : ["INBOX"],
                    participants: {
                        from: this.decodeHtml(msg.sender || msg.fromAddress),
                        to: msg.toAddress ? [this.decodeHtml(msg.toAddress)] : []
                    },
                    hasAttachments: msg.hasAttachment === "1" || msg.hasAttachment === true || msg.hasAttachment === 1,
                    isRead: msg.status === "1"
                }));
            });

            const results = await Promise.all(folderRequests);
            let allThreads: MailThreadData[] = results.flat();

            // Filter locally if lastSyncedAt is provided
            if (lastSyncedAt && !cursor) {
                const bufferTime = new Date(lastSyncedAt.getTime() - 5 * 60 * 1000);
                allThreads = allThreads.filter(t => t.lastMessageAt > bufferTime);
            }

            // Deduplicate by plain messageId first.
            // Zoho returns sent messages in BOTH the SENT folder and the INBOX folder
            // (as two different compound IDs like '123|sentFolderId' and '123|inboxFolderId').
            // We must collapse them into ONE canonical record to avoid two DB rows for
            // the same message. Priority order: SENT > INBOX > DRAFTS so the record
            // that survives carries the most descriptive label.
            const byMessageId = new Map<string, MailThreadData>();
            const labelPriority: Record<string, number> = { SENT: 3, INBOX: 2, DRAFTS: 1 };

            for (const t of allThreads) {
                const [plainMsgId] = t.id.split('|');
                const existing = byMessageId.get(plainMsgId);
                if (!existing) {
                    byMessageId.set(plainMsgId, t);
                } else {
                    // Merge labels
                    existing.labels = Array.from(new Set([...existing.labels, ...t.labels]));
                    // Keep the entry whose primary label has higher priority
                    const existingPriority = Math.max(...existing.labels.map(l => labelPriority[l] || 0));
                    const incomingPriority = Math.max(...t.labels.map(l => labelPriority[l] || 0));
                    if (incomingPriority > existingPriority) {
                        // Replace with higher-priority entry but keep merged labels
                        const mergedLabels = existing.labels;
                        byMessageId.set(plainMsgId, { ...t, labels: mergedLabels });
                    }
                    if (t.lastMessageAt > existing.lastMessageAt) {
                        existing.lastMessageAt = t.lastMessageAt;
                        existing.snippet = t.snippet;
                    }
                }
            }

            return {
                threads: Array.from(byMessageId.values()),
                nextCursor: undefined
            };
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
            const is404 = err.response?.status === 404 || err.message?.includes('404');
            if (is404) {
                console.warn(`[ZohoMailProvider] Message metadata ${messageId} not found (404), skipping.`);
                return []; 
            }
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
            const is404 = err.response?.status === 404 || err.message?.includes('404');
            if (is404) {
                console.warn(`[ZohoMailProvider] Message content ${messageId} not found (404), skipping.`);
                return []; // Return empty list to skip this missing message
            }
            console.error(`[ZohoMailProvider] Failed to fetch message content for ${messageId}: ${err.message}`);
            // If we have no content and it's not a 404, we still can't sync this message
            if (!infoData.subject) throw err;
        }

        // Combine data
        const attachments = [];
        // Zoho's API is inconsistent. Try all known attachment-carrying properties.
        let rawAttachments = contentData.attachments ||
            infoData.attachments ||
            contentData.attachmentData ||
            infoData.attachmentData ||
            contentData.attachmentList ||
            infoData.attachmentList ||
            [];

        const hasAttachmentFlag = infoData.hasAttachment === "true" ||
            infoData.hasAttachment === true ||
            infoData.hasAttachment === "1" ||
            infoData.hasAttachment === 1 ||
            contentData.hasAttachment === "true" ||
            contentData.hasAttachment === true ||
            contentData.hasAttachment === "1" ||
            contentData.hasAttachment === 1 ||
            (infoData.attachmentCount && parseInt(infoData.attachmentCount) > 0);

        console.log(`[ZohoMailProvider] Message ${messageId} discovery: hasAttachmentFlag=${hasAttachmentFlag}, rawAttachmentsCount=${rawAttachments.length}`);

        // Fallback: If hasAttachment is signaled but the list is empty, fetch it explicitly
        if (hasAttachmentFlag && rawAttachments.length === 0) {
            const attachListUrl = folderId
                ? `${this.ZOHO_MAIL_API}/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachmentinfo`
                : `${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/${messageId}/attachmentinfo`;

            try {
                console.log(`[ZohoMailProvider] Triggering fallback attachment list fetch for ${messageId} from ${attachListUrl}`);
                const attachListRes = await axios.get(attachListUrl, {
                    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                });

                // Zoho responses are often wrapped in { data: [...] } or { data: { attachments: [...] } }
                // or sometimes keys like 'attachments' or 'attachmentList'
                const resData = attachListRes.data;
                rawAttachments = resData.data || resData.attachments || resData.attachmentList || [];

                // Handle nesting: check for 'attachments' or 'data' or 'attachmentList' inside the data object
                if (typeof rawAttachments === 'object' && !Array.isArray(rawAttachments)) {
                    const nested = rawAttachments;
                    rawAttachments = nested.attachments || nested.data || nested.attachmentList || [];
                }

                console.log(`[ZohoMailProvider] Fallback fetch for ${messageId} Keys=[${Object.keys(resData)}], found ${Array.isArray(rawAttachments) ? rawAttachments.length : 'non-array'} attachments`);

                if (!Array.isArray(rawAttachments)) {
                    console.warn(`[ZohoMailProvider] Fallback fetch didn't return an array:`, JSON.stringify(rawAttachments));
                    rawAttachments = [];
                }
            } catch (err: any) {
                console.warn(`[ZohoMailProvider] Fallback attachment fetch failed: ${err.message}`);
            }
        }

        if (rawAttachments.length > 0) {
            for (const attr of rawAttachments) {
                const attrUrl = folderId
                    ? `${this.ZOHO_MAIL_API}/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachments/${attr.attachmentId}`
                    : `${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/${messageId}/attachments/${attr.attachmentId}`;

                console.log(`[ZohoMailProvider] Fetching attachment ${attr.attachmentId} (${attr.attachmentName}) from ${attrUrl}`);
                try {
                    const attrRes = await axios.get(attrUrl, {
                        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                        responseType: 'arraybuffer'
                    });

                    attachments.push({
                        filename: attr.attachmentName,
                        content: Buffer.from(attrRes.data),
                        contentType: attr.contentType || this.getMimeType(attr.attachmentName),
                        size: parseInt(attr.attachmentSize)
                    });
                    console.log(`[ZohoMailProvider] Successfully fetched attachment ${attr.attachmentName}`);
                } catch (err: any) {
                    console.error(`[ZohoMailProvider] Failed to fetch attachment ${attr.attachmentId}: ${err.message}`);
                }
            }
        }

        const subject = this.decodeHtml(infoData.subject || contentData.subject) || "No Subject";
        const fromAddress = this.decodeHtml(infoData.fromAddress || contentData.fromAddress) || "unknown@zoho.com";
        const receivedTime = infoData.receivedTime || contentData.receivedTime;

        return [{
            // Use the plain messageId as msg.id — MailService.syncMail normalises
            // all IDs to plain form, so compound variants (from previous buggy syncs)
            // are found and migrated on the next sync pass.
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
            hasAttachments: attachments.length > 0 || hasAttachmentFlag,
            attachments: attachments.length > 0 ? attachments : undefined,
            isRead: infoData.status === "0" || contentData.status === "0",
            snippet: this.stripHtml(this.decodeHtml(infoData.summary || contentData.summary || (contentData.content ? contentData.content.substring(0, 200) : ""))),
            labels: folderId && (await this.getFolderMap(accessToken, accountId))[folderId]
                ? [(await this.getFolderMap(accessToken, accountId))[folderId]]
                : []
        }];
    }

    private async uploadAttachmentToZoho(accessToken: string, accountId: string, attachment: any): Promise<{storeName: string, attachmentName: string, attachmentPath: string}> {
        const url = `${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/attachments?uploadType=multipart`;
        
        const form = new FormData();
        
        form.append('attach', attachment.content instanceof Buffer ? attachment.content : Buffer.from(attachment.content), {
            filename: attachment.filename,
            contentType: attachment.contentType
        });

        try {
            const response = await axios.post(url, form, {
                headers: {
                    "Authorization": `Zoho-oauthtoken ${accessToken}`,
                    ...form.getHeaders()
                }
            });

            console.log(`[ZohoMailProvider] Upload Response for ${attachment.filename}:`, JSON.stringify(response.data));

            if (!response.data || !response.data.data || !response.data.data[0]) {
                console.error("[ZohoMailProvider] Invalid response from Zoho attachment upload:", JSON.stringify(response.data));
                throw new Error(`Failed to upload attachment to Zoho: ${JSON.stringify(response.data)}`);
            }

            // Zoho returns storeName, attachmentName, and attachmentPath
            const attachmentData = response.data.data[0];
            
            if (!attachmentData.storeName || !attachmentData.attachmentName || !attachmentData.attachmentPath) {
                console.error("[ZohoMailProvider] Incomplete attachment data in response:", JSON.stringify(response.data));
                throw new Error(`Incomplete attachment data in Zoho response`);
            }

            return {
                storeName: attachmentData.storeName,
                attachmentName: attachmentData.attachmentName,
                attachmentPath: attachmentData.attachmentPath
            };
        } catch (error: any) {
            console.error(`[ZohoMailProvider] Upload error for ${attachment.filename}:`, {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                headers: error.response?.headers,
                url: url
            });
            throw error;
        }
    }

    async sendMessage(accessToken: string, mailData: Partial<MailMessageData>): Promise<{ messageId: string, threadId?: string } | void> {
        const accountId = await this.getZohoAccountId(accessToken);

        let content = mailData.htmlBody || mailData.body || "";
        const uploadedAttachments: Array<{storeName: string, attachmentName: string, attachmentPath: string}> = [];

        if (mailData.attachments && mailData.attachments.length > 0) {
            for (const att of mailData.attachments) {
                if (att.content) {
                    try {
                        const uploadedAtt = await this.uploadAttachmentToZoho(accessToken, accountId, att);
                        uploadedAttachments.push(uploadedAtt);
                    } catch (err: any) {
                        console.error(`[ZohoMailProvider] Failed to upload attachment ${att.filename} to Zoho:`, err.message);
                    }
                }
            }
        }

        const payload: any = {
            fromAddress: mailData.from,
            toAddress: mailData.to?.join(","),
            ccAddress: mailData.cc?.join(","),
            bccAddress: mailData.bcc?.join(","),
            subject: mailData.subject,
            content: content
        };

        if (uploadedAttachments.length > 0) {
            payload.attachments = uploadedAttachments.map(att => ({ 
                storeName: att.storeName,
                attachmentName: att.attachmentName,
                attachmentPath: att.attachmentPath
            }));
        }

        const response = await axios.post(`${this.ZOHO_MAIL_API}/accounts/${accountId}/messages`, payload, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        });

        const returnedMessageId: string = response.data.data.messageId;
        const returnedFolderId: string = response.data.data.folderId;

        // Zoho thread IDs in getThreads are formatted as `messageId|folderId`.
        // We must return the same compound format so the local thread we create
        // has the same ID that getThreads will use — avoiding duplicate threads on sync.
        const compoundThreadId = returnedFolderId
            ? `${returnedMessageId}|${returnedFolderId}`
            : returnedMessageId;

        return {
            // Return plain messageId — MailService upserts the optimistic copy using
            // this as external_id. getMessages() also returns plain messageId, so
            // syncMail's findUnique(external_id = msg.id) always finds the optimistic
            // copy on the first lookup without needing a compound-ID fallback.
            messageId: returnedMessageId,
            threadId: compoundThreadId
        };
    }

    async saveDraft(accessToken: string, draftData: Partial<MailMessageData>): Promise<{ id: string, messageId?: string, threadId?: string }> {
        const accountId = await this.getZohoAccountId(accessToken);
        const payload: any = {
            fromAddress: draftData.from,
            subject: draftData.subject,
            content: draftData.body,
            mode: "draft"
        };

        if (draftData.to && Array.isArray(draftData.to) && draftData.to.length > 0) {
            payload.toAddress = draftData.to.join(",");
        }
        if (draftData.cc && Array.isArray(draftData.cc) && draftData.cc.length > 0) {
            payload.ccAddress = draftData.cc.join(",");
        }
        if (draftData.bcc && Array.isArray(draftData.bcc) && draftData.bcc.length > 0) {
            payload.bccAddress = draftData.bcc.join(",");
        }

        try {
            const response = await axios.post(`${this.ZOHO_MAIL_API}/accounts/${accountId}/messages`, payload, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
            });

            const folderMap = await this.getFolderMap(accessToken, accountId);
            const draftFolderId = Object.keys(folderMap).find(id => folderMap[id] === 'DRAFTS') || '2';
            const messageId = response.data.data.messageId;

            return {
                id: messageId,
                messageId: messageId,
                threadId: messageId // Fallback to messageId for new drafts; sync will resolve real threadId
            };
        } catch (error: any) {
            if (error.response) {
                console.error("[ZohoMailProvider] saveDraft API Error Response:", JSON.stringify(error.response.data));
            }
            throw error;
        }
    }

    async updateDraft(accessToken: string, draftId: string, draftData: Partial<MailMessageData>): Promise<{ id: string, messageId?: string, threadId?: string } | void> {
        // Zoho's India DC (mail.zoho.in) and some other regions do not support direct PUT/POST updates to draft content.
        // The most reliable way to "update" a draft is to save it as a new draft and delete the old one.
        
        // 1. Save new draft
        const newDraft = await this.saveDraft(accessToken, draftData);

        // 2. Delete old draft (silently if it fails, as the new one is already saved)
        try {
            await this.deleteMessage(accessToken, draftId);
        } catch (error: any) {
            console.warn(`[ZohoMailProvider] Failed to delete old draft ${draftId} during update: ${error.message}`);
        }

        // 3. Return new draft info so the caller can update local DB
        return newDraft;
    }

    async sendDraft(accessToken: string, draftId: string): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        // Normalize: Zoho API usually needs just the messageId
        const [messageId] = draftId.split('|');

        try {
            await axios.post(`${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/${messageId}`, {}, {
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
            destfolderId: destFolderId // Confirming this matches Zoho's required camelCase or lowercase
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
        const [messageId] = threadId.split('|');

        try {
            // First, try to get the message to find its current folderId
            const metaUrl = `${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/${messageId}`;
            const metaResponse = await axios.get(metaUrl, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
            });

            const folderId = metaResponse.data.data?.folderId;
            if (!folderId) {
                throw new Error("Could not determine current folder for message");
            }

            const url = `${this.ZOHO_MAIL_API}/accounts/${accountId}/folders/${folderId}/messages/${messageId}`;
            await axios.delete(url, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                params: { expunge: "true" }
            });
        } catch (error: any) {
            const [, providedFolderId] = threadId.split('|');
            if (providedFolderId) {
                const url = `${this.ZOHO_MAIL_API}/accounts/${accountId}/folders/${providedFolderId}/messages/${messageId}`;
                await axios.delete(url, {
                    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                    params: { expunge: "true" }
                });
            }
        }
    }

    async trashThread(accessToken: string, threadId: string): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const folderMap = await this.getFolderMap(accessToken, accountId);
        const trashId = Object.keys(folderMap).find(id => folderMap[id] === 'TRASH' || folderMap[id] === 'DELETED') || '2';

        await this.moveThread(accessToken, threadId, trashId);
    }

    async bulkMoveThreads(accessToken: string, threadIds: string[], destFolderId: string): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const messageIds = threadIds.map(id => id.split('|')[0]);

        await axios.put(`${this.ZOHO_MAIL_API}/accounts/${accountId}/updatemessage`, {
            mode: "moveMessage",
            messageId: messageIds,
            destfolderId: destFolderId
        }, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        });
    }

    async bulkTrashThreads(accessToken: string, threadIds: string[]): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const folderMap = await this.getFolderMap(accessToken, accountId);
        const trashId = Object.keys(folderMap).find(id => folderMap[id] === 'TRASH' || folderMap[id] === 'DELETED') || '2';

        await this.bulkMoveThreads(accessToken, threadIds, trashId);
    }

    async bulkDeleteThreads(accessToken: string, threadIds: string[]): Promise<void> {
        // Parallelizing is fine if we chunk it, but let's try to be efficient
        // Zoho's updatemessage might not have a direct 'delete', so we'll do individual deletes in parallel with chunking
        const chunkSize = 5;
        for (let i = 0; i < threadIds.length; i += chunkSize) {
            const chunk = threadIds.slice(i, i + chunkSize);
            await Promise.all(chunk.map(id => this.deleteThread(accessToken, id)));
        }
    }

    async bulkRestoreThreads(accessToken: string, threadIds: string[]): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const folderMap = await this.getFolderMap(accessToken, accountId);
        const inboxId = Object.keys(folderMap).find(id => folderMap[id] === 'INBOX') || '1';

        await this.bulkMoveThreads(accessToken, threadIds, inboxId);
    }

    async deleteMessage(accessToken: string, messageId: string): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const [pureMessageId, folderIdFromId] = messageId.split('|');

        let folderId = folderIdFromId;
        if (!folderId) {
            // Fallback to searching folders if we don't have the folderId
            const metaUrl = `${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/${pureMessageId}`;
            const metaResponse = await axios.get(metaUrl, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
            });
            folderId = metaResponse.data.data?.folderId;
        }

        if (!folderId) throw new Error("Could not find message folder");

        await axios.delete(`${this.ZOHO_MAIL_API}/accounts/${accountId}/folders/${folderId}/messages/${pureMessageId}`, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            params: { expunge: "true" }
        });
    }

    async trashMessage(accessToken: string, messageId: string): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const folderMap = await this.getFolderMap(accessToken, accountId);
        const trashId = Object.keys(folderMap).find(id => folderMap[id] === 'TRASH' || folderMap[id] === 'DELETED') || '2';

        await axios.put(`${this.ZOHO_MAIL_API}/accounts/${accountId}/updatemessage`, {
            mode: "moveMessage",
            messageId: [messageId],
            destfolderId: trashId
        }, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        });
    }
    async emptyTrash(accessToken: string): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const folderMap = await this.getFolderMap(accessToken, accountId);
        const trashId = Object.keys(folderMap).find(id => folderMap[id] === 'TRASH' || folderMap[id] === 'DELETED');

        if (!trashId) return;

        // Fetch messages in trash (first 100)
        const viewUrl = `${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/view`;
        const response = await axios.get(viewUrl, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            params: { folderId: trashId, limit: 100, status: "all" }
        });

        const messages = response.data.data || [];
        if (messages.length === 0) return;

        // Delete individually to ensure success, but in parallel to be efficient
        const deletePromises = messages.map((m: any) => {
            const url = `${this.ZOHO_MAIL_API}/accounts/${accountId}/folders/${trashId}/messages/${m.messageId}`;
            return axios.delete(url, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                params: { expunge: "true" }
            }).catch(err => {
                console.error(`Failed to delete message ${m.messageId} from trash:`, err.message);
            });
        });

        await Promise.all(deletePromises);
    }

    async markAsRead(accessToken: string, threadId: string): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const [messageId] = threadId.split('|');
        const url = `${this.ZOHO_MAIL_API}/accounts/${accountId}/messages/${messageId}`;
        try {
            await axios.put(url, { status: "0" }, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
            });
        } catch (error: any) {
            console.error(`[ZohoMailProvider] Failed to mark message ${messageId} as read:`, error.message);
        }
    }

    async archiveThread(accessToken: string, threadId: string): Promise<void> {
        const accountId = await this.getZohoAccountId(accessToken);
        const folderMap = await this.getFolderMap(accessToken, accountId);
        const archiveId = Object.keys(folderMap).find(id => folderMap[id] === 'ARCHIVE') || 'archive'; // Fallback to 'archive' if name is literally that
        await this.moveThread(accessToken, threadId, archiveId);
    }
}
