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
  cc?: string;
  replyTo?: string;
  attachments?: any[];
}

interface LeaveApplicationEmailData {
  to: string;
  managerName: string;
  employeeName: string;
  employeeEmail: string;
  cc?: string;
  replyTo?: string;
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
    let companyName = "Zukvo";
    let companyLogo = "";
    let replyToEmail = process.env.SYSTEM_EMAIL || "support@zukvo.com";
    let subdomain = "";

    if (tenantId) {
      try {
        const tenant = await prisma.tenant.findFirst({
          where: { id: tenantId },
        });

        if (tenant) {
          companyName = tenant.name || companyName;
          subdomain = tenant.subdomain || "";
          const settings = tenant.settings as any;
          if (settings && settings.logoUrl) {
            companyLogo = settings.logoUrl;
          }
        }
      } catch (error) {
        console.error("❌ Error resolving tenant branding:", error);
      }
    }

    return { companyName, companyLogo, replyToEmail, subdomain };
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

      const fromEmail = process.env.SYSTEM_EMAIL || process.env.SMTP_USER || "system@zukvo.com";
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
    const appDomain = process.env.APP_DOMAIN || "zukvo.com";
    const tenantHost = branding.subdomain
      ? `https://${branding.subdomain}.${appDomain}`
      : process.env.FRONTEND_URL || `https://${appDomain}`;
    const loginUrl = `${tenantHost}/login?email=${encodeURIComponent(data.email)}&password=${encodeURIComponent(data.password || '')}`;

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
              <h1 class="title">Welcome To Our ${branding.companyName}</h1>
              <p class="welcome-text">We are delighted to welcome <strong>${data.name}</strong> to our <strong>${branding.companyName}</strong> family. We look forward to the valuable contributions, fresh ideas, and positive impact <strong>${data.name}</strong> will bring to the organization. Wishing them a successful and exciting journey with us!</p>
              
              <div style="text-align: center; margin: 24px 0 32px;">
                <table cellpadding="0" cellspacing="0" style="border: none; border-collapse: collapse; margin: 0 auto; background-color: #e6f4ea; border-radius: 100px;">
                  <tr>
                    <td style="padding: 6px 0 6px 14px; vertical-align: middle;">
                      <table cellpadding="0" cellspacing="0" style="border: none; border-collapse: collapse; margin: 0; background-color: #137333; border-radius: 50%;">
                        <tr>
                          <td style="padding: 0; width: 16px; height: 16px; text-align: center; vertical-align: middle; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; font-weight: bold; color: #ffffff; line-height: 16px;">
                            ✓
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td style="padding: 6px 16px 6px 6px; vertical-align: middle; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13.5px; font-weight: 500; color: #137333; line-height: 1; white-space: nowrap;">
                      Verified Member
                    </td>
                  </tr>
                </table>
              </div>

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

