import { Response } from "express";
import { AuthRequest } from "../types";
import { MailSettingsModel } from "../models/MailSettings.model";
import { prisma } from "../config/database";
import { MailService } from "../services/mail/MailService";
import crypto from "crypto";

export class MailSettingsController {
  /**
   * Get all mail settings and connected accounts for the tenant
   */
  static async getSettings(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId!;
      
      // 1. Fetch connected accounts from mail_accounts (filtered by user)
      const connectedAccounts = await prisma.mail_accounts.findMany({
        where: { 
          tenant_id: tenantId, 
          user_id: req.user!.id,
          is_active: true 
        },
        select: { email: true, provider: true, id: true }
      });

      // 2. Fetch existing mail settings
      const settings = await MailSettingsModel.getByTenantId(tenantId);

      return res.json({
        success: true,
        data: {
          connectedAccounts,
          settings
        }
      });
    } catch (error: any) {
      console.error("[MailSettingsController] getSettings error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch settings"
      });
    }
  }

  /**
   * Set or update invoice mail
   */
  static async setInvoiceMail(req: AuthRequest, res: Response) {
    try {
      const { email, provider, integrationId } = req.body;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      if (!email) {
        return res.status(400).json({ success: false, error: "Email is required" });
      }

      // Verify that the email is actually connected and belongs to current user
      const connectedAccount = await prisma.mail_accounts.findFirst({
        where: { 
          tenant_id: tenantId, 
          user_id: req.user!.id,
          email, 
          is_active: true 
        }
      });

      if (!connectedAccount) {
        return res.status(400).json({ success: false, error: "Email account is not integrated" });
      }

      // Generate verification token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiry

      const settings = await MailSettingsModel.upsert({
        tenant_id: tenantId,
        email,
        provider: provider || connectedAccount.provider,
        integration_id: integrationId || connectedAccount.id,
        verification_token: token,
        verification_sent_at: new Date(),
        verification_expires_at: expiresAt,
        is_verified: false, // Reset verification if email changes or re-selected? 
        // Actually, if it's the same email and already verified, maybe keep it?
        // Requirement 4: "send verification/confirmation email automatically" when user selects.
        created_by: userId,
      });

      // Set as default
      await MailSettingsModel.setAsDefault(settings.id, tenantId);

      // Send verification email
      await MailService.sendVerificationEmail(tenantId, email, token);

      return res.json({
        success: true,
        data: settings,
        message: "Verification email sent. Please check your inbox."
      });
    } catch (error: any) {
      console.error("[MailSettingsController] setInvoiceMail error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to set invoice mail"
      });
    }
  }

  /**
   * Verify mail via token
   */
  static async verifyMail(req: AuthRequest, res: Response) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ success: false, error: "Token is required" });
      }

      const settings = await MailSettingsModel.getByToken(token);

      if (!settings) {
        return res.status(400).json({ success: false, error: "Invalid or expired token" });
      }

      await MailSettingsModel.markAsVerified(settings.id, settings.tenant_id);

      return res.json({
        success: true,
        message: "Email verified successfully"
      });
    } catch (error: any) {
      console.error("[MailSettingsController] verifyMail error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to verify email"
      });
    }
  }

  /**
   * Resend verification email
   */
  static async resendVerification(req: AuthRequest, res: Response) {
    try {
      const { email } = req.body;
      const tenantId = req.tenantId!;

      if (!email) {
        return res.status(400).json({ success: false, error: "Email is required" });
      }

      const settings = await MailSettingsModel.getByEmail(email, tenantId);

      if (!settings) {
        return res.status(404).json({ success: false, error: "Mail settings not found" });
      }

      if (settings.is_verified) {
        return res.status(400).json({ success: false, error: "Email is already verified" });
      }

      // Generate new token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await MailSettingsModel.upsert({
        tenant_id: tenantId,
        email,
        verification_token: token,
        verification_sent_at: new Date(),
        verification_expires_at: expiresAt,
        created_by: req.user!.id,
      });

      await MailService.sendVerificationEmail(tenantId, email, token);

      return res.json({
        success: true,
        message: "Verification email resent successfully"
      });
    } catch (error: any) {
      console.error("[MailSettingsController] resendVerification error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to resend verification"
      });
    }
  }
}
