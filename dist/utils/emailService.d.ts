interface LeaveApplicationEmailData {
    to: string;
    managerName: string;
    employeeName: string;
    employeeEmail: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    duration: number;
    durationType: string;
    reason: string;
    leaveId: string;
}
interface LeaveApprovalEmailData {
    to: string;
    employeeName: string;
    approverName: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    duration: number;
    durationType: string;
}
interface LeaveRejectionEmailData {
    to: string;
    employeeName: string;
    approverName: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    duration: number;
    durationType: string;
    rejectionReason: string;
}
export declare class EmailService {
    private transporter;
    private systemTransporter;
    constructor();
    private initializeTransporter;
    private initializeSystemTransporter;
    resolveTenantMailBranding(tenantId?: string): Promise<{
        companyName: string;
        companyLogo: string;
        replyToEmail: string;
        subdomain: string;
    }>;
    sendCentralizedMail(options: {
        tenantId?: string;
        to: string;
        subject: string;
        html: string;
        text?: string;
        attachments?: any[];
    }): Promise<boolean>;
    enqueueCentralizedMail(payload: {
        tenantId: string;
        to: string;
        subject: string;
        templateType: 'welcome' | 'custom';
        templateData: any;
    }): Promise<boolean>;
    sendNewMemberWelcomeEmail(data: {
        to: string;
        name: string;
        email: string;
        password?: string;
    }, tenantId?: string): Promise<boolean>;
    private sendEmail;
    private formatLeaveType;
    private formatDate;
    private formatDuration;
    sendLeaveApplicationEmail(data: LeaveApplicationEmailData, tenantId?: string): Promise<boolean>;
    sendLeaveApprovalEmail(data: LeaveApprovalEmailData, tenantId?: string): Promise<boolean>;
    sendLeaveRejectionEmail(data: LeaveRejectionEmailData, tenantId?: string): Promise<boolean>;
    static generateInvoiceHtml(data: {
        customerName: string;
        invoiceNumber: string;
        amount: string;
        dueDate: string;
        customMessage?: string;
        pdfUrl?: string | null;
    }): string;
    sendInvoiceEmail(data: {
        to: string;
        from?: string;
        subject: string;
        customerName: string;
        invoiceNumber: string;
        amount: string;
        dueDate: string;
        customMessage?: string;
        pdfUrl?: string | null;
    }, tenantId?: string): Promise<{
        success: boolean;
        html: string;
    }>;
    sendBankDisbursementEmail(data: {
        to: string;
        companyName: string;
        month: number;
        year: number;
        excelBuffer: Buffer;
        fileName: string;
    }, tenantId?: string): Promise<boolean>;
    sendEscalationEmail(data: {
        to: string;
        userName: string;
        escalationSubject: string;
        description: string;
        creatorName: string;
        escalation?: {
            id?: string;
            created_at?: any;
            status_name?: string | null;
            priority_name?: string | null;
            priority_color?: string | null;
            category_name?: string | null;
            project?: {
                name: string;
            } | null;
            createdBy?: {
                name: string;
            } | null;
            targetMembers?: {
                name?: string;
                user?: {
                    name: string;
                };
            }[] | null;
            tickets?: any[];
        };
        tickets?: {
            ticketNumber: string;
            title: string;
        }[];
        attachments?: {
            filename: string;
            content: Buffer;
        }[];
    }, tenantId?: string): Promise<boolean>;
    sendPortalWelcomeEmail(data: {
        to: string;
        displayName: string | null;
        username: string;
        temporaryPassword: string;
        portalUrl: string;
    }, tenantId?: string): Promise<boolean>;
    sendPortalPasswordResetEmail(data: {
        to: string;
        displayName: string | null;
        username: string;
        temporaryPassword: string;
        portalUrl: string;
    }, tenantId?: string): Promise<boolean>;
    sendPayslipEmail(data: {
        to: string;
        from?: string;
        employeeName: string;
        month: string;
        year: string;
        downloadUrl: string;
    }, tenantId?: string): Promise<boolean>;
}
export declare const emailService: EmailService;
export default emailService;
