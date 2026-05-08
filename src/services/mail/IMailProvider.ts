import { mail_provider } from "@prisma/client";

export interface MailAttachmentData {
    filename: string;
    content?: Buffer | string;
    contentType: string;
    size: number;
    url?: string;
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
    isRead?: boolean;
}

export interface MailThreadData {
    id: string;
    subject: string;
    lastMessageAt: Date;
    messageCount: number;
    snippet?: string;
    labels?: string[];
    hasAttachments?: boolean;
    participants?: { from: string, to: string[] };
    isRead?: boolean;
}

export interface IMailProvider {
    getThreads(accessToken: string, cursor?: string, lastSyncedAt?: Date): Promise<{ threads: MailThreadData[], nextCursor?: string }>;
    getMessages(accessToken: string, threadId: string): Promise<MailMessageData[]>;
    sendMessage(accessToken: string, mailData: Partial<MailMessageData>): Promise<{ messageId: string, threadId?: string } | void>;
    saveDraft(accessToken: string, draftData: Partial<MailMessageData>): Promise<{ id: string, messageId?: string, threadId?: string }>;
    updateDraft(accessToken: string, draftId: string, draftData: Partial<MailMessageData>): Promise<{ id: string, messageId?: string, threadId?: string } | void>;
    sendDraft(accessToken: string, draftId: string): Promise<void>;
    moveThread(accessToken: string, threadId: string, destFolderId: string): Promise<void>;
    restoreThread(accessToken: string, threadId: string, destFolderId?: string): Promise<void>;
    deleteThread(accessToken: string, threadId: string): Promise<void>;
    trashThread(accessToken: string, threadId: string): Promise<void>;
    deleteMessage(accessToken: string, messageId: string): Promise<void>;
    trashMessage(accessToken: string, messageId: string): Promise<void>;
    emptyTrash(accessToken: string): Promise<void>;
    markAsRead(accessToken: string, threadId: string): Promise<void>;
    archiveThread(accessToken: string, threadId: string): Promise<void>;
    bulkMoveThreads?(accessToken: string, threadIds: string[], destFolderId: string): Promise<void>;
    bulkTrashThreads?(accessToken: string, threadIds: string[]): Promise<void>;
    bulkDeleteThreads?(accessToken: string, threadIds: string[]): Promise<void>;
    // Authentication is handled by UnifiedAuthService via CalendarProvider
}
