import axios from "axios";
import { IMailProvider, MailThreadData, MailMessageData } from "../IMailProvider";

export class GoogleMailProvider implements IMailProvider {
    private readonly GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

    private normalizeLabels(labelIds: string[] = []): string[] {
        const mapping: { [key: string]: string } = {
            'INBOX': 'INBOX',
            'SENT': 'SENT',
            'DRAFT': 'DRAFTS',
            'SPAM': 'SPAM',
            'TRASH': 'TRASH'
        };
        return labelIds.map(id => mapping[id] || id.toUpperCase());
    }

    async getThreads(accessToken: string, cursor?: string, lastSyncedAt?: Date): Promise<{ threads: MailThreadData[], nextCursor?: string }> {
        const params: any = {
            maxResults: 20,
            pageToken: cursor
        };

        if (lastSyncedAt && !cursor) {
            // Gmail query 'after:TIMESTAMP_IN_SECONDS'
            // Use a 5-minute buffer to ensure we don't miss messages indexed with slightly older internal dates
            const bufferTime = new Date(lastSyncedAt.getTime() - 5 * 60 * 1000);
            const seconds = Math.floor(bufferTime.getTime() / 1000);
            params.q = `after:${seconds}`;
        }

        const response = await axios.get(`${this.GMAIL_API_BASE}/threads`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params
        });

