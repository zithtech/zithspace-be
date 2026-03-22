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
        data: ({
            customer: {
                companyName: string;
                id: string;
                email: string;
            };
            sentByUserRel: {
                id: string;
                name: string;
            };
        } & {
            status: string;
            id: string;
            tenantId: string;
            dueDate: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            amount: string | null;
            currency: string | null;
            module: string;
            moduleId: string;
            moduleNumber: string | null;
            to: string;
            from: string;
            fromName: string | null;
            subject: string;
            html: string;
            plainText: string | null;
            customerName: string | null;
            customerEmail: string | null;
            hasAttachment: boolean;
            attachmentUrl: string | null;
            attachmentName: string | null;
            errorMessage: string | null;
            sentAt: Date;
            openedAt: Date | null;
            clickedAt: Date | null;
            sentByUser: string | null;
            customerId: string | null;
            sentBy: string;
        })[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }>;
    /**
     * Get a single email log by ID
     */
    static getEmailById(id: string, tenantId: string): Promise<{
        customer: {
            companyName: string;
            country: string | null;
            city: string | null;
            id: string;
            tenantId: string;
            createdAt: Date;
            updatedAt: Date;
            createdBy: string;
            updatedBy: string | null;
            email: string | null;
            phone: string | null;
            address: string | null;
            taxId: string | null;
        };
        sentByUserRel: {
            id: string;
            name: string;
        };
    } & {
        status: string;
        id: string;
        tenantId: string;
        dueDate: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        amount: string | null;
        currency: string | null;
        module: string;
        moduleId: string;
        moduleNumber: string | null;
        to: string;
        from: string;
        fromName: string | null;
        subject: string;
        html: string;
        plainText: string | null;
        customerName: string | null;
        customerEmail: string | null;
        hasAttachment: boolean;
        attachmentUrl: string | null;
        attachmentName: string | null;
        errorMessage: string | null;
        sentAt: Date;
        openedAt: Date | null;
        clickedAt: Date | null;
        sentByUser: string | null;
        customerId: string | null;
        sentBy: string;
    }>;
    /**
     * Get all unique modules that have sent emails
     */
    static getModules(tenantId: string): Promise<string[]>;
    /**
     * Get email statistics
     */
    static getStats(tenantId: string): Promise<{
        total: number;
        sentToday: number;
        sentThisWeek: number;
        sentThisMonth: number;
        byModule: {
            module: string;
            count: number;
        }[];
        byStatus: {
            status: string;
            count: number;
        }[];
    }>;
    /**
     * Update email status (for tracking opens/clicks)
     */
    static updateStatus(id: string, tenantId: string, status: 'OPENED' | 'CLICKED', metadata?: any): Promise<{
        status: string;
        id: string;
        tenantId: string;
        dueDate: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        amount: string | null;
        currency: string | null;
        module: string;
        moduleId: string;
        moduleNumber: string | null;
        to: string;
        from: string;
        fromName: string | null;
        subject: string;
        html: string;
        plainText: string | null;
        customerName: string | null;
        customerEmail: string | null;
        hasAttachment: boolean;
        attachmentUrl: string | null;
        attachmentName: string | null;
        errorMessage: string | null;
        sentAt: Date;
        openedAt: Date | null;
        clickedAt: Date | null;
        sentByUser: string | null;
        customerId: string | null;
        sentBy: string;
    }>;
}
