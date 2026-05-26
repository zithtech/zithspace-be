import nodemailer from "nodemailer";
import { Transporter } from "nodemailer";
import { getActiveMailConfiguration } from "../models/mailConfiguration.model";
import { decrypt } from "../utils/encryption";
import { prisma } from "../config/database";
// import { rabbitMQService } from "./RabbitMQService";
// import { CENTRAL_MAIL_EXCHANGE, CENTRAL_MAIL_ROUTING_KEY } from "../config/rabbitmq";

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
  private systemTransporter: Transporter | null = null;

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

  private async initializeSystemTransporter() {
    if (this.systemTransporter) return;

    const email = process.env.SYSTEM_EMAIL || process.env.SMTP_USER;
    const pass = process.env.SYSTEM_APP_PASSWORD || process.env.SMTP_PASS;

    if (email && pass) {
      try {
        const host = process.env.SYSTEM_HOST || process.env.SMTP_HOST || "smtp.gmail.com";
        const port = parseInt(process.env.SYSTEM_PORT || process.env.SMTP_PORT || "587");
        const secure = process.env.SYSTEM_SECURE !== undefined 
          ? (process.env.SYSTEM_SECURE === "true") 
          : (process.env.SMTP_SECURE === "true");

        this.systemTransporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user: email, pass: pass },
        });
        console.log(`✅ Centralized System Email transporter initialized successfully: Host=${host}, Port=${port}, Secure=${secure}`);
      } catch (error) {
        console.error("❌ Failed to initialize system transporter:", error);
      }
    } else {
      console.warn("⚠️ SYSTEM_EMAIL and SYSTEM_APP_PASSWORD environment variables not defined. Falling back to default transporter.");
    }
  }

  public async resolveTenantMailBranding(tenantId?: string) {
    let companyName = "ZithSpace";
    let companyLogo = "";
    let replyToEmail = process.env.SYSTEM_EMAIL || "support@zithspace.com";

    if (tenantId) {
      try {
        const tenant = await prisma.tenant.findFirst({
          where: { id: tenantId },
        });

        if (tenant) {
          companyName = tenant.name || companyName;
          const settings = tenant.settings as any;
          if (settings && settings.logoUrl) {
            companyLogo = settings.logoUrl;
          }
        }
      } catch (error) {
        console.error("❌ Error resolving tenant branding:", error);
      }
    }

    return { companyName, companyLogo, replyToEmail };
  }

  public async sendCentralizedMail(options: {
    tenantId?: string;
    to: string;
    subject: string;
    html: string;
    text?: string;
    attachments?: any[];
  }): Promise<boolean> {
    try {
      await this.initializeSystemTransporter();
      const branding = await this.resolveTenantMailBranding(options.tenantId);

      const transporter = this.systemTransporter || this.transporter;
      if (!transporter) {
        console.log("\n📧 CENTRAL EMAIL NOTIFICATION (Not Sent - Transporter Offline):");
        console.log("To:", options.to);
        console.log("Subject:", options.subject);
        console.log("Body:", options.text || options.html);
        console.log("---\n");
        return true;
      }

      const fromEmail = process.env.SYSTEM_EMAIL || process.env.SMTP_USER || "system@zithspace.com";
      const fromName = branding.companyName;

      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        replyTo: branding.replyToEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log("✅ Centralized email sent successfully:", info.messageId);
      return true;
    } catch (error) {
      console.error("❌ Failed to send centralized email:", error);
      throw error;
    }
  }

  public async enqueueCentralizedMail(payload: {
    tenantId: string;
    to: string;
    subject: string;
    templateType: 'welcome' | 'custom';
    templateData: any;
  }): Promise<boolean> {
    // Commented out RabbitMQ functionality as requested
    // try {
    //   const channel = await rabbitMQService.getChannel();
    //   if (channel) {
    //     await channel.publish(
    //       CENTRAL_MAIL_EXCHANGE,
    //       CENTRAL_MAIL_ROUTING_KEY,
    //       Buffer.from(JSON.stringify(payload)),
    //       { persistent: true }
    //     );
    //     console.log("✅ Centralized mail enqueued successfully to RabbitMQ.");
    //     return true;
    //   }
    // } catch (error) {
    //   console.warn("⚠️ RabbitMQ offline or failed to enqueue. Falling back to direct email delivery:", error);
    // }

    // Direct synchronous send
    try {
      if (payload.templateType === 'welcome') {
        return await this.sendNewMemberWelcomeEmail({
          to: payload.to,
          name: payload.templateData.name,
          email: payload.templateData.email,
          password: payload.templateData.password,
        }, payload.tenantId);
      } else {
        return await this.sendCentralizedMail({
          tenantId: payload.tenantId,
          to: payload.to,
          subject: payload.subject,
          html: payload.templateData.html || '',
          text: payload.templateData.text || '',
        });
      }
    } catch (directError) {
      console.error("❌ Direct email delivery failed:", directError);
      return false;
    }
  }

  public async sendNewMemberWelcomeEmail(
    data: { to: string; name: string; email: string; password?: string },
    tenantId?: string
  ): Promise<boolean> {
    const branding = await this.resolveTenantMailBranding(tenantId);
    const loginUrl = "https://zithmi.zithspace.com/login";

    const logoHtml = branding.companyLogo
      ? `<img class="logo" src="${branding.companyLogo}" alt="${branding.companyName}" />`
      : "";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
          .wrapper { width: 100%; background-color: #f8fafc; padding: 40px 0; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          .header { padding: 40px 40px 30px; text-align: center; border-bottom: 1px solid #f1f5f9; }
          .logo { max-height: 50px; margin-bottom: 16px; border-radius: 8px; }
          .company-name { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0; }
          .content { padding: 40px; }
          .title { font-size: 24px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 24px; text-align: center; }
          .welcome-text { font-size: 16px; line-height: 1.6; color: #475569; margin-bottom: 32px; }
          .credentials-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 32px; }
          .cred-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 15px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 12px; }
          .cred-row:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
          .cred-label { font-weight: 600; color: #64748b; }
          .cred-value { font-family: monospace; font-size: 15px; color: #0f172a; font-weight: 600; }
          .cta-wrapper { text-align: center; margin: 32px 0; }
          .cta-btn { display: inline-block; padding: 14px 32px; background: #2563eb; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; text-align: center; font-size: 15px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2); }
          .footer { padding: 32px; background: #f8fafc; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid #f1f5f9; }
          .footer-text { margin: 0 0 8px 0; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              ${logoHtml}
              <h2 class="company-name">${branding.companyName}</h2>
            </div>
            <div class="content">
              <h1 class="title">Welcome aboard!</h1>
              <p class="welcome-text">Hi <strong>${data.name}</strong>,<br><br>You have been added as a member to <strong>${branding.companyName}</strong>. Below are your credentials to log in to the portal:</p>
              
              <div class="credentials-box">
                <div class="cred-row">
                  <span class="cred-label">Login Email:</span>
                  <span class="cred-value">${data.email}</span>
                </div>
                ${data.password ? `
                <div class="cred-row">
                  <span class="cred-label">Password:</span>
                  <span class="cred-value">${data.password}</span>
                </div>
                ` : ''}
              </div>

              <div class="cta-wrapper">
                 <a href="${loginUrl}" class="cta-btn">Access Your Workspace</a>
               </div>
             </div>
             <div class="footer">
               <p class="footer-text">This is an automated mail, please do not reply.</p>
             </div>
           </div>
         </div>
       </body>
       </html>
     `;
 
     const text = `
       Welcome to ${branding.companyName}!
       
       Hi ${data.name},
       
       You have been added as a member to ${branding.companyName}.
       
       Login Email: ${data.email}
       ${data.password ? `Password: ${data.password}` : ''}
       
       Access your workspace here: ${loginUrl}
       
       This is an automated mail, please do not reply.
     `;
 
     return this.sendCentralizedMail({
       tenantId,
       to: data.to,
       subject: `Welcome to ${branding.companyName}`,
       html,
       text,
     });
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

  async sendEscalationEmail(
    data: {
      to: string;
      userName: string;
      escalationSubject: string;
      description: string;
      creatorName: string;
      tickets?: { ticketNumber: string; title: string }[];
      attachments?: { filename: string; content: Buffer }[];
    },
    tenantId?: string
  ): Promise<boolean> {
    const branding = await this.resolveTenantMailBranding(tenantId);
    const subject = `[Escalation Raised] ${data.escalationSubject}`;

    const logoHtml = branding.companyLogo
      ? `<img class="logo" src="${branding.companyLogo}" alt="${branding.companyName}" style="max-height: 50px; margin-bottom: 16px;" />`
      : "";

    let ticketsHtml = "";
    let ticketsText = "";
    if (data.tickets && data.tickets.length > 0) {
      ticketsHtml = `
        <div style="margin-top: 16px;">
          <span style="font-size: 11px; font-weight: 700; color: #ef4444; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Linked Tickets</span>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${data.tickets.map(t => `
              <div style="font-size: 13.5px; color: #334155; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; display: inline-block;">
                <strong style="color: #ef4444; margin-right: 6px;">${t.ticketNumber}</strong> ${t.title}
              </div>
            `).join("")}
          </div>
        </div>
      `;
      ticketsText = `\nLinked Tickets:\n` + data.tickets.map(t => `- [${t.ticketNumber}] ${t.title}`).join("\n");
    }

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #0f172a; line-height: 1.6;">
        <div style="margin-bottom: 24px;">
          ${logoHtml}
        </div>
        
        <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 8px; letter-spacing: -0.01em;">
          Escalation Raised
        </h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 0; margin-bottom: 24px;">
          An escalation has been raised in the system for your attention.
        </p>

        <div style="border-left: 4px solid #ef4444; padding-left: 16px; margin: 20px 0;">
          <p style="margin: 0 0 16px; font-size: 15px;">Hi <strong>${data.userName}</strong>,</p>
          <p style="margin: 0 0 20px; color: #475569; font-size: 14px;">
            An escalation has been raised by <strong>${data.creatorName}</strong>. Details are below:
          </p>

          <div style="margin-bottom: 16px;">
            <span style="font-size: 11px; font-weight: 700; color: #ef4444; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">Subject</span>
            <span style="font-size: 15px; font-weight: 600; color: #0f172a;">${data.escalationSubject}</span>
          </div>

          <div style="margin-bottom: 16px;">
            <span style="font-size: 11px; font-weight: 700; color: #ef4444; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">Description</span>
            <div style="font-size: 14px; color: #334155; white-space: pre-line; line-height: 1.5;">${data.description}</div>
          </div>

          ${ticketsHtml}
        </div>

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0 20px;" />
        
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
          This is an automated notification from ${branding.companyName} — please do not reply directly to this email.
        </p>
      </div>
    `;

    const text = `
Escalation Raised: ${data.escalationSubject}

Hi ${data.userName},

An escalation has been raised by ${data.creatorName}.

Subject: ${data.escalationSubject}
Description: ${data.description}
${ticketsText}
    `;

    return this.sendCentralizedMail({ to: data.to, tenantId, subject, html, text, attachments: data.attachments });
  }

  async sendPortalWelcomeEmail(
    data: {
      to: string;
      displayName: string | null;
      username: string;
      temporaryPassword: string;
      portalUrl: string;
    },
    tenantId?: string,
  ): Promise<boolean> {
    const greetingName = data.displayName || data.username;
    const branding = await this.resolveTenantMailBranding(tenantId);
    const subject = `Welcome to the ${branding.companyName} portal`;

    const logoHtml = branding.companyLogo
      ? `<img class="logo" src="${branding.companyLogo}" alt="${branding.companyName}" />`
      : "";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
          .wrapper { width: 100%; background-color: #f8fafc; padding: 40px 0; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          .header { padding: 40px 40px 30px; text-align: center; border-bottom: 1px solid #f1f5f9; }
          .logo { max-height: 50px; margin-bottom: 16px; border-radius: 8px; }
          .company-name { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0; }
          .content { padding: 40px; }
          .title { font-size: 24px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 24px; text-align: center; }
          .welcome-text { font-size: 16px; line-height: 1.6; color: #475569; margin-bottom: 32px; }
          .credentials-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 32px; }
          .cred-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 15px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 12px; }
          .cred-row:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
          .cred-label { font-weight: 600; color: #64748b; }
          .cred-value { font-family: monospace; font-size: 15px; color: #0f172a; font-weight: 600; }
          .cta-wrapper { text-align: center; margin: 32px 0; }
          .cta-btn { display: inline-block; padding: 14px 32px; background: #2563eb; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; text-align: center; font-size: 15px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2); }
          .footer { padding: 32px; background: #f8fafc; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid #f1f5f9; }
          .footer-text { margin: 0 0 8px 0; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              ${logoHtml}
              <h2 class="company-name">${branding.companyName}</h2>
            </div>
            <div class="content">
              <h1 class="title">Portal Access Created</h1>
              <p class="welcome-text">Hi <strong>${greetingName}</strong>,<br><br>An account has been created for you to access the client portal of <strong>${branding.companyName}</strong>. Use the details below to sign in:</p>
              
              <div class="credentials-box">
                <div class="cred-row">
                  <span class="cred-label">Portal URL:</span>
                  <span class="cred-value" style="font-family: inherit;"><a href="${data.portalUrl}">${data.portalUrl}</a></span>
                </div>
                <div class="cred-row">
                  <span class="cred-label">Username:</span>
                  <span class="cred-value">${data.username}</span>
                </div>
                <div class="cred-row">
                  <span class="cred-label">Email:</span>
                  <span class="cred-value">${data.to}</span>
                </div>
                <div class="cred-row">
                  <span class="cred-label">Password:</span>
                  <span class="cred-value">${data.temporaryPassword}</span>
                </div>
              </div>

              <div class="cta-wrapper">
                <a href="${data.portalUrl}" class="cta-btn">Access Your Workspace</a>
              </div>
            </div>
            <div class="footer">
              <p class="footer-text">This is an automated mail, please do not reply.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Hi ${greetingName},

An account has been created for you to access the client portal of ${branding.companyName}.

Portal Login URL: ${data.portalUrl}
Username: ${data.username}
Email: ${data.to}
Password: ${data.temporaryPassword}
    `;

    return this.sendCentralizedMail({ to: data.to, tenantId, subject, html, text });
  }

  async sendPortalPasswordResetEmail(
    data: {
      to: string;
      displayName: string | null;
      username: string;
      temporaryPassword: string;
      portalUrl: string;
    },
    tenantId?: string,
  ): Promise<boolean> {
    const greetingName = data.displayName || data.username;
    const subject = "Your Zukvo portal password has been reset";

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #2563eb; color: white; padding: 28px 32px;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em;">Password reset</h1>
          <p style="margin: 6px 0 0; opacity: 0.9; font-size: 13.5px;">Your portal credentials have been updated.</p>
        </div>
        <div style="padding: 28px 32px; color: #0f172a; background-color: white;">
          <p style="margin: 0 0 16px; font-size: 15px;">Hi <strong>${greetingName}</strong>,</p>
          <p style="margin: 0 0 20px; line-height: 1.55; color: #475569; font-size: 14px;">
            An administrator has reset the password for your portal account. Use the temporary password below to sign in. You'll be asked to choose a new password on first sign-in.
          </p>

          <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 18px; margin: 18px 0;">
            <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">Username</div>
            <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; color: #0f172a; margin-bottom: 14px;">${data.username}</div>
            <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">Temporary password</div>
            <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 16px; font-weight: 600; color: #1d4ed8;">${data.temporaryPassword}</div>
          </div>

          <div style="margin: 24px 0; text-align: center;">
            <a href="${data.portalUrl}"
               style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
               Sign in to portal
            </a>
          </div>

          <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 14px; margin-top: 20px;">
            <p style="margin: 0; font-size: 12.5px; color: #92400e; line-height: 1.5;">
              <strong>Security note:</strong> If you did not request this reset, contact your account administrator immediately. Any previous active sessions have been signed out.
            </p>
          </div>

          <p style="margin: 24px 0 0; font-size: 12px; color: #94a3b8; text-align: center;">
            This is an automated notification — please do not reply to this email.
          </p>
        </div>
      </div>
    `;

    const text = `
Hi ${greetingName},

An administrator has reset the password for your portal account.

Username: ${data.username}
Temporary password: ${data.temporaryPassword}

Sign in here: ${data.portalUrl}

You'll be asked to choose a new password on first sign-in. Any previous active sessions have been signed out. If you did not request this reset, contact your account administrator immediately.
    `;

    return this.sendEmail({ to: data.to, subject, html, text }, tenantId);
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
