import nodemailer from "nodemailer";
import { Transporter } from "nodemailer";
import { getActiveMailConfiguration } from "../models/mailConfiguration.model";
import { decrypt } from "../utils/encryption";

interface EmailOptions {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: any[];
}

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

export class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    // Don't initialize transporter in constructor - we'll create it dynamically per tenant
  }

  private async initializeTransporter(tenantId?: string) {
    try {
      // Try to get active mail configuration if tenantId is provided
      if (tenantId) {
        console.log("🔍 Looking for mail configuration for tenant:", tenantId);
        const mailConfig = await getActiveMailConfiguration(tenantId);
        
        if (mailConfig) {
          console.log("✅ Found active mail configuration:");
          console.log("  - Host:", mailConfig.smtpHost);
          console.log("  - Port:", mailConfig.smtpPort);
          console.log("  - Username:", mailConfig.smtpUsername);
          console.log("  - SSL:", mailConfig.enableSsl);
          console.log("  - Default From:", mailConfig.defaultFromEmail);
          
          // Decrypt the password
          const decryptedPassword = decrypt(mailConfig.smtpPassword);
          console.log("  - Password decrypted successfully");
          
          const emailConfig = {
            host: mailConfig.smtpHost,
            port: mailConfig.smtpPort,
            secure: mailConfig.enableSsl, // true for 465, false for other ports
            auth: {
              user: mailConfig.smtpUsername,
              pass: decryptedPassword,
            },
          };

          this.transporter = nodemailer.createTransport(emailConfig);
          console.log("✅ Email service initialized with mail configuration");
          return;
        } else {
          console.log("❌ No active mail configuration found for tenant:", tenantId);
        }
      }
    } catch (error) {
      console.error("❌ Failed to initialize email service with mail config:", error);
    }

    // Fallback to environment variables if no mail config is available
    console.warn("⚠️ No active mail configuration found, falling back to environment variables");
    
    const emailConfig = {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    };

    // Only initialize if credentials are provided
    if (emailConfig.auth.user && emailConfig.auth.pass) {
      try {
        this.transporter = nodemailer.createTransport(emailConfig);
        console.log("✅ Email service initialized with environment variables");
      } catch (error) {
        console.error("❌ Failed to initialize email service:", error);
        this.transporter = null;
      }
    } else {
      console.warn(
        "⚠️ Email credentials not configured. Email notifications will be logged to console."
      );
      this.transporter = null;
    }
  }

  private async sendEmail(options: EmailOptions, tenantId?: string): Promise<boolean> {
    try {
      // Initialize transporter with tenant-specific mail configuration
      await this.initializeTransporter(tenantId);
      
      if (!this.transporter) {
        // Log to console if transporter is not configured
        console.log("\n📧 EMAIL NOTIFICATION (Not Sent - No SMTP Config):");
        console.log("To:", options.to);
        console.log("Subject:", options.subject);
        console.log("Body:", options.text || options.html);
        console.log("---\n");
        return true;
      }

      let fromAddress = options.from;
      console.log("🔍 Initial from address:", fromAddress);
      
      // When using mail configuration, always use the SMTP username as from address
      // to prevent relay errors, regardless of any custom from address provided
      if (tenantId) {
        console.log("🔍 Using mail configuration for tenant:", tenantId);
        try {
          const mailConfig = await getActiveMailConfiguration(tenantId);
          if (mailConfig) {
            // Use the SMTP username as the from address to prevent relay errors
            // Most SMTP servers require the from address to match the authenticated user
            fromAddress = mailConfig.smtpUsername;
            console.log(`✅ Overriding with SMTP username as from address: ${fromAddress}`);
          } else {
            console.log("❌ No mail configuration found for from address");
          }
        } catch (error) {
          console.warn("❌ Could not get mail configuration for from address:", error);
        }
      }
      
      // Fallback to environment variables if no mail config
      if (!fromAddress) {
        console.log("⚠️ Falling back to environment variables for from address");
        fromAddress = process.env.SMTP_USER || `"${process.env.SMTP_FROM_NAME || "Zithmi"}" <${
          process.env.SMTP_FROM_EMAIL || "noreply@zithtech.com"
        }>`;
        console.log(`📧 Using fallback from address: ${fromAddress}`);
      }

      const mailOptions = {
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments
      };

      console.log(`📧 Preparing to send email - From: ${mailOptions.from}, To: ${mailOptions.to}`);

      const info = await this.transporter.sendMail(mailOptions);
      console.log("✅ Email sent successfully:", info.messageId);
      console.log(`📧 From: ${mailOptions.from}`);
      console.log(`📧 To: ${mailOptions.to}`);
      return true;
    } catch (error) {
      console.error("❌ Failed to send email:", error);
      return false;
    }
  }

  private formatLeaveType(type: string): string {
    const typeMap: { [key: string]: string } = {
      sick_leave: "Sick Leave",
      casual_leave: "Casual Leave",
      paid_leave: "Paid Leave",
      unpaid_leave: "Unpaid Leave",
      work_from_home: "Work From Home",
      permission: "Permission",
    };
    return typeMap[type] || type;
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  private formatDuration(duration: number, durationType: string): string {
    if (durationType === "HOURS") {
      return `${duration} hour${duration !== 1 ? "s" : ""}`;
    }
    return `${duration} day${duration !== 1 ? "s" : ""}`;
  }

  async sendLeaveApplicationEmail(
    data: LeaveApplicationEmailData,
    tenantId?: string
  ): Promise<boolean> {
    const subject = `New Leave Request from ${data.employeeName}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1677ff; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
          .detail-row { margin: 15px 0; padding: 10px; background-color: white; border-left: 3px solid #1677ff; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; margin-left: 10px; }
          .reason-box { background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
          .button { display: inline-block; padding: 12px 30px; background-color: #1677ff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🏖️ New Leave Request</h2>
          </div>
          <div class="content">
            <p>Hi <strong>${data.managerName}</strong>,</p>
            <p><strong>${
              data.employeeName
            }</strong> has submitted a new leave request that requires your approval.</p>
            
            <div class="detail-row">
              <span class="label">Employee:</span>
              <span class="value">${data.employeeName} (${
      data.employeeEmail
    })</span>
            </div>
            
            <div class="detail-row">
              <span class="label">Leave Type:</span>
              <span class="value">${this.formatLeaveType(data.leaveType)}</span>
            </div>
            
            <div class="detail-row">
              <span class="label">Start Date:</span>
              <span class="value">${this.formatDate(data.startDate)}</span>
            </div>
            
            <div class="detail-row">
              <span class="label">End Date:</span>
              <span class="value">${this.formatDate(data.endDate)}</span>
            </div>
            
            <div class="detail-row">
              <span class="label">Duration:</span>
              <span class="value">${this.formatDuration(
                data.duration,
                data.durationType
              )}</span>
            </div>
            
            <div class="reason-box">
              <strong>Reason:</strong><br/>
              ${data.reason}
            </div>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="${
                process.env.FRONTEND_URL || "http://localhost:3000"
              }/leaves" class="button">Review Leave Request</a>
            </p>
          </div>
          <div class="footer">
            <p>This is an automated notification from Zithmi Leave Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
New Leave Request from ${data.employeeName}

Hi ${data.managerName},

${
  data.employeeName
} has submitted a new leave request that requires your approval.

Employee: ${data.employeeName} (${data.employeeEmail})
Leave Type: ${this.formatLeaveType(data.leaveType)}
Start Date: ${this.formatDate(data.startDate)}
End Date: ${this.formatDate(data.endDate)}
Duration: ${this.formatDuration(data.duration, data.durationType)}

Reason:
${data.reason}

Please log in to review and approve/reject this request.
    `;

    return this.sendEmail({ to: data.to, subject, html, text }, tenantId);
  }

  async sendLeaveApprovalEmail(data: LeaveApprovalEmailData, tenantId?: string): Promise<boolean> {
    const subject = `✅ Your Leave Request has been Approved`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #52c41a; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
          .detail-row { margin: 15px 0; padding: 10px; background-color: white; border-left: 3px solid #52c41a; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; margin-left: 10px; }
          .success-box { background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 20px 0; border-radius: 5px; text-align: center; }
          .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>✅ Leave Request Approved</h2>
          </div>
          <div class="content">
            <p>Hi <strong>${data.employeeName}</strong>,</p>
            
            <div class="success-box">
              <h3 style="margin: 0; color: #155724;">Your leave request has been approved!</h3>
            </div>
            
            <p>Your leave request has been reviewed and approved by <strong>${
              data.approverName
            }</strong>.</p>
            
            <div class="detail-row">
              <span class="label">Leave Type:</span>
              <span class="value">${this.formatLeaveType(data.leaveType)}</span>
            </div>
            
            <div class="detail-row">
              <span class="label">Start Date:</span>
              <span class="value">${this.formatDate(data.startDate)}</span>
            </div>
            
            <div class="detail-row">
              <span class="label">End Date:</span>
              <span class="value">${this.formatDate(data.endDate)}</span>
            </div>
            
            <div class="detail-row">
              <span class="label">Duration:</span>
              <span class="value">${this.formatDuration(
                data.duration,
                data.durationType
              )}</span>
            </div>
            
            <p style="margin-top: 20px;">Enjoy your time off! 🎉</p>
          </div>
          <div class="footer">
            <p>This is an automated notification from Zithmi Leave Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Your Leave Request has been Approved

Hi ${data.employeeName},

Your leave request has been reviewed and approved by ${data.approverName}.

Leave Type: ${this.formatLeaveType(data.leaveType)}
Start Date: ${this.formatDate(data.startDate)}
End Date: ${this.formatDate(data.endDate)}
Duration: ${this.formatDuration(data.duration, data.durationType)}

Enjoy your time off!
    `;

    return this.sendEmail({ to: data.to, subject, html, text }, tenantId);
  }

  async sendLeaveRejectionEmail(
    data: LeaveRejectionEmailData,
    tenantId?: string
  ): Promise<boolean> {
    const subject = `❌ Your Leave Request has been Rejected`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #ff4d4f; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
          .detail-row { margin: 15px 0; padding: 10px; background-color: white; border-left: 3px solid #ff4d4f; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; margin-left: 10px; }
          .rejection-box { background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>❌ Leave Request Rejected</h2>
          </div>
          <div class="content">
            <p>Hi <strong>${data.employeeName}</strong>,</p>
            <p>Your leave request has been reviewed and rejected by <strong>${
              data.approverName
            }</strong>.</p>
            
            <div class="detail-row">
              <span class="label">Leave Type:</span>
              <span class="value">${this.formatLeaveType(data.leaveType)}</span>
            </div>
            
            <div class="detail-row">
              <span class="label">Start Date:</span>
              <span class="value">${this.formatDate(data.startDate)}</span>
            </div>
            
            <div class="detail-row">
              <span class="label">End Date:</span>
              <span class="value">${this.formatDate(data.endDate)}</span>
            </div>
            
            <div class="detail-row">
              <span class="label">Duration:</span>
              <span class="value">${this.formatDuration(
                data.duration,
                data.durationType
              )}</span>
            </div>
            
            <div class="rejection-box">
              <strong>Reason for Rejection:</strong><br/>
              ${data.rejectionReason}
            </div>
            
            <p>If you have any questions or concerns, please contact your manager or HR department.</p>
          </div>
          <div class="footer">
            <p>This is an automated notification from Zithmi Leave Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Your Leave Request has been Rejected

Hi ${data.employeeName},

Your leave request has been reviewed and rejected by ${data.approverName}.

Leave Type: ${this.formatLeaveType(data.leaveType)}
Start Date: ${this.formatDate(data.startDate)}
End Date: ${this.formatDate(data.endDate)}
Duration: ${this.formatDuration(data.duration, data.durationType)}

Reason for Rejection:
${data.rejectionReason}

If you have any questions or concerns, please contact your manager or HR department.
    `;

    return this.sendEmail({ to: data.to, subject, html, text }, tenantId);
  }


  static generateInvoiceHtml(data: {
    customerName: string;
    invoiceNumber: string;
    amount: string;
    dueDate: string;
    customMessage?: string;
    pdfUrl?: string | null;
  }): string {
    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e1e1e1; border-radius: 8px;">
        <div style="background-color: #1677ff; color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px;">Invoice ${data.invoiceNumber}</h1>
        </div>
        <div style="padding: 24px; color: #333;">
          <p>Dear <strong>${data.customerName}</strong>,</p>
          <p style="line-height: 1.6; color: #555;">${data.customMessage || "Please find your invoice details below."}</p>
          <div style="margin: 20px 0; padding: 20px; background-color: #f0f5ff; border-radius: 4px; text-align: center;">
            <div style="font-size: 12px; color: #666; text-transform: uppercase;">Amount Due</div>
            <div style="font-size: 28px; font-weight: bold; color: #1677ff;">${data.amount}</div>
            <div style="margin-top: 5px; color: #666;">Due by: ${data.dueDate}</div>
          </div>
          <p style="margin-top: 20px; font-size: 14px;">
            📎 <a href="${data.pdfUrl}" style="color: #1677ff;">Download Invoice PDF</a>
          </p>
        </div>
      </div>
    `;
  }

  async sendInvoiceEmail(data: {
    to: string;
    from?: string;
    subject: string;
    customerName: string;
    invoiceNumber: string;
    amount: string;
    dueDate: string;
    customMessage?: string;
    pdfUrl?: string | null;
  }, tenantId?: string): Promise<{ success: boolean; html: string }> {  // ✅ RETURN HTML
    const subject = `Invoice ${data.invoiceNumber} from Zithtech`;
    
    // HTML Template
    const html = EmailService.generateInvoiceHtml(data);

    const options: any = { 
      from: data.from || process.env.SMTP_FROM_EMAIL || 'noreply@zithtech.com',
      to: data.to, 
      subject, 
      html 
    };

    // Attach PDF
    if (data.pdfUrl) {
      options.attachments = [{
        filename: `Invoice_${data.invoiceNumber}.pdf`,
        path: data.pdfUrl,
        contentType: 'application/pdf'
      }];
    }

    // Send email
    try {
      const result = await this.sendEmail(options, tenantId);
      return { 
        success: result, 
        html  // ✅ RETURN THE HTML THAT WAS SENT
      };
    } catch (error) {
      console.error("❌ Send failed:", error);
      return { 
        success: false, 
        html  // Still return HTML even on failure for logging
      };
    }
  }



  async sendBankDisbursementEmail(data: {
    to: string;
    companyName: string;
    month: number;
    year: number;
    excelBuffer: Buffer;
    fileName: string;
  }, tenantId?: string): Promise<boolean> {
    const subject = `Bank Disbursement Sheet - ${data.companyName} (${data.month}/${data.year})`;
    
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e1e1e1; border-radius: 8px;">
        <div style="background-color: #52c41a; color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px;">Bank Disbursement</h1>
        </div>
        <div style="padding: 24px; color: #333;">
          <p>Dear Bank Manager,</p>
          <p style="line-height: 1.6; color: #555;">
            Please find the attached bank disbursement sheet for <strong>${data.companyName}</strong> 
            for the period of <strong>${data.month}/${data.year}</strong>.
          </p>
          <p>Kindly process the payments as per the attached details.</p>
          <br/>
          <p style="color: #666; font-size: 12px;">This is an automated email from Zithmi HRMS.</p>
        </div>
      </div>
    `;

    const options: any = {
      to: data.to,
      subject,
      html,
      attachments: [{
        filename: data.fileName,
        content: data.excelBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }]
    };

    return this.sendEmail(options, tenantId);
  }

  async sendPayslipEmail(data: {
    to: string;
    from?: string;
    employeeName: string;
    month: string;
    year: string;
    downloadUrl: string;
  }, tenantId?: string): Promise<boolean> {
    const subject = `Your Payslip for ${data.month} ${data.year} is ready`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e1e1e1; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #7c3aed; color: white; padding: 32px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em;">Payslip Ready</h1>
          <p style="margin-top: 8px; opacity: 0.9;">${data.month} ${data.year}</p>
        </div>
        <div style="padding: 32px; color: #111827; background-color: white;">
          <p style="font-size: 16px;">Hi <strong>${data.employeeName}</strong>,</p>
          <p style="line-height: 1.6; color: #4b5563; font-size: 15px;">
            Your payslip for <strong>${data.month} ${data.year}</strong> has been generated and is ready for download.
          </p>
          
          <div style="margin: 32px 0; text-align: center;">
            <a href="${data.downloadUrl}" 
               style="display: inline-block; background-color: #7c3aed; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(124, 58, 237, 0.2);">
               Download Payslip PDF
            </a>
          </div>

          <div style="background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 8px; padding: 16px; margin-top: 24px;">
            <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">
              <strong>Security Note:</strong> This is a secure, temporary link that will expire in 24 hours. 
              Please download and save your payslip promptly.
            </p>
          </div>

          <p style="margin-top: 32px; font-size: 14px; color: #9ca3af; text-align: center;">
            This is an automated notification from your Enterprise HR Portal.
          </p>
        </div>
      </div>
    `;

    const text = `
Hi ${data.employeeName},

Your payslip for ${data.month} ${data.year} is ready.
You can download it securely using the link below:

${data.downloadUrl}

Note: This link will expire in 24 hours.
    `;

    return this.sendEmail({ to: data.to, from: data.from, subject, html, text }, tenantId);
  }
}

// Export singleton instance
export const emailService = new EmailService();
export default emailService;