    const text = `Welcome to Our ${branding.companyName}!

We are delighted to welcome ${data.name} to our ${branding.companyName} family. We look forward to the valuable contributions, fresh ideas, and positive impact ${data.name} will bring to the organization. Wishing them a successful and exciting journey with us!

Login Email: ${data.email}
${data.password ? `Password: ${data.password}` : ''}

Access your workspace here: ${loginUrl}

This is an automated mail, please do not reply.`;

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
      // ─── FLOW 1: Native OAuth Integration (Zoho, Google, Microsoft) ───────────────────────
      // Check if a mail account is connected for this tenant via OAuth.
      // If yes, use the respective MailProvider (OAuth token-based) — no passwords needed.
      if (tenantId) {
        try {
          let specificEmail = null;
          let extractedName = null;
          if (options.from) {
            const emailMatch = options.from.match(/<([^>]+)>/);
            specificEmail = emailMatch ? emailMatch[1].trim() : options.from.trim();
            const nameMatch = options.from.match(/^"([^"]+)"/);
            if (nameMatch) {
              extractedName = nameMatch[1];
            }
          }

          const whereClause: any = {
            tenant_id: tenantId,
            provider: { in: ['ZOHO', 'GOOGLE', 'MICROSOFT'] },
            is_active: true,
          };

          if (specificEmail) {
            whereClause.email = specificEmail;
          }

          const connectedAccount = await prisma.mail_accounts.findFirst({
            where: whereClause
          }) as any;

          if (connectedAccount) {
            console.log(`✅ ${connectedAccount.provider} Mail integration found: ${connectedAccount.email}. Sending via OAuth.`);
            const { UnifiedAuthService } = await import('../services/UnifiedAuthService');
            
            let providerInstance: any;
            
            if (connectedAccount.provider === 'ZOHO') {
              const { ZohoMailProvider } = await import('../services/mail/providers/ZohoMailProvider');
              providerInstance = new ZohoMailProvider();
            } else if (connectedAccount.provider === 'GOOGLE') {
              const { GoogleMailProvider } = await import('../services/mail/providers/GoogleMailProvider');
              providerInstance = new GoogleMailProvider();
            } else if (connectedAccount.provider === 'MICROSOFT') {
              const { MicrosoftMailProvider } = await import('../services/mail/providers/MicrosoftMailProvider');
              providerInstance = new MicrosoftMailProvider();
            }

            const accessToken = await UnifiedAuthService.getValidAccessToken(connectedAccount.user_id, connectedAccount.provider as any);
            const fromName = extractedName || process.env.SMTP_FROM_NAME || 'ZithSpace';
            const fromAddress = connectedAccount.email;

            await providerInstance.sendMessage(accessToken, {
              from: `"${fromName}" <${fromAddress}>`,
              to: options.to ? options.to.split(',').map((e: string) => e.trim()) : [],
              cc: options.cc ? options.cc.split(',').map((e: string) => e.trim()) : undefined,
              subject: options.subject,
              body: options.text,
              htmlBody: options.html,
            });

            console.log(`✅ Email sent via ${connectedAccount.provider} OAuth - From: ${fromAddress}, To: ${options.to}`);
            if (options.replyTo) console.log(`📧 Reply-To: ${options.replyTo}`);
            return true;
          } else {
            console.log(`ℹ️  No connected mail integration found for tenant ${tenantId}. Falling back to system transporter.`);
          }
        } catch (oauthError) {
          console.warn(`⚠️ Native OAuth send failed, falling back to system transporter:`, oauthError);
        }
      }

      // ─── FLOW 2: System SMTP Transporter (fallback) ───────────────────────────
      // Use centralized system transporter (SYSTEM_EMAIL / SYSTEM_APP_PASSWORD)
      await this.initializeSystemTransporter();

      const transporter = this.systemTransporter;

      if (!transporter) {
        console.log("\n📧 EMAIL NOTIFICATION (Not Sent - No System SMTP Config):");
        console.log("To:", options.to);
        console.log("Subject:", options.subject);
        console.log("Body:", options.text || options.html);
        console.log("---\n");
        return true;
      }

      // Always use the authenticated system email for the 'From' address to prevent SMTP relay errors (553)
      const fromAddress = process.env.SYSTEM_EMAIL || process.env.SMTP_FROM_EMAIL || "noreply@zithtech.com";
      const fromName = process.env.SMTP_FROM_NAME || "ZithSpace";

      let finalFrom = `"${fromName}" <${fromAddress}>`;
      let finalReplyTo = options.replyTo;

      if (options.from) {
        // If a custom 'from' is provided, we extract the name and email
        const emailMatch = options.from.match(/<([^>]+)>/);
        const specificEmail = emailMatch ? emailMatch[1].trim() : options.from.trim();
        
        const nameMatch = options.from.match(/^"([^"]+)"/);
        const extractedName = nameMatch ? nameMatch[1].trim() : null;

        // Display the custom name, but use the authenticated system email address
        const displayFromName = extractedName ? `${extractedName}` : fromName;
        finalFrom = `"${displayFromName}" <${fromAddress}>`;

        // Set the custom email as the Reply-To address so responses go to the correct person
        if (!finalReplyTo && specificEmail && specificEmail.includes('@')) {
          finalReplyTo = specificEmail;
        }
      }

      const mailOptions = {
        from: finalFrom,
        replyTo: finalReplyTo,
        to: options.to,
        cc: options.cc,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments
      };

      console.log(`📧 Sending via System SMTP Transporter - From: ${fromAddress}, To: ${mailOptions.to}`);

      const info = await transporter.sendMail(mailOptions);
      console.log("✅ Email sent successfully:", info.messageId);
      console.log(`📧 From: ${fromAddress}`);
      console.log(`📧 To: ${mailOptions.to}`);
      if (options.replyTo) console.log(`📧 Reply-To: ${options.replyTo}`);
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
            <p><strong>${data.employeeName
      }</strong> has submitted a new leave request that requires your approval.</p>
            
            <div class="detail-row">
              <span class="label">Employee:</span>
              <span class="value">${data.employeeName} (${data.employeeEmail
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
              <a href="${process.env.FRONTEND_URL || "http://localhost:3000"
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

${data.employeeName
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

    return this.sendEmail({ to: data.to, from: `"${data.employeeName}" <${data.employeeEmail}>`, cc: data.cc, replyTo: data.replyTo, subject, html, text }, tenantId);
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
            
            <p>Your leave request has been reviewed and approved by <strong>${data.approverName
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
            <p>Your leave request has been reviewed and rejected by <strong>${data.approverName
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

  // ═══════════════════════════════════════════════════════════════════════════
  // REIMBURSEMENT EMAIL METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  async sendClaimSubmissionEmail(data: {
    to: string;
    cc?: string;
    replyTo?: string;
    managerName: string;
    employeeName: string;
    employeeEmail: string;
    claimNo: string;
    title?: string | null;
    totalAmount: number;
    currency: string;
    itemCount: number;
  }, tenantId?: string): Promise<boolean> {
    const subject = `💼 New Expense Claim from ${data.employeeName} — ${data.claimNo}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #722ed1; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
          .detail-row { margin: 12px 0; padding: 10px; background-color: white; border-left: 3px solid #722ed1; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; margin-left: 10px; }
          .amount-box { background-color: #f3e8ff; border: 1px solid #d3adf7; padding: 15px; margin: 20px 0; border-radius: 5px; text-align: center; }
          .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h2>💼 New Expense Claim Submitted</h2></div>
          <div class="content">
            <p>Hi <strong>${data.managerName}</strong>,</p>
            <p><strong>${data.employeeName}</strong> has submitted an expense claim for your review and approval.</p>
            <div class="detail-row"><span class="label">Claim No:</span><span class="value">${data.claimNo}</span></div>
            ${data.title ? `<div class="detail-row"><span class="label">Title:</span><span class="value">${data.title}</span></div>` : ''}
            <div class="detail-row"><span class="label">Employee:</span><span class="value">${data.employeeName} (${data.employeeEmail})</span></div>
            <div class="detail-row"><span class="label">No. of Items:</span><span class="value">${data.itemCount}</span></div>
            <div class="amount-box">
              <div style="font-size:13px;color:#555;">Total Claim Amount</div>
              <div style="font-size:26px;font-weight:bold;color:#722ed1;">${data.currency} ${data.totalAmount.toFixed(2)}</div>
            </div>
            <p>Please log in to review and approve or reject this claim.</p>
          </div>
          <div class="footer"><p>This is an automated notification from ZithSpace Reimbursement.</p></div>
        </div>
      </body>
      </html>
    `;
    const text = `New Expense Claim from ${data.employeeName}\n\nClaim No: ${data.claimNo}\nEmployee: ${data.employeeName} (${data.employeeEmail})\nItems: ${data.itemCount}\nTotal: ${data.currency} ${data.totalAmount.toFixed(2)}\n\nPlease log in to approve or reject this claim.`;
    return this.sendEmail({ to: data.to, from: `"${data.employeeName}" <${data.employeeEmail}>`, cc: data.cc, replyTo: data.replyTo, subject, html, text }, tenantId);
  }

  async sendClaimApprovalEmail(data: {
    to: string;
    employeeName: string;
    approverName: string;
    claimNo: string;
    title?: string | null;
    totalAmount: number;
    currency: string;
    remarks?: string | null;
  }, tenantId?: string): Promise<boolean> {
    const subject = `✅ Your Expense Claim ${data.claimNo} has been Approved`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #52c41a; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
          .detail-row { margin: 12px 0; padding: 10px; background-color: white; border-left: 3px solid #52c41a; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; margin-left: 10px; }
          .success-box { background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 20px 0; border-radius: 5px; text-align: center; }
          .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h2>✅ Expense Claim Approved</h2></div>
          <div class="content">
            <p>Hi <strong>${data.employeeName}</strong>,</p>
            <p>Your expense claim has been approved by <strong>${data.approverName}</strong>.</p>
            <div class="detail-row"><span class="label">Claim No:</span><span class="value">${data.claimNo}</span></div>
            ${data.title ? `<div class="detail-row"><span class="label">Title:</span><span class="value">${data.title}</span></div>` : ''}
            <div class="success-box">
              <div style="font-size:13px;color:#155724;">Approved Amount</div>
              <div style="font-size:26px;font-weight:bold;color:#155724;">${data.currency} ${data.totalAmount.toFixed(2)}</div>
            </div>
            ${data.remarks ? `<div class="detail-row"><span class="label">Remarks:</span><span class="value">${data.remarks}</span></div>` : ''}
            <p>Your claim has been approved and will be processed for payment soon.</p>
          </div>
          <div class="footer"><p>This is an automated notification from ZithSpace Reimbursement.</p></div>
        </div>
      </body>
      </html>
    `;
    const text = `Your Expense Claim ${data.claimNo} has been Approved\n\nHi ${data.employeeName},\n\nYour claim has been approved by ${data.approverName}.\nAmount: ${data.currency} ${data.totalAmount.toFixed(2)}\n${data.remarks ? `Remarks: ${data.remarks}\n` : ''}`;
    return this.sendEmail({ to: data.to, subject, html, text }, tenantId);
  }

  async sendClaimRejectionEmail(data: {
    to: string;
    employeeName: string;
    approverName: string;
    claimNo: string;
    title?: string | null;
    totalAmount: number;
    currency: string;
    status: 'rejected' | 'cancelled' | 'sent_back';
    remarks?: string | null;
  }, tenantId?: string): Promise<boolean> {
    const statusLabel = data.status === 'sent_back' ? 'Sent Back for Revision' : data.status === 'cancelled' ? 'Cancelled' : 'Rejected';
    const headerColor = data.status === 'sent_back' ? '#fa8c16' : '#ff4d4f';
    const subject = `${data.status === 'sent_back' ? '🔄' : '❌'} Your Expense Claim ${data.claimNo} has been ${statusLabel}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: ${headerColor}; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
          .detail-row { margin: 12px 0; padding: 10px; background-color: white; border-left: 3px solid ${headerColor}; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; margin-left: 10px; }
          .remarks-box { background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h2>Claim ${statusLabel}</h2></div>
          <div class="content">
            <p>Hi <strong>${data.employeeName}</strong>,</p>
            <p>Your expense claim has been <strong>${statusLabel.toLowerCase()}</strong>${data.approverName ? ` by <strong>${data.approverName}</strong>` : ''}.</p>
            <div class="detail-row"><span class="label">Claim No:</span><span class="value">${data.claimNo}</span></div>
            ${data.title ? `<div class="detail-row"><span class="label">Title:</span><span class="value">${data.title}</span></div>` : ''}
            <div class="detail-row"><span class="label">Amount:</span><span class="value">${data.currency} ${data.totalAmount.toFixed(2)}</span></div>
            ${data.remarks ? `<div class="remarks-box"><strong>Remarks:</strong><br/>${data.remarks}</div>` : ''}
            <p>If you have any questions, please contact your manager or HR department.</p>
          </div>
          <div class="footer"><p>This is an automated notification from ZithSpace Reimbursement.</p></div>
        </div>
      </body>
      </html>
    `;
    const text = `Your Expense Claim ${data.claimNo} has been ${statusLabel}\n\nAmount: ${data.currency} ${data.totalAmount.toFixed(2)}\n${data.remarks ? `Remarks: ${data.remarks}` : ''}`;
    return this.sendEmail({ to: data.to, subject, html, text }, tenantId);
  }

  async sendAdvanceSubmissionEmail(data: {
    to: string;
    cc?: string;
    replyTo?: string;
    managerName: string;
    employeeName: string;
    employeeEmail: string;
    advanceNo: string;
    purpose?: string | null;
    amount: number;
    currency: string;
    neededBy?: string | null;
  }, tenantId?: string): Promise<boolean> {
    const subject = `💰 New Advance Request from ${data.employeeName} — ${data.advanceNo}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1677ff; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
          .detail-row { margin: 12px 0; padding: 10px; background-color: white; border-left: 3px solid #1677ff; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; margin-left: 10px; }
          .amount-box { background-color: #e6f4ff; border: 1px solid #91d5ff; padding: 15px; margin: 20px 0; border-radius: 5px; text-align: center; }
          .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h2>💰 New Advance Request</h2></div>
          <div class="content">
            <p>Hi <strong>${data.managerName}</strong>,</p>
            <p><strong>${data.employeeName}</strong> has requested a cash advance that requires your approval.</p>
            <div class="detail-row"><span class="label">Advance No:</span><span class="value">${data.advanceNo}</span></div>
            <div class="detail-row"><span class="label">Employee:</span><span class="value">${data.employeeName} (${data.employeeEmail})</span></div>
            ${data.purpose ? `<div class="detail-row"><span class="label">Purpose:</span><span class="value">${data.purpose}</span></div>` : ''}
            ${data.neededBy ? `<div class="detail-row"><span class="label">Needed By:</span><span class="value">${data.neededBy}</span></div>` : ''}
            <div class="amount-box">
              <div style="font-size:13px;color:#0050b3;">Requested Amount</div>
              <div style="font-size:26px;font-weight:bold;color:#1677ff;">${data.currency} ${data.amount.toFixed(2)}</div>
            </div>
            <p>Please log in to approve or reject this advance request.</p>
          </div>
          <div class="footer"><p>This is an automated notification from ZithSpace Reimbursement.</p></div>
        </div>
      </body>
      </html>
    `;
    const text = `New Advance Request from ${data.employeeName}\n\nAdvance No: ${data.advanceNo}\nEmployee: ${data.employeeName} (${data.employeeEmail})\nAmount: ${data.currency} ${data.amount.toFixed(2)}\n${data.purpose ? `Purpose: ${data.purpose}\n` : ''}${data.neededBy ? `Needed By: ${data.neededBy}\n` : ''}\nPlease log in to approve or reject.`;
    return this.sendEmail({ to: data.to, from: `"${data.employeeName}" <${data.employeeEmail}>`, cc: data.cc, replyTo: data.replyTo, subject, html, text }, tenantId);
  }

  async sendAdvanceApprovalEmail(data: {
    to: string;
    employeeName: string;
    approverName: string;
    advanceNo: string;
    amount: number;
    currency: string;
    remarks?: string | null;
  }, tenantId?: string): Promise<boolean> {
    const subject = `✅ Your Advance Request ${data.advanceNo} has been Approved`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #52c41a; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
          .detail-row { margin: 12px 0; padding: 10px; background-color: white; border-left: 3px solid #52c41a; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; margin-left: 10px; }
          .success-box { background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 20px 0; border-radius: 5px; text-align: center; }
          .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h2>✅ Advance Request Approved</h2></div>
          <div class="content">
            <p>Hi <strong>${data.employeeName}</strong>,</p>
            <p>Your advance request has been approved by <strong>${data.approverName}</strong>.</p>
            <div class="detail-row"><span class="label">Advance No:</span><span class="value">${data.advanceNo}</span></div>
            <div class="success-box">
              <div style="font-size:13px;color:#155724;">Approved Amount</div>
              <div style="font-size:26px;font-weight:bold;color:#155724;">${data.currency} ${data.amount.toFixed(2)}</div>
            </div>
            ${data.remarks ? `<div class="detail-row"><span class="label">Remarks:</span><span class="value">${data.remarks}</span></div>` : ''}
            <p>Your advance will be processed for payment shortly.</p>
          </div>
          <div class="footer"><p>This is an automated notification from ZithSpace Reimbursement.</p></div>
        </div>
      </body>
      </html>
    `;
    const text = `Your Advance Request ${data.advanceNo} has been Approved\n\nAmount: ${data.currency} ${data.amount.toFixed(2)}\n${data.remarks ? `Remarks: ${data.remarks}` : ''}`;
    return this.sendEmail({ to: data.to, subject, html, text }, tenantId);
  }

  async sendAdvanceRejectionEmail(data: {
    to: string;
    employeeName: string;
    approverName?: string;
    advanceNo: string;
    amount: number;
    currency: string;
    status: 'rejected' | 'cancelled';
    remarks?: string | null;
  }, tenantId?: string): Promise<boolean> {
    const statusLabel = data.status === 'cancelled' ? 'Cancelled' : 'Rejected';
    const subject = `❌ Your Advance Request ${data.advanceNo} has been ${statusLabel}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #ff4d4f; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
          .detail-row { margin: 12px 0; padding: 10px; background-color: white; border-left: 3px solid #ff4d4f; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; margin-left: 10px; }
          .remarks-box { background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h2>Advance Request ${statusLabel}</h2></div>
          <div class="content">
            <p>Hi <strong>${data.employeeName}</strong>,</p>
            <p>Your advance request has been <strong>${statusLabel.toLowerCase()}</strong>${data.approverName ? ` by <strong>${data.approverName}</strong>` : ''}.</p>
            <div class="detail-row"><span class="label">Advance No:</span><span class="value">${data.advanceNo}</span></div>
            <div class="detail-row"><span class="label">Amount:</span><span class="value">${data.currency} ${data.amount.toFixed(2)}</span></div>
            ${data.remarks ? `<div class="remarks-box"><strong>Remarks:</strong><br/>${data.remarks}</div>` : ''}
            <p>If you have any questions, please contact your manager or HR department.</p>
          </div>
          <div class="footer"><p>This is an automated notification from ZithSpace Reimbursement.</p></div>
        </div>
      </body>
      </html>
    `;
    const text = `Your Advance Request ${data.advanceNo} has been ${statusLabel}\n\nAmount: ${data.currency} ${data.amount.toFixed(2)}\n${data.remarks ? `Remarks: ${data.remarks}` : ''}`;
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
      from: data.from || process.env.SMTP_FROM_EMAIL || 'noreply@zukvo.com',
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
      escalation?: {
        id?: string;
        created_at?: any;
        status_name?: string | null;
        priority_name?: string | null;
        priority_color?: string | null;
        category_name?: string | null;
        project?: { name: string } | null;
        createdBy?: { name: string } | null;
        targetMembers?: {
          name?: string;
          user?: { name: string };
        }[] | null;
        tickets?: any[];
      };
      tickets?: { ticketNumber: string; title: string }[];
      attachments?: { filename: string; content: Buffer }[];
    },
    tenantId?: string
  ): Promise<boolean> {
    const branding = await this.resolveTenantMailBranding(tenantId);
    const subject = `[Escalation Raised] ${data.escalationSubject}`;

    const escalation = data.escalation || {};
    const escalationId = escalation.id ? escalation.id.slice(0, 8).toUpperCase() : "N/A";

    const formatRaisedDate = (dateVal: any) => {
      if (!dateVal) return "N/A";
      let dateObj: Date;
      try {
        if (dateVal instanceof Date) {
          // Since PostgreSQL timestamp columns are WITHOUT TIME ZONE,
          // the pg client parses them as local time (e.g. 10:35 local).
          // But they are actually stored in UTC. E.g. 10:35 UTC.
          // We construct a new Date object treating the local components of the date as UTC.
          const y = dateVal.getFullYear();
          const m = String(dateVal.getMonth() + 1).padStart(2, '0');
          const d = String(dateVal.getDate()).padStart(2, '0');
          const h = String(dateVal.getHours()).padStart(2, '0');
          const min = String(dateVal.getMinutes()).padStart(2, '0');
          const s = String(dateVal.getSeconds()).padStart(2, '0');
          dateObj = new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`);
        } else {
          // If it is a string, append 'Z' if it doesn't have a timezone indicator to treat it as UTC
          let dateStr = String(dateVal);
          if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('GMT')) {
            dateStr = dateStr.includes('T') ? `${dateStr}Z` : `${dateStr.replace(' ', 'T')}Z`;
          }
          dateObj = new Date(dateStr);
        }

        const options: Intl.DateTimeFormatOptions = {
          timeZone: 'Asia/Kolkata',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(dateObj);
        const findVal = (type: string) => parts.find(p => p.type === type)?.value || '';
        const month = findVal('month');
        const day = findVal('day');
        const year = findVal('year');
        const hour = findVal('hour').padStart(2, '0');
        const minute = findVal('minute').padStart(2, '0');
        return `${month} ${day}, ${year} at ${hour}:${minute}`;
      } catch (e) {
        console.error("❌ Error formatting date in formatRaisedDate:", e);
        const dObj = new Date(dateVal);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const hour = String(dObj.getHours()).padStart(2, "0");
        const minute = String(dObj.getMinutes()).padStart(2, "0");
        return `${monthNames[dObj.getMonth()]} ${dObj.getDate()}, ${dObj.getFullYear()} at ${hour}:${minute}`;
      }
    };

    const raisedOnStr = formatRaisedDate(escalation.created_at || new Date());

    const resolveCssVariableColor = (colorStr: string): string => {
      if (!colorStr) return "#dc2626";
      const cleanColor = colorStr.trim().toLowerCase();
      if (cleanColor.includes('var(')) {
        const match = cleanColor.match(/var\(([^)]+)\)/);
        if (match && match[1]) {
          const varName = match[1].trim();
          const variableMap: Record<string, string> = {
            '--premium-blue': '#3b82f6',
            '--premium-purple': '#8b5cf6',
            '--premium-red': '#ef4444',
            '--premium-orange': '#f97316',
            '--premium-green': '#10b981',
            '--premium-bg-light': '#ffffff',
            '--premium-bg-dark': '#0b0f1a'
          };
          return variableMap[varName] || '#dc2626';
        }
      }
      return colorStr;
    };

    const isLightColor = (hex: string) => {
      if (!hex || hex === 'transparent' || hex === 'white') return true;
      const cleanHex = hex.replace('#', '');
      if (cleanHex.length !== 3 && cleanHex.length !== 6) return false;
      const r = parseInt(cleanHex.length === 3 ? cleanHex[0] + cleanHex[0] : cleanHex.substring(0, 2), 16);
      const g = parseInt(cleanHex.length === 3 ? cleanHex[1] + cleanHex[1] : cleanHex.substring(2, 4), 16);
      const b = parseInt(cleanHex.length === 3 ? cleanHex[2] + cleanHex[2] : cleanHex.substring(4, 6), 16);
      const hsp = Math.sqrt(
        0.299 * (r * r) +
        0.587 * (g * g) +
        0.114 * (b * b)
      );
      return hsp > 200;
    };

    const priorityName = escalation.priority_name || "Medium";
    let priorityColor = resolveCssVariableColor(escalation.priority_color || "#dc2626");

    // Force red color (#dc2626) for high/critical priority levels or if name is skyfall/high/p0/p1
    const lowerPriorityName = priorityName.toLowerCase();
    if (
      lowerPriorityName.includes('high') ||
      lowerPriorityName.includes('skyfall') ||
      lowerPriorityName.includes('critical') ||
      lowerPriorityName.includes('p0') ||
      lowerPriorityName.includes('p1') ||
      isLightColor(priorityColor)
    ) {
      priorityColor = "#dc2626";
    }

    const targetMembersStr = escalation.targetMembers && escalation.targetMembers.length > 0
      ? escalation.targetMembers.map((m: any) => m.user?.name || m.name || "").filter(Boolean).join(", ")
      : "N/A";

    const creatorName = escalation.createdBy?.name || data.creatorName || "N/A";
    const tickets = escalation.tickets || data.tickets || [];
    const attachments = data.attachments || [];

    const logoHtml = branding.companyLogo
      ? `<img class="logo" src="${branding.companyLogo}" alt="${branding.companyName}" style="max-height: 40px; border-radius: 6px; vertical-align: middle;" />`
      : "";

    let ticketsHtml = "";
    let ticketsText = "";
    if (tickets && tickets.length > 0) {
      ticketsHtml = `
        <div class="divider"></div>
        <div style="margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #64748b; line-height: 1.2;">
          <span style="display: inline-block; vertical-align: middle; font-size: 14px; width: 21px; text-align: left;">🎟️</span><span style="display: inline-block; vertical-align: middle;">Linked Tickets</span>
        </div>
        <div style="margin-top: 8px; padding-left: 21px;">
          ${tickets.map(t => {
        const ticketNum = t.ticket?.ticketNumber || t.ticketNumber || "";
        const ticketTitle = t.ticket?.title || t.title || "";
        return `
              <div class="ticket-row">
                <strong class="ticket-num">${ticketNum}</strong> ${ticketTitle}
              </div>
            `;
      }).join("")}
        </div>
      `;
      ticketsText = `\nLinked Tickets:\n` + tickets.map(t => `- [${t.ticket?.ticketNumber || t.ticketNumber}] ${t.ticket?.title || t.title}`).join("\n");
    }

    let attachmentsHtml = "";
    if (attachments && attachments.length > 0) {
      attachmentsHtml = `
        <div class="divider"></div>
        <div style="margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #64748b; line-height: 1.2;">
          <span style="display: inline-block; vertical-align: middle; font-size: 14px; width: 21px; text-align: left;">📎</span><span style="display: inline-block; vertical-align: middle;">Attachments</span>
        </div>
        <div style="margin-top: 8px; padding-left: 21px;">
          ${attachments.map(att => `
            <div style="font-size: 13.5px; color: #334155; padding: 6px 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; display: inline-block; margin-right: 8px; margin-bottom: 8px;">
              <span style="margin-right: 6px; font-size: 14px;">📄</span><strong>${att.filename}</strong>
            </div>
          `).join("")}
        </div>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
          .wrapper { width: 100%; background-color: #f8fafc; padding: 40px 0; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          .header { padding: 24px 32px; border-bottom: 1px solid #f1f5f9; background-color: #ffffff; }
          .company-name { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0; }
          .content { padding: 32px; }
          
          .divider { border-bottom: 1px solid #f1f5f9; margin: 20px 0; }
          .label { font-size: 13px; font-weight: 600; color: #64748b; display: block; margin-bottom: 6px; }
          .subject-value { font-size: 16px; font-weight: 600; color: #0f172a; }
          
          .status-pill { display: inline-block; border: 1px solid #e2e8f0; border-radius: 6px; padding: 3px 8px; background-color: #ffffff; color: #475569; font-weight: 500; font-size: 12px; }
          
          .description-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 8px; color: #334155; font-size: 14px; white-space: pre-line; line-height: 1.6; }
          
          .ticket-row { font-size: 13.5px; color: #334155; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 8px; }
          .ticket-num { color: #dc2626; font-weight: 700; margin-right: 6px; }
          
          .footer-section { padding: 24px 32px; background-color: #fafafa; border-top: 1px solid #f1f5f9; }
          .last-updated { font-size: 12px; color: #94a3b8; margin-bottom: 12px; }
          .auto-disclaimer { font-size: 11px; color: #94a3b8; margin: 0; }
          @media (prefers-color-scheme: dark) {
            .priority-badge {
              color: #ffffff !important;
              background-color: ${priorityColor} !important;
            }
          }
          [data-ogsc] .priority-badge {
            color: #ffffff !important;
            background-color: ${priorityColor} !important;
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              <table cellpadding="0" cellspacing="0" style="width: 100%; border: none; border-collapse: collapse;">
                <tr>
                  <td style="vertical-align: middle;">
                    ${logoHtml}
                    <span style="font-size: 18px; font-weight: 700; color: #0f172a; vertical-align: middle; display: inline-block; margin-left: ${branding.companyLogo ? '8px' : '0px'};">${branding.companyName}</span>
                  </td>
                </tr>
              </table>
            </div>
            
            <div class="content">
              <table cellpadding="0" cellspacing="0" style="width: 100%; border: none; border-collapse: collapse; margin-bottom: 6px;">
                <tr>
                  <td style="vertical-align: middle;">
                    <table cellpadding="0" cellspacing="0" style="display: inline-block; vertical-align: middle; margin-right: 8px; border-collapse: collapse; border: none;">
                      <tr>
                        <td style="width: 22px; height: 22px; background-color: #dc2626; border-radius: 50%; text-align: center; vertical-align: middle; color: #ffffff; font-size: 14px; font-weight: bold; line-height: 22px;">!</td>
                      </tr>
                    </table>
                    <span style="font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.2; vertical-align: middle;">
                      Escalation Notification
                    </span>
                  </td>
                  <td style="text-align: right; vertical-align: middle;">
                    <span class="priority-badge" style="display: inline-block; background-color: ${priorityColor}; color: #ffffff; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.05em; line-height: 1;">
                      ${priorityName}
                    </span>
                  </td>
                </tr>
              </table>
              <div style="font-size: 12.5px; color: #64748b; margin-top: 8px;">
                ID: ${escalationId} &nbsp;&bull;&nbsp; Raised on ${raisedOnStr}
              </div>
              
              <div class="divider"></div>
              
              <span class="label">Subject</span>
              <div class="subject-value">${data.escalationSubject}</div>
              
              <div class="divider"></div>
              
              <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; border: none;">
                <tr>
                  <td style="width: 50%; padding: 12px 10px 12px 0; vertical-align: top;">
                    <div style="margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #64748b; line-height: 1.2;">
                      <span style="display: inline-block; vertical-align: middle; font-size: 14px; width: 21px; text-align: left;">🏷️</span><span style="display: inline-block; vertical-align: middle;">Current Status</span>
                    </div>
                    <div style="padding-left: 21px;">
                      <span class="status-pill">${escalation.status_name || "Open"}</span>
                    </div>
                  </td>
                  <td style="width: 50%; padding: 12px 0 12px 10px; vertical-align: top;">
                    <div style="margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #64748b; line-height: 1.2;">
                      <span style="display: inline-block; vertical-align: middle; font-size: 14px; width: 21px; text-align: left;">⏱️</span><span style="display: inline-block; vertical-align: middle;">Priority</span>
                    </div>
                    <div style="padding-left: 21px;">
                      <span class="priority-badge" style="display: inline-block; background-color: ${priorityColor}; color: #ffffff; border-radius: 6px; padding: 3px 8px; font-weight: 700; font-size: 11px; text-transform: uppercase; line-height: 1.2;">
                        ${priorityName}
                      </span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="width: 50%; padding: 12px 10px 12px 0; vertical-align: top;">
                    <div style="margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #64748b; line-height: 1.2;">
                      <span style="display: inline-block; vertical-align: middle; font-size: 14px; width: 21px; text-align: left;">🏷️</span><span style="display: inline-block; vertical-align: middle;">Category</span>
                    </div>
                    <div style="padding-left: 21px;">
                      <span style="font-size: 14px; font-weight: 600; color: #0f172a; line-height: 1.4; display: block;">${escalation.category_name || "General"}</span>
                    </div>
                  </td>
                  <td style="width: 50%; padding: 12px 0 12px 10px; vertical-align: top;">
                    <div style="margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #64748b; line-height: 1.2;">
                      <span style="display: inline-block; vertical-align: middle; font-size: 14px; width: 21px; text-align: left;">📁</span><span style="display: inline-block; vertical-align: middle;">Project</span>
                    </div>
                    <div style="padding-left: 21px;">
                      <span style="font-size: 14px; font-weight: 600; color: #0f172a; line-height: 1.4; display: block;">${escalation.project?.name || "N/A"}</span>
                    </div>
                  </td>
                </tr>
              </table>
              
              <div class="divider"></div>
              
              <span class="label">Detailed Description</span>
              <div class="description-box">${data.description}</div>
              
              ${ticketsHtml}
              ${attachmentsHtml}
              
              <div class="divider"></div>
              
              <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; border: none;">
                <tr>
                  <td style="width: 50%; padding: 12px 10px 0 0; vertical-align: top;">
                    <div style="margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #64748b; line-height: 1.2;">
                      <span style="display: inline-block; vertical-align: middle; font-size: 14px; width: 21px; text-align: left;">👥</span><span style="display: inline-block; vertical-align: middle;">Target Team Members</span>
                    </div>
                    <div style="padding-left: 21px;">
                      <span style="font-size: 14px; font-weight: 600; color: #0f172a; line-height: 1.4; display: block;">${targetMembersStr}</span>
                    </div>
                  </td>
                  <td style="width: 50%; padding: 12px 0 0 10px; vertical-align: top;">
                    <div style="margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #64748b; line-height: 1.2;">
                      <span style="display: inline-block; vertical-align: middle; font-size: 14px; width: 21px; text-align: left;">👤</span><span style="display: inline-block; vertical-align: middle;">Raised By</span>
                    </div>
                    <div style="padding-left: 21px;">
                      <span style="font-size: 14px; font-weight: 600; color: #0f172a; line-height: 1.4; display: block;">${creatorName}</span>
                    </div>
                  </td>
                </tr>
              </table>
            </div>
            
            <div class="footer-section">
              <div class="last-updated">
                🕒 Last Updated: Just now
              </div>
              <p class="auto-disclaimer">
                This is an automated notification from ${branding.companyName} — please do not reply directly to this email.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `Escalation Notification

Raised on ${raisedOnStr}
Escalation ID: ${escalationId}
Priority: ${priorityName}

Hi ${data.userName},

An escalation has been raised by ${creatorName}.

Subject: ${data.escalationSubject}
Category: ${escalation.category_name || "General"}
Project: ${escalation.project?.name || "N/A"}
Status: ${escalation.status_name || "Open"}

Description:
${data.description}
${ticketsText}

Target Team Members: ${targetMembersStr}
Raised By: ${creatorName}

This is an automated notification from ${branding.companyName}.`;

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
    const portalUrlWithParams = `${data.portalUrl}?username=${encodeURIComponent(data.username)}&password=${encodeURIComponent(data.temporaryPassword)}`;

    const logoHtml = branding.companyLogo
      ? `<img class="logo" src="${branding.companyLogo}" alt="${branding.companyName}" style="max-height: 50px; border-radius: 8px; margin-bottom: 8px;" />`
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
          .header { padding: 32px 40px; text-align: center; border-bottom: 1px solid #f1f5f9; background-color: #ffffff; }
          .company-name { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0; }
          .content { padding: 40px 48px; }
          .title { font-size: 26px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 8px; text-align: center; }
          .accent-bar { width: 32px; height: 3px; background-color: #0b57d0; margin: 8px auto 24px; border-radius: 2px; }
          .welcome-greeting { text-align: center; font-size: 15px; color: #64748b; margin: 0 0 12px 0; }
          .welcome-text { text-align: center; font-size: 14.5px; line-height: 1.6; color: #64748b; margin: 0 auto 32px; max-width: 480px; }
          
          .credentials-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px 24px; margin-bottom: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.01); }
          .cred-table { width: 100%; border-collapse: collapse; border: none; }
          .cred-row { border-bottom: 1px dashed #e2e8f0; }
          .cred-row-last { border-bottom: none; }
          .cred-label { padding: 16px 0; font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 0.05em; text-transform: uppercase; width: 30%; }
          .cred-value { padding: 16px 0; text-align: right; font-size: 13.5px; font-weight: 500; color: #475569; }
          .cred-link { color: #0b57d0; text-decoration: none; word-break: break-all; }
          .code-pill { display: inline-block; padding: 4px 8px; background-color: #f1f3f5; border-radius: 4px; font-family: monospace; font-size: 13px; color: #475569; font-weight: 600; line-height: 1; }
          
          .cta-wrapper { text-align: center; margin: 36px 0 16px; }
          .cta-btn { display: inline-block; padding: 14px 32px; background-color: #0b57d0; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; text-align: center; font-size: 15px; box-shadow: 0 4px 12px rgba(11, 87, 208, 0.25); }
          .trouble-text { text-align: center; font-size: 13px; color: #94a3b8; margin: 0 0 32px 0; }
          .trouble-link { color: #0b57d0; text-decoration: none; font-weight: 500; }
          
          .footer-section { padding: 32px; background-color: #fafafa; text-align: center; border-top: 1px solid #f1f5f9; }
          .auto-mail-table { border: none; border-collapse: collapse; margin: 0 auto 16px; }
          .info-icon { padding: 0; vertical-align: middle; font-size: 14px; color: #94a3b8; line-height: 1; }
          .info-text { padding: 0 0 0 6px; vertical-align: middle; font-family: monospace; font-size: 12px; color: #94a3b8; line-height: 1; }
          .footer-links { margin-bottom: 16px; font-size: 12px; font-weight: 500; }
          .footer-link { color: #64748b; text-decoration: none; margin: 0 10px; }
          .copyright { margin: 0; font-size: 12px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              ${logoHtml}
              ${!branding.companyLogo ? `<h2 class="company-name">${branding.companyName}</h2>` : ""}
            </div>
            <div class="content">
              <h1 class="title">Client Portal Access</h1>
              <div class="accent-bar"></div>
              
              <p class="welcome-greeting">Hi <strong>${greetingName}</strong>,</p>
              <p class="welcome-text">An account has been created for you to access the client portal of <strong>${branding.companyName}</strong>.<br>Use the details below to sign in:</p>
              
              <div class="credentials-card">
                <table class="cred-table">
                  <tr class="cred-row">
                    <td class="cred-label">PORTAL URL</td>
                    <td class="cred-value"><a href="${portalUrlWithParams}" class="cred-link">${data.portalUrl}</a></td>
                  </tr>
                  <tr class="cred-row">
                    <td class="cred-label">USERNAME</td>
                    <td class="cred-value"><span class="code-pill">${data.username}</span></td>
                  </tr>
                  <tr class="cred-row">
                    <td class="cred-label">EMAIL</td>
                    <td class="cred-value">${data.to}</td>
                  </tr>
                  <tr class="cred-row-last">
                    <td class="cred-label">PASSWORD</td>
                    <td class="cred-value"><span class="code-pill">${data.temporaryPassword}</span></td>
                  </tr>
                </table>
              </div>

              <div class="cta-wrapper">
                <a href="${portalUrlWithParams}" class="cta-btn">Access Your Workspace &nbsp;&nbsp;➔</a>
              </div>
              
              <p class="trouble-text">Having trouble? <a href="mailto:${branding.replyToEmail}" class="trouble-link">Contact Support</a></p>
            </div>
            
            <div class="footer-section">
              <table class="auto-mail-table">
                <tr>
                  <td class="info-icon">ⓘ</td>
                  <td class="info-text">This is an automated mail.</td>
                </tr>
              </table>
              <div class="footer-links">
                <a href="#" class="footer-link">Privacy Policy</a>
                <a href="mailto:${branding.replyToEmail}" class="footer-link">Support</a>
                <a href="#" class="footer-link">Terms of Service</a>
              </div>
              <p class="copyright">&copy; ${new Date().getFullYear()} ${branding.companyName}. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `Client Portal Access

Hi ${greetingName},

An account has been created for you to access the client portal of ${branding.companyName}.

Portal URL: ${data.portalUrl}
Username: ${data.username}
Email: ${data.to}
Password: ${data.temporaryPassword}

Access your workspace here: ${portalUrlWithParams}

This is an automated mail, please do not reply.`;

    return this.sendCentralizedMail({ to: data.to, tenantId, subject, html, text });
  }

  async sendPasswordResetEmail(
    data: {
      to: string;
      displayName: string | null;
      username: string;
      resetLink: string;
    },
    tenantId?: string,
  ): Promise<boolean> {
    const greetingName = data.displayName || data.username;
    const branding = await this.resolveTenantMailBranding(tenantId);
    const subject = `Reset your ${branding.companyName} password`;

    const logoHtml = branding.companyLogo
      ? `<img class="logo" src="${branding.companyLogo}" alt="${branding.companyName}" style="max-height: 50px; border-radius: 8px; margin-bottom: 8px;" />`
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
          .header { padding: 32px 40px; text-align: center; border-bottom: 1px solid #f1f5f9; background-color: #ffffff; }
          .company-name { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0; }
          .content { padding: 40px 48px; }
          .title { font-size: 26px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 8px; text-align: center; }
          .accent-bar { width: 32px; height: 3px; background-color: #0b57d0; margin: 8px auto 24px; border-radius: 2px; }
          .welcome-greeting { text-align: center; font-size: 15px; color: #64748b; margin: 0 0 12px 0; }
          .welcome-text { text-align: center; font-size: 14.5px; line-height: 1.6; color: #64748b; margin: 0 auto 32px; max-width: 480px; }
          
          .reset-button { display: inline-block; background-color: #0b57d0; color: #ffffff; text-decoration: none; font-size: 14.5px; font-weight: 600; padding: 12px 28px; border-radius: 8px; box-shadow: 0 2px 4px rgba(11, 87, 208, 0.1); margin: 0 auto; text-align: center; }
          .reset-button:hover { background-color: #0842a0; }
          
          .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 40px; text-align: center; }
          .footer-text { font-size: 13px; color: #64748b; margin: 0 0 8px 0; line-height: 1.5; }
          .warning-text { font-size: 12.5px; color: #94a3b8; margin: 0; font-style: italic; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              ${logoHtml}
              ${!branding.companyLogo ? `<h1 class="company-name">${branding.companyName}</h1>` : ""}
            </div>
            
            <div class="content">
              <h2 class="title">Reset Your Password</h2>
              <div class="accent-bar"></div>
              
              <p class="welcome-greeting">Hello ${greetingName},</p>
              
              <p class="welcome-text">
                We received a request to reset the password for your ${branding.companyName} account associated with <strong>${data.username}</strong>. 
                If you didn't make this request, you can safely ignore this email.
              </p>
              
              <div style="text-align: center; margin-top: 32px; margin-bottom: 32px;">
                <a href="${data.resetLink}" class="reset-button" style="color: #ffffff !important; text-decoration: none;">Reset Password</a>
              </div>

              <p class="welcome-text" style="font-size: 13px;">
                Or copy and paste this link into your browser:<br>
                <a href="${data.resetLink}" style="color: #0b57d0; word-break: break-all;">${data.resetLink}</a>
              </p>
              
              <p class="welcome-text" style="font-size: 13px; font-weight: 600; margin-bottom: 0;">
                This link will expire in 30 minutes.
              </p>
            </div>
            
            <div class="footer">
              <p class="footer-text">Powered by <strong>ZithSpace</strong></p>
              <p class="warning-text">This is an automated message. Please do not reply directly to this email.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `Reset your ${branding.companyName} password

Hello ${greetingName},

We received a request to reset the password for your ${branding.companyName} account associated with ${data.username}.

Please click the following link to reset your password (or copy and paste it into your browser):
${data.resetLink}

This link will expire in 30 minutes.

If you didn't request a password reset, you can safely ignore this email.

Powered by ZithSpace
This is an automated mail, please do not reply.`;

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
    const branding = await this.resolveTenantMailBranding(tenantId);
    const subject = `Your ${branding.companyName} portal password has been reset`;
    const portalUrlWithParams = `${data.portalUrl}?username=${encodeURIComponent(data.username)}&password=${encodeURIComponent(data.temporaryPassword)}`;

    const logoHtml = branding.companyLogo
      ? `<img class="logo" src="${branding.companyLogo}" alt="${branding.companyName}" style="max-height: 50px; border-radius: 8px; margin-bottom: 8px;" />`
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
          .header { padding: 32px 40px; text-align: center; border-bottom: 1px solid #f1f5f9; background-color: #ffffff; }
          .company-name { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0; }
          .content { padding: 40px 48px; }
          .title { font-size: 26px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 8px; text-align: center; }
          .accent-bar { width: 32px; height: 3px; background-color: #0b57d0; margin: 8px auto 24px; border-radius: 2px; }
          .welcome-greeting { text-align: center; font-size: 15px; color: #64748b; margin: 0 0 12px 0; }
          .welcome-text { text-align: center; font-size: 14.5px; line-height: 1.6; color: #64748b; margin: 0 auto 32px; max-width: 480px; }
          
          .credentials-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px 24px; margin-bottom: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.01); }
          .cred-table { width: 100%; border-collapse: collapse; border: none; }
          .cred-row { border-bottom: 1px dashed #e2e8f0; }
          .cred-row-last { border-bottom: none; }
          .cred-label { padding: 16px 0; font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 0.05em; text-transform: uppercase; width: 30%; }
          .cred-value { padding: 16px 0; text-align: right; font-size: 13.5px; font-weight: 500; color: #475569; }
          .cred-link { color: #0b57d0; text-decoration: none; word-break: break-all; }
          .code-pill { display: inline-block; padding: 4px 8px; background-color: #f1f3f5; border-radius: 4px; font-family: monospace; font-size: 13px; color: #475569; font-weight: 600; line-height: 1; }
          
          .cta-wrapper { text-align: center; margin: 36px 0 16px; }
          .cta-btn { display: inline-block; padding: 14px 32px; background-color: #0b57d0; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; text-align: center; font-size: 15px; box-shadow: 0 4px 12px rgba(11, 87, 208, 0.25); }
          
          .note-card { background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-top: 24px; text-align: left; }
          .note-text { margin: 0; font-size: 12.5px; color: #92400e; line-height: 1.5; }
          
          .footer-section { padding: 32px; background-color: #fafafa; text-align: center; border-top: 1px solid #f1f5f9; }
          .auto-mail-table { border: none; border-collapse: collapse; margin: 0 auto 16px; }
          .info-icon { padding: 0; vertical-align: middle; font-size: 14px; color: #94a3b8; line-height: 1; }
          .info-text { padding: 0 0 0 6px; vertical-align: middle; font-family: monospace; font-size: 12px; color: #94a3b8; line-height: 1; }
          .footer-links { margin-bottom: 16px; font-size: 12px; font-weight: 500; }
          .footer-link { color: #64748b; text-decoration: none; margin: 0 10px; }
          .copyright { margin: 0; font-size: 12px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              ${logoHtml}
              ${!branding.companyLogo ? `<h2 class="company-name">${branding.companyName}</h2>` : ""}
            </div>
            <div class="content">
              <h1 class="title">Password Reset</h1>
              <div class="accent-bar"></div>
              
              <p class="welcome-greeting">Hi <strong>${greetingName}</strong>,</p>
              <p class="welcome-text">An administrator has reset the password for your portal account.<br>Use the details below to sign in:</p>
              
              <div class="credentials-card">
                <table class="cred-table">
                  <tr class="cred-row">
                    <td class="cred-label">PORTAL URL</td>
                    <td class="cred-value"><a href="${portalUrlWithParams}" class="cred-link">${data.portalUrl}</a></td>
                  </tr>
                  <tr class="cred-row">
                    <td class="cred-label">USERNAME</td>
                    <td class="cred-value"><span class="code-pill">${data.username}</span></td>
                  </tr>
                  <tr class="cred-row-last">
                    <td class="cred-label">PASSWORD</td>
                    <td class="cred-value"><span class="code-pill">${data.temporaryPassword}</span></td>
                  </tr>
                </table>
              </div>

              <div class="cta-wrapper">
                <a href="${portalUrlWithParams}" class="cta-btn">Sign in to Portal &nbsp;&nbsp;➔</a>
              </div>
              
              <div class="note-card">
                <p class="note-text">
                  <strong>Security note:</strong> If you did not request this reset, contact your account administrator immediately. Any previous active sessions have been signed out. You'll be asked to choose a new password on your first sign-in.
                </p>
              </div>
            </div>
            
            <div class="footer-section">
              <table class="auto-mail-table">
                <tr>
                  <td class="info-icon">ⓘ</td>
                  <td class="info-text">This is an automated mail.</td>
                </tr>
              </table>
              <div class="footer-links">
                <a href="#" class="footer-link">Privacy Policy</a>
                <a href="mailto:${branding.replyToEmail}" class="footer-link">Support</a>
                <a href="#" class="footer-link">Terms of Service</a>
              </div>
              <p class="copyright">&copy; ${new Date().getFullYear()} ${branding.companyName}. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `Password Reset

Hi ${greetingName},

An administrator has reset the password for your portal account.

Username: ${data.username}
Temporary password: ${data.temporaryPassword}

Sign in here: ${portalUrlWithParams}

You'll be asked to choose a new password on first sign-in. Any previous active sessions have been signed out. If you did not request this reset, contact your account administrator immediately.`;

    return this.sendCentralizedMail({ to: data.to, tenantId, subject, html, text });
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