        const threads = await Promise.all(
            (response.data.threads || []).map(async (t: any) => {
                const details = await axios.get(`${this.GMAIL_API_BASE}/threads/${t.id}`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    params: { format: "metadata" }
                });

                const messages = details.data.messages || [];
                const lastMsg = messages[messages.length - 1];

                if (!lastMsg) return null;

                const headers = lastMsg.payload?.headers || [];
                const subject = headers.find((h: any) => h.name === "Subject")?.value || "No Subject";

                return {
                    id: t.id,
                    subject,
                    lastMessageAt: new Date(parseInt(lastMsg.internalDate)),
                    messageCount: messages.length,
                    snippet: t.snippet,
                    labels: this.normalizeLabels(messages[0]?.labelIds || [])
                };
            })
        );

        return {
            threads: threads.filter((t): t is MailThreadData => t !== null),
            nextCursor: response.data.nextPageToken
        };
    }

    async getMessages(accessToken: string, threadId: string): Promise<MailMessageData[]> {
        const response = await axios.get(`${this.GMAIL_API_BASE}/threads/${threadId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        return await Promise.all(
            response.data.messages.map(async (msg: any) => {
                const headers = msg.payload?.headers || [];
                const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
                const from = headers.find((h: any) => h.name === "From")?.value || "";
                const to = headers.find((h: any) => h.name === "To")?.value?.split(",") || [];

                const parts = this.flattenParts(msg.payload);
                const htmlBody = parts.find(p => p.mimeType === "text/html")?.body?.data;
                const body = parts.find(p => p.mimeType === "text/plain")?.body?.data || msg.snippet;

                // Process Attachments
                const attachments = [];
                const attachmentParts = parts.filter(p => p.filename && p.body.attachmentId);

                for (const part of attachmentParts) {
                    const attachRes = await axios.get(`${this.GMAIL_API_BASE}/messages/${msg.id}/attachments/${part.body.attachmentId}`, {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    });

                    attachments.push({
                        filename: part.filename,
                        content: Buffer.from(attachRes.data.data, 'base64'),
                        contentType: part.mimeType,
                        size: part.body.size
                    });
                }

                return {
                    id: msg.id,
                    threadId: threadId,
                    subject,
                    from,
                    to,
                    body: body ? Buffer.from(body, 'base64').toString() : "",
                    htmlBody: htmlBody ? Buffer.from(htmlBody, 'base64').toString() : undefined,
                    receivedAt: new Date(parseInt(msg.internalDate)),
                    hasAttachments: attachments.length > 0,
                    attachments: attachments.length > 0 ? attachments : undefined,
                    labels: this.normalizeLabels(msg.labelIds || [])
                };
            })
        );
    }

    async sendMessage(accessToken: string, mailData: Partial<MailMessageData>): Promise<{ messageId: string, threadId?: string } | void> {
        const raw = this.constructRawMessage(mailData);
        const encodedMail = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const response = await axios.post(`${this.GMAIL_API_BASE}/messages/send`, { raw: encodedMail }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        return { messageId: response.data.id, threadId: response.data.threadId };
    }

    async saveDraft(accessToken: string, draftData: Partial<MailMessageData>): Promise<{ id: string, messageId?: string, threadId?: string }> {
        const raw = this.constructRawMessage(draftData);
        const encodedMail = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const payload: any = {
            message: { raw: encodedMail }
        };

        if (draftData.threadId) {
            payload.message.threadId = draftData.threadId;
        }

        const response = await axios.post(`${this.GMAIL_API_BASE}/drafts`, payload, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        return {
            id: response.data.id,
            messageId: response.data.message.id,
            threadId: response.data.message.threadId
        };
    }

    async updateDraft(accessToken: string, draftId: string, draftData: Partial<MailMessageData>): Promise<void> {
        const raw = this.constructRawMessage(draftData);
        const encodedMail = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const payload: any = {
            message: { raw: encodedMail }
        };

        if (draftData.threadId) {
            payload.message.threadId = draftData.threadId;
        }

        await axios.put(`${this.GMAIL_API_BASE}/drafts/${draftId}`, payload, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    private constructRawMessage(mailData: Partial<MailMessageData>): string {
        const from = mailData.from || "";
        const to = mailData.to?.filter(Boolean).join(", ") || "";
        const cc = mailData.cc?.filter(Boolean).join(", ") || "";
        const bcc = mailData.bcc?.filter(Boolean).join(", ") || "";
        const subject = mailData.subject || "";
        const body = mailData.body || "";
        const attachments = mailData.attachments || [];

        const boundary = "__boundary_marker__" + Date.now().toString(16);

        let email = [
            `MIME-Version: 1.0`,
            `Date: ${new Date().toUTCString()}`,
            from ? `From: ${from}` : null,
            `To: ${to}`,
            cc ? `Cc: ${cc}` : null,
            bcc ? `Bcc: ${bcc}` : null,
            `Subject: ${subject}`,
        ].filter(line => line !== null).join("\r\n");

        if (attachments.length === 0) {
            email += `\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(body).toString('base64')}`;
        } else {
            email += `\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
            email += `--${boundary}\r\n`;
            email += `Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(body).toString('base64')}\r\n\r\n`;

            for (const att of attachments) {
                if (att.content) {
                    email += `--${boundary}\r\n`;
                    email += `Content-Type: ${att.contentType || "application/octet-stream"}; name="${att.filename}"\r\n`;
                    email += `Content-Description: ${att.filename}\r\n`;
                    email += `Content-Disposition: attachment; filename="${att.filename}"; size=${att.size || 0}\r\n`;
                    email += `Content-Transfer-Encoding: base64\r\n\r\n`;
                    email += (att.content instanceof Buffer ? att.content : Buffer.from(att.content)).toString('base64') + "\r\n\r\n";
                }
            }
            email += `--${boundary}--`;
        }

        return email;
    }

    async sendDraft(accessToken: string, draftId: string): Promise<void> {
        await axios.post(`${this.GMAIL_API_BASE}/drafts/send`, { id: draftId }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    private flattenParts(part: any): any[] {
        let parts: any[] = [];
        if (part.parts) {
            for (const p of part.parts) {
                parts = parts.concat(this.flattenParts(p));
            }
        } else {
            parts.push(part);
        }
        return parts;
    }

    async deleteThread(accessToken: string, threadId: string): Promise<void> {
        try {
            await axios.delete(`${this.GMAIL_API_BASE}/threads/${threadId}`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
        } catch (error: any) {
            if (error.response?.status === 403) {
                console.warn(`[GoogleMailProvider] Permanent delete forbidden for thread ${threadId} (insufficient scopes). Skipping...`);
            } else {
                throw error;
            }
        }
    }

    async trashThread(accessToken: string, threadId: string): Promise<void> {
        await axios.post(`${this.GMAIL_API_BASE}/threads/${threadId}/trash`, null, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    async deleteMessage(accessToken: string, messageId: string): Promise<void> {
        try {
            await axios.delete(`${this.GMAIL_API_BASE}/messages/${messageId}`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
        } catch (error: any) {
            if (error.response?.status === 403) {
                console.warn(`[GoogleMailProvider] Permanent delete forbidden for message ${messageId} (insufficient scopes). Skipping...`);
            } else {
                throw error;
            }
        }
    }

    async trashMessage(accessToken: string, messageId: string): Promise<void> {
        await axios.post(`${this.GMAIL_API_BASE}/messages/${messageId}/trash`, null, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    async moveThread(accessToken: string, threadId: string, destFolderId: string): Promise<void> {
        // Gmail uses labels instead of folders. 'destFolderId' here is treated as a label name.
        // First remove current labels (conceptually) and add the new one.
        // For simplicity, we just add the label.
        await axios.post(`${this.GMAIL_API_BASE}/threads/${threadId}/modify`, {
            addLabelIds: [destFolderId]
        }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    async restoreThread(accessToken: string, threadId: string, destFolderId?: string): Promise<void> {
        await axios.post(`${this.GMAIL_API_BASE}/threads/${threadId}/untrash`, null, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (destFolderId) {
            await this.moveThread(accessToken, threadId, destFolderId);
        }
    }

    async emptyTrash(accessToken: string): Promise<void> {
        // Gmail can't easily "empty trash" via API in one go without specific permissions
        // We'll fetch trash threads and delete them
        const response = await axios.get(`${this.GMAIL_API_BASE}/threads`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { q: "in:trash", maxResults: 100 }
        });

        for (const thread of (response.data.threads || [])) {
            try {
                await axios.delete(`${this.GMAIL_API_BASE}/threads/${thread.id}`, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
            } catch (error: any) {
                if (error.response?.status === 403) {
                    console.warn(`[GoogleMailProvider] Permanent delete forbidden for thread ${thread.id} (insufficient scopes). Skipping...`);
                } else {
                    throw error;
                }
            }
        }
    }

    async markAsRead(accessToken: string, threadId: string): Promise<void> {
        await axios.post(`${this.GMAIL_API_BASE}/threads/${threadId}/modify`, {
            removeLabelIds: ["UNREAD"]
        }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    async archiveThread(accessToken: string, threadId: string): Promise<void> {
        await axios.post(`${this.GMAIL_API_BASE}/threads/${threadId}/modify`, {
            removeLabelIds: ["INBOX"]
        }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }
}
