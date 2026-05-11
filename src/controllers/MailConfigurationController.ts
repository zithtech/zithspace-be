import { Response } from 'express';
import { 
  MailProvider,
  TestStatus,
  CreateMailConfigurationData,
  UpdateMailConfigurationData,
  getMailConfigurationByTenantId,
  getMailConfigurationById,
  createMailConfiguration,
  updateMailConfiguration,
  updateMailConfigurationById,
  deleteMailConfiguration,
  deleteMailConfigurationById,
  updateTestStatus,
  mailConfigurationExists,
  getActiveMailConfiguration,
  getAllMailConfigurations
} from '../models/mailConfiguration.model';
import { 
  AuthRequest, 
  ApiResponse, 
  NotFoundError, 
  ValidationError,
  AuthorizationError
} from '../types';
import { encrypt, decrypt } from '../utils/encryption';
import nodemailer from 'nodemailer';

export class MailConfigurationController {

  /**
   * Get mail configuration for the current tenant
   */
  static async getMailConfiguration(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.user?.tenantId;
      
      if (!tenantId) {
        throw new ValidationError('Tenant ID is required');
      }

      const mailConfig = await getMailConfigurationByTenantId(tenantId);

      const response: ApiResponse = {
        success: true,
        message: 'Mail configuration retrieved successfully',
        data: mailConfig
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching mail configuration:', error);
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message,
          data: null
        });
      }

      const response: ApiResponse = {
        success: false,
        message: 'Failed to fetch mail configuration',
        data: null
      };
      res.status(500).json(response);
    }
  }

  /**
   * Create or update mail configuration
   */
  static async upsertMailConfiguration(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.id;
      
      if (!tenantId || !userId) {
        throw new ValidationError('Tenant ID and User ID are required');
      }

      const {
        provider,
        email,
        smtpHost,
        smtpPort,
        smtpUsername,
        smtpPassword,
        enableSsl,
        defaultFromEmail,
        isActive,
        metadata
      } = req.body;

      // Validation
      if (!provider || !Object.values(MailProvider).includes(provider)) {
        throw new ValidationError('Valid provider is required (GOOGLE, MICROSOFT, ZOHO)');
      }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ValidationError('Valid email address is required');
      }

      if (!smtpHost) {
        throw new ValidationError('SMTP host is required');
      }

      if (!smtpPort || smtpPort < 1 || smtpPort > 65535) {
        throw new ValidationError('Valid SMTP port (1-65535) is required');
      }

      if (!smtpUsername) {
        throw new ValidationError('SMTP username is required');
      }

      // Password is only required when creating new config or when explicitly changing it
      // For updates, if password is not provided, we'll preserve the existing one

      if (!defaultFromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(defaultFromEmail)) {
        throw new ValidationError('Valid default from email is required');
      }

      // Encrypt the password before storing
      const encryptedPassword = encrypt(smtpPassword);

      const configExists = await mailConfigurationExists(tenantId);

      let mailConfig;
      
      if (configExists) {
        // Update existing configuration
        const updateData: UpdateMailConfigurationData = {
          provider,
          email,
          smtpHost,
          smtpPort,
          smtpUsername,
          smtpPassword: encryptedPassword,
          enableSsl: enableSsl !== undefined ? enableSsl : true,
          defaultFromEmail,
          isActive: isActive !== undefined ? isActive : true,
          metadata: metadata || null,
          updatedBy: userId
        };

        mailConfig = await updateMailConfiguration(tenantId, updateData);
      } else {
        // Create new configuration
        const createData: CreateMailConfigurationData = {
          tenantId,
          provider,
          email,
          smtpHost,
          smtpPort,
          smtpUsername,
          smtpPassword: encryptedPassword,
          enableSsl: enableSsl !== undefined ? enableSsl : true,
          defaultFromEmail,
          isActive: isActive !== undefined ? isActive : true,
          metadata: metadata || null,
          createdBy: userId
        };

        mailConfig = await createMailConfiguration(createData);
      }

      // Don't send the encrypted password back to the client
      if (mailConfig) {
        mailConfig.smtpPassword = '';
      }

      const response: ApiResponse = {
        success: true,
        message: configExists ? 'Mail configuration updated successfully' : 'Mail configuration created successfully',
        data: mailConfig
      };

      res.json(response);
    } catch (error) {
      console.error('Error upserting mail configuration:', error);
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message,
          data: null
        });
      }

      const response: ApiResponse = {
        success: false,
        message: 'Failed to save mail configuration',
        data: null
      };
      res.status(500).json(response);
    }
  }

  /**
   * Update mail configuration
   */
  static async updateMailConfiguration(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.id;
      const { id } = req.params;
      
      if (!tenantId || !userId) {
        throw new ValidationError('Tenant ID and User ID are required');
      }

      if (!id) {
        throw new ValidationError('Configuration ID is required');
      }

      const {
        provider,
        email,
        smtpHost,
        smtpPort,
        smtpUsername,
        smtpPassword,
        enableSsl,
        defaultFromEmail,
        isActive,
        metadata
      } = req.body;

      // Validation
      if (provider && !Object.values(MailProvider).includes(provider)) {
        throw new ValidationError('Valid provider is required (GOOGLE, MICROSOFT, ZOHO)');
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ValidationError('Valid email address is required');
      }

      if (smtpPort && (smtpPort < 1 || smtpPort > 65535)) {
        throw new ValidationError('Valid SMTP port (1-65535) is required');
      }

      if (defaultFromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(defaultFromEmail)) {
        throw new ValidationError('Valid default from email is required');
      }

      const updateData: UpdateMailConfigurationData = {
        updatedBy: userId
      };

      if (provider !== undefined) updateData.provider = provider;
      if (email !== undefined) updateData.email = email;
      if (smtpHost !== undefined) updateData.smtpHost = smtpHost;
      if (smtpPort !== undefined) updateData.smtpPort = smtpPort;
      if (smtpUsername !== undefined) updateData.smtpUsername = smtpUsername;
      if (smtpPassword !== undefined && smtpPassword !== '') updateData.smtpPassword = encrypt(smtpPassword);
      if (enableSsl !== undefined) updateData.enableSsl = enableSsl;
      if (defaultFromEmail !== undefined) updateData.defaultFromEmail = defaultFromEmail;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (metadata !== undefined) updateData.metadata = metadata;

      const mailConfig = await updateMailConfigurationById(id, tenantId, updateData);

      if (!mailConfig) {
        throw new NotFoundError('Mail configuration not found');
      }

      // Don't send the encrypted password back to the client
      mailConfig.smtpPassword = '';

      const response: ApiResponse = {
        success: true,
        message: 'Mail configuration updated successfully',
        data: mailConfig
      };

      res.json(response);
    } catch (error) {
      console.error('Error updating mail configuration:', error);
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message,
          data: null
        });
      }

      if (error instanceof NotFoundError) {
        return res.status(404).json({
          success: false,
          message: error.message,
          data: null
        });
      }

      const response: ApiResponse = {
        success: false,
        message: 'Failed to update mail configuration',
        data: null
      };
      res.status(500).json(response);
    }
  }

  /**
   * Delete mail configuration
   */
  static async deleteMailConfiguration(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.id;
      const { id } = req.params;
      
      if (!tenantId || !userId) {
        throw new ValidationError('Tenant ID and User ID are required');
      }

      let success;
      
      if (id) {
        success = await deleteMailConfigurationById(id, tenantId, userId);
      } else {
        success = await deleteMailConfiguration(tenantId, userId);
      }

      if (!success) {
        throw new NotFoundError('Mail configuration not found');
      }

      const response: ApiResponse = {
        success: true,
        message: 'Mail configuration deleted successfully',
        data: null
      };

      res.json(response);
    } catch (error) {
      console.error('Error deleting mail configuration:', error);
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message,
          data: null
        });
      }

      if (error instanceof NotFoundError) {
        return res.status(404).json({
          success: false,
          message: error.message,
          data: null
        });
      }

      const response: ApiResponse = {
        success: false,
        message: 'Failed to delete mail configuration',
        data: null
      };
      res.status(500).json(response);
    }
  }

  /**
   * Test mail configuration by sending a test email
   */
  static async testMailConfiguration(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.user?.tenantId;
      
      if (!tenantId) {
        throw new ValidationError('Tenant ID is required');
      }

      const { id } = req.body;

      if (!id) {
        throw new ValidationError('Mail configuration ID is required');
      }

      // Fetch the specific configuration by ID (not just the active one)
      const mailConfig = await getMailConfigurationById(id, tenantId);
      
      if (!mailConfig) {
        throw new NotFoundError('Mail configuration not found');
      }

      // Decrypt the password
      console.log('Testing mail config ID:', mailConfig.id);
      console.log('SMTP Username:', mailConfig.smtpUsername);
      console.log('SMTP Host:', mailConfig.smtpHost, '| Port:', mailConfig.smtpPort, '| SSL:', mailConfig.enableSsl);
      console.log('Encrypted password:', mailConfig.smtpPassword);
      console.log('Encrypted password length:', mailConfig.smtpPassword.length);
      
      let decryptedPassword;
      try {
        decryptedPassword = decrypt(mailConfig.smtpPassword);
        console.log('Decrypted password length:', decryptedPassword.length);
        console.log('Decrypted password first 3 chars:', decryptedPassword.substring(0, 3) + '...');
        console.log('Decrypted password last 3 chars:', '...' + decryptedPassword.substring(decryptedPassword.length - 3));
        
        // Check if password seems too short (likely corrupted)
        // Zoho app passwords are 12 characters, Gmail app passwords are 16 characters
        if (decryptedPassword.length < 8) {
          console.warn('Password seems too short, likely corrupted during previous update');
          throw new Error(
            `The stored password appears to be corrupted (too short: ${decryptedPassword.length} characters). ` +
            `This usually happens when the password was double-encrypted during a previous update. ` +
            `Please re-enter your correct SMTP app password in the mail configuration settings and save again.`
          );
        }
      } catch (decryptError) {
        console.error('Password decryption failed:', decryptError);
        throw new Error(
          `Password decryption failed. This usually happens when the password was corrupted during a previous update. ` +
          `Please re-enter your SMTP password in the mail configuration settings and try again.`
        );
      }

      // Create transporter — respect the enableSsl setting:
      // secure:true  → direct TLS (port 465)
      // secure:false → STARTTLS upgrade (port 587 / 25)
      // authMethod LOGIN is required by Zoho & Gmail app-password SMTP
      // (AUTH PLAIN is rejected with 535 by those providers)
      const transporter = nodemailer.createTransport({
        host: mailConfig.smtpHost,
        port: mailConfig.smtpPort,
        secure: mailConfig.enableSsl,
        auth: {
          type: 'LOGIN',
          user: mailConfig.smtpUsername,
          pass: decryptedPassword
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      // Verify connection & auth before attempting to send
      try {
        await transporter.verify();
        console.log('SMTP connection verified successfully');
      } catch (verifyError: any) {
        console.error('SMTP verify failed:', verifyError.message);
        throw new Error(
          `SMTP authentication failed: ${verifyError.message}. ` +
          `Please check your SMTP username/password. For Gmail/Zoho, use an App Password (not your account password).`
        );
      }

      // Send test email
      const testEmail = {
        from: mailConfig.defaultFromEmail,
        to: mailConfig.email, // Send to the configured email
        subject: 'Test Email from Zithspace',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4f46e5;">Test Email</h2>
            <p>This is a test email to verify your mail configuration is working correctly.</p>
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>Configuration Details:</h3>
              <ul>
                <li><strong>Provider:</strong> ${mailConfig.provider}</li>
                <li><strong>SMTP Host:</strong> ${mailConfig.smtpHost}</li>
                <li><strong>SMTP Port:</strong> ${mailConfig.smtpPort}</li>
                <li><strong>SSL/TLS:</strong> ${mailConfig.enableSsl ? 'Enabled' : 'Disabled'}</li>
                <li><strong>From Email:</strong> ${mailConfig.defaultFromEmail}</li>
              </ul>
            </div>
            <p style="color: #6b7280; font-size: 14px;">
              If you received this email, your mail configuration is working correctly!
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              This is an automated test email from Zithspace Mail Configuration.
            </p>
          </div>
        `
      };

      await transporter.sendMail(testEmail);

      // Update test status to success
      await updateTestStatus(mailConfig.id, tenantId, TestStatus.SUCCESS);

      const response: ApiResponse = {
        success: true,
        message: 'Test email sent successfully',
        data: {
          status: TestStatus.SUCCESS,
          sentTo: mailConfig.email
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error testing mail configuration:', error);
      
      // Update test status to failed using the id from the request body
      try {
        const { id } = req.body;
        if (id && req.user?.tenantId) {
          const mailConfig = await getMailConfigurationById(id, req.user.tenantId);
          if (mailConfig) {
            await updateTestStatus(
              mailConfig.id, 
              req.user.tenantId, 
              TestStatus.FAILED, 
              error instanceof Error ? error.message : 'Unknown error'
            );
          }
        }
      } catch (updateError) {
        console.error('Error updating test status:', updateError);
      }
      
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        return res.status(error instanceof ValidationError ? 400 : 404).json({
          success: false,
          message: error.message,
          data: null
        });
      }

      const response: ApiResponse = {
        success: false,
        message: 'Failed to send test email',
        data: {
          status: TestStatus.FAILED,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
      res.status(500).json(response);
    }
  }

  /**
   * Get mail status (for frontend)
   */
  static async getMailStatus(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.user?.tenantId;
      
      if (!tenantId) {
        throw new ValidationError('Tenant ID is required');
      }

      const mailConfig = await getMailConfigurationByTenantId(tenantId);

      const response: ApiResponse = {
        success: true,
        message: 'Mail status retrieved successfully',
        data: {
          configured: !!mailConfig,
          active: mailConfig?.isActive || false,
          provider: mailConfig?.provider,
          email: mailConfig?.email,
          lastTestStatus: mailConfig?.testStatus,
          lastTestSentAt: mailConfig?.lastTestSentAt,
          testErrorMessage: mailConfig?.testErrorMessage
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching mail status:', error);
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message,
          data: null
        });
      }

      const response: ApiResponse = {
        success: false,
        message: 'Failed to fetch mail status',
        data: null
      };
      res.status(500).json(response);
    }
  }

  /**
   * Get all mail configurations (admin only)
   */
  static async getAllMailConfigurations(req: AuthRequest, res: Response) {
    try {
      // Check if user is admin
      if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
        throw new AuthorizationError('Admin access required');
      }

      const {
        page = 1,
        limit = 20,
        provider,
        isActive,
        search,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      const options = {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        provider: provider as MailProvider,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        search: search as string,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc'
      };

      const result = await getAllMailConfigurations(options);

      // Don't send encrypted passwords to the client
      result.mailConfigurations.forEach(config => {
        config.smtpPassword = '';
      });

      const response: ApiResponse = {
        success: true,
        message: 'Mail configurations retrieved successfully',
        data: result
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching all mail configurations:', error);
      
      if (error instanceof AuthorizationError) {
        return res.status(403).json({
          success: false,
          message: error.message,
          data: null
        });
      }

      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message,
          data: null
        });
      }

      const response: ApiResponse = {
        success: false,
        message: 'Failed to fetch mail configurations',
        data: null
      };
      res.status(500).json(response);
    }
  }
}
