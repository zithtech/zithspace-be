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
declare class EmailService {
    private transporter;
    constructor();
    private initializeTransporter;
    private sendEmail;
    private formatLeaveType;
    private formatDate;
    private formatDuration;
    sendLeaveApplicationEmail(data: LeaveApplicationEmailData): Promise<boolean>;
    sendLeaveApprovalEmail(data: LeaveApprovalEmailData): Promise<boolean>;
    sendLeaveRejectionEmail(data: LeaveRejectionEmailData): Promise<boolean>;
    sendInvoiceEmail(data: {
        to: string;
        subject: string;
        customerName: string;
        invoiceNumber: string;
        amount: string;
        dueDate: string;
        customMessage?: string;
        pdfUrl?: string | null;
    }): Promise<boolean>;
}
export declare const emailService: EmailService;
export default emailService;
