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
    constructor();
    private initializeTransporter;
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
