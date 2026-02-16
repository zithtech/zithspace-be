export interface EmailLogData {
    tenantId: string;
    module: string;
    moduleId: string;
    moduleNumber: string;
    to: string;
    from: string;
    fromName?: string;
    subject: string;
    html: string;
    plainText?: string;
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    amount?: string;
    dueDate?: string;
    currency?: string;
    hasAttachment?: boolean;
    attachmentUrl?: string;
    attachmentName?: string;
    status: 'SENT' | 'FAILED' | 'OPENED' | 'CLICKED' | 'BOUNCED';
    errorMessage?: string;
    sentBy: string;
    sentByUser?: string;
    metadata?: any;
}
export declare class EmailLoggerService {
    /**
     * Log an email that was sent
     */
    static logEmail(data: EmailLogData): Promise<void>;
    /**
     * Get email logs with filtering and pagination
     */
    static getEmailLogs(tenantId: string, filters: {
        module?: string;
        moduleId?: string;
        customerId?: string;
        search?: string;
        status?: string;
        startDate?: Date;
        endDate?: Date;
    }, pagination: {
        page: number;
        limit: number;
    }): Promise<{
        data: any;
        pagination: {
            page: number;
            limit: number;
            total: any;
            pages: number;
        };
    }>;
    /**
     * Get a single email log by ID
     */
    static getEmailById(id: string, tenantId: string): Promise<any>;
    /**
     * Get all unique modules that have sent emails
     */
    static getModules(tenantId: string): Promise<any>;
    /**
     * Get email statistics
     */
    static getStats(tenantId: string): Promise<{
        total: any;
        sentToday: any;
        sentThisWeek: any;
        sentThisMonth: any;
        byModule: any;
        byStatus: any;
    }>;
    /**
     * Update email status (for tracking opens/clicks)
     */
    static updateStatus(id: string, tenantId: string, status: 'OPENED' | 'CLICKED', metadata?: any): Promise<any>;
}
