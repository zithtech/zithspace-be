import { MailProvider } from "@prisma/client";

export interface MailAttachmentData {
    filename: string;
    content: Buffer | string;
    contentType: string;
    size: number;
}

export interface MailMessageData {
    id: string;
    threadId: string;
    subject: string;
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    body: string;
    htmlBody?: string;
    receivedAt: Date;
    hasAttachments: boolean;
    attachments?: MailAttachmentData[];
    labels?: string[];
    snippet?: string;
}

export interface MailThreadData {
    id: string;
    subject: string;
    lastMessageAt: Date;
    messageCount: number;
    snippet?: string;
    labels?: string[];
    participants?: { from: string, to: string[] };
}

export interface IMailProvider {
    getThreads(accessToken: string, cursor?: string): Promise<{ threads: MailThreadData[], nextCursor?: string }>;
    getMessages(accessToken: string, threadId: string): Promise<MailMessageData[]>;
    sendMessage(accessToken: string, mailData: Partial<MailMessageData>): Promise<void>;
    saveDraft(accessToken: string, draftData: Partial<MailMessageData>): Promise<{ id: string }>;
    updateDraft(accessToken: string, draftId: string, draftData: Partial<MailMessageData>): Promise<void>;
    sendDraft(accessToken: string, draftId: string): Promise<void>;
    moveThread(accessToken: string, threadId: string, destFolderId: string): Promise<void>;
    restoreThread(accessToken: string, threadId: string, destFolderId?: string): Promise<void>;
    deleteThread(accessToken: string, threadId: string): Promise<void>;
    deleteMessage(accessToken: string, messageId: string): Promise<void>;
    emptyTrash(accessToken: string): Promise<void>;
    // Authentication is handled by UnifiedAuthService via CalendarProvider
}
