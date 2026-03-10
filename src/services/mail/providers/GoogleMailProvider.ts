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

    async getThreads(accessToken: string, cursor?: string): Promise<{ threads: MailThreadData[], nextCursor?: string }> {
        const response = await axios.get(`${this.GMAIL_API_BASE}/threads`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
                maxResults: 20,
                pageToken: cursor
            }
        });

        const threads = await Promise.all(
            (response.data.threads || []).map(async (t: any) => {
                const details = await axios.get(`${this.GMAIL_API_BASE}/threads/${t.id}`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    params: { format: "minimal" }
                });

                const lastMsg = details.data.messages[details.data.messages.length - 1];
                return {
                    id: t.id,
                    subject: lastMsg.payload.headers.find((h: any) => h.name === "Subject")?.value || "No Subject",
                    lastMessageAt: new Date(parseInt(lastMsg.internalDate)),
                    messageCount: details.data.messages.length,
                    snippet: t.snippet,
                    labels: this.normalizeLabels(details.data.messages[0]?.labelIds || [])
                };
            })
        );

        return {
            threads,
            nextCursor: response.data.nextPageToken
        };
    }

    async getMessages(accessToken: string, threadId: string): Promise<MailMessageData[]> {
        const response = await axios.get(`${this.GMAIL_API_BASE}/threads/${threadId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        return await Promise.all(
            response.data.messages.map(async (msg: any) => {
                const headers = msg.payload.headers;
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

    async sendMessage(accessToken: string, mailData: Partial<MailMessageData>): Promise<void> {
        // Basic implementation for sending via Gmail
        const str = [
            `To: ${mailData.to?.join(", ")}`,
            `Subject: ${mailData.subject}`,
            "",
            mailData.body
        ].join("\n");

        const encodedMail = Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        await axios.post(`${this.GMAIL_API_BASE}/messages/send`, { raw: encodedMail }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    async saveDraft(accessToken: string, draftData: Partial<MailMessageData>): Promise<{ id: string }> {
        const str = [
            `To: ${draftData.to?.join(", ")}`,
            `Subject: ${draftData.subject}`,
            "",
            draftData.body
        ].join("\n");

        const encodedMail = Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const response = await axios.post(`${this.GMAIL_API_BASE}/drafts`, {
            message: { raw: encodedMail }
        }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        return { id: response.data.id };
    }

    async updateDraft(accessToken: string, draftId: string, draftData: Partial<MailMessageData>): Promise<void> {
        const str = [
            `To: ${draftData.to?.join(", ")}`,
            `Subject: ${draftData.subject}`,
            "",
            draftData.body
        ].join("\n");

        const encodedMail = Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        await axios.put(`${this.GMAIL_API_BASE}/drafts/${draftId}`, {
            message: { raw: encodedMail }
        }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
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
        await axios.post(`${this.GMAIL_API_BASE}/threads/${threadId}/trash`, null, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    async deleteMessage(accessToken: string, messageId: string): Promise<void> {
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
            await axios.delete(`${this.GMAIL_API_BASE}/threads/${thread.id}`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
        }
    }
}
