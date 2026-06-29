import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import axios from "axios";
import { JWTUtils } from "@/utils/jwt";
import { EmailService } from "@/utils/emailService";
import pool from "@/config/dbpool";
import crypto from "crypto";

const emailService = new EmailService();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function uniqueSubdomain(base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const result = await pool.query(
      "SELECT id FROM tenants WHERE subdomain = $1 LIMIT 1",
      [candidate]
    );
    if (result.rows.length === 0) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

export class LandingSignupController {
  static async signup(req: Request, res: Response): Promise<void> {
    try {
      const { email, name, password, planConfig, type, companyName } = req.body;

      if (!email || !name || !password) {
        res.status(400).json({ success: false, error: "Email, name, and password are required" });
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({ success: false, error: "Invalid email address" });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      const accountType = type === "team" ? "team" : "freelancer";

      if (accountType === "team" && !companyName?.trim()) {
        res.status(400).json({ success: false, error: "Company name is required for team accounts" });
        return;
      }

      const existing = await pool.query(
        "SELECT id, is_verified FROM pending_registrations WHERE email = $1",
        [normalizedEmail]
      );

      if (existing.rows[0]?.is_verified) {
        res.status(409).json({ success: false, error: "An account with this email already exists" });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const verificationToken = JWTUtils.createTemporaryToken({ email: normalizedEmail }, "24h");
      const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const safePlanConfig = {
        tier: planConfig?.tier ?? null,
        sets: Array.isArray(planConfig?.sets) ? planConfig.sets : [],
        ai: Array.isArray(planConfig?.ai) ? planConfig.ai : [],
        billing: planConfig?.billing ?? "yearly",
        currency: planConfig?.currency ?? "USD",
      };

      await pool.query(
        `INSERT INTO pending_registrations
           (email, name, password_hash, verification_token, verification_expires_at, plan_config, type, company_name, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (email) DO UPDATE SET
           name                    = EXCLUDED.name,
           password_hash           = EXCLUDED.password_hash,
           verification_token      = EXCLUDED.verification_token,
           verification_expires_at = EXCLUDED.verification_expires_at,
           plan_config             = EXCLUDED.plan_config,
           type                    = EXCLUDED.type,
           company_name            = EXCLUDED.company_name,
           is_verified             = false,
           is_completed            = false,
           updated_at              = now()`,
        [
          normalizedEmail,
          name.trim(),
          passwordHash,
          verificationToken,
          verificationExpiresAt,
          JSON.stringify(safePlanConfig),
          accountType,
          companyName?.trim() || null,
        ]
      );

      const landingUrl = process.env.LANDING_URL || "http://localhost:3000";
      const verifyLink = `${landingUrl}/verify-email?token=${verificationToken}`;

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #111;">
          <div style="margin-bottom: 32px;">
            <span style="font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Zukov</span>
          </div>
          <h1 style="font-size: 24px; font-weight: 600; margin: 0 0 12px;">Verify your email</h1>
          <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
            Hi ${name.trim()}, thanks for signing up! Click the button below to verify your email address. This link expires in 24 hours.
          </p>
          <a href="${verifyLink}"
             style="display: inline-block; background: linear-gradient(135deg, #6366F1, #8B5CF6); color: #fff; text-decoration: none; padding: 13px 28px; border-radius: 10px; font-size: 15px; font-weight: 600;">
            Verify email address
          </a>
          <p style="font-size: 13px; color: #999; margin-top: 28px; line-height: 1.6;">
            If you didn't create an account, you can safely ignore this email.
          </p>
        </div>
      `;

      try {
        await emailService.sendCentralizedMail({
          to: normalizedEmail,
          subject: "Verify your Zukov account",
          html,
          text: `Hi ${name.trim()}, verify your email by visiting: ${verifyLink}`,
        });
      } catch (emailError) {
        console.error("Verification email failed to send:", emailError);
        res.status(500).json({ success: false, error: "Account saved but we couldn't send the verification email. Please try again." });
        return;
      }

      res.status(200).json({ success: true, message: "Verification email sent. Please check your inbox." });
    } catch (error) {
      console.error("Landing signup error:", error);
      res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
    }
  }

  static async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.query as { token: string };

      if (!token) {
        res.status(400).json({ success: false, error: "Verification token is required" });
        return;
      }

      let decoded: { email: string };
      try {
        decoded = JWTUtils.verifyTemporaryToken(token) as { email: string };
      } catch {
        res.status(400).json({ success: false, error: "Invalid or expired verification link" });
        return;
      }

      const result = await pool.query(
        "SELECT id, name, is_verified, verification_expires_at, plan_config FROM pending_registrations WHERE email = $1 AND verification_token = $2",
        [decoded.email, token]
      );

      const record = result.rows[0];

      if (!record) {
        res.status(404).json({ success: false, error: "Verification link not found or already used" });
        return;
      }

      if (record.is_verified) {
        res.status(200).json({
          success: true,
          alreadyVerified: true,
          email: decoded.email,
          name: record.name,
          planConfig: record.plan_config,
        });
        return;
      }

      if (new Date() > new Date(record.verification_expires_at)) {
        res.status(400).json({ success: false, error: "Verification link has expired. Please sign up again." });
        return;
      }

      await pool.query(
        "UPDATE pending_registrations SET is_verified = true, updated_at = now() WHERE id = $1",
        [record.id]
      );

      res.status(200).json({
        success: true,
        email: decoded.email,
        name: record.name,
        planConfig: record.plan_config,
      });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
    }
  }

  static async completeRegistration(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({ success: false, error: "Token is required" });
        return;
      }

      let decoded: { email: string };
      try {
        decoded = JWTUtils.verifyTemporaryToken(token) as { email: string };
      } catch {
        res.status(400).json({ success: false, error: "Invalid or expired token" });
        return;
      }

      const result = await pool.query(
        `SELECT id, name, password_hash, plan_config, type, company_name, is_verified, is_completed
         FROM pending_registrations
         WHERE email = $1 AND verification_token = $2`,
        [decoded.email, token]
      );

      const record = result.rows[0];

      if (!record) {
        res.status(404).json({ success: false, error: "Registration not found" });
        return;
      }

      if (!record.is_verified) {
        res.status(400).json({ success: false, error: "Email not yet verified" });
        return;
      }

      if (record.is_completed) {
        res.status(409).json({ success: false, error: "Account already created. Please log in." });
        return;
      }

      const baseSlug =
        record.type === "team"
          ? slugify(record.company_name || record.name)
          : slugify(record.name);

      const subdomain = await uniqueSubdomain(baseSlug || "workspace");

      const planConfig = record.plan_config || {};
      const planType = planConfig.tier || "basic";

      const tenantName =
        record.type === "team"
          ? (record.company_name || record.name)
          : record.name;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const tenantResult = await client.query(
          `INSERT INTO tenants (id, name, subdomain, plan_type, max_users, is_active, is_setup_complete, settings, web_inquiry_secret_key, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 10, true, false, '{}', $4, now(), now())
           RETURNING id`,
          [tenantName, subdomain, planType, `${crypto.randomInt(10000, 100000)}/secretkey/${subdomain}`]
        );

        const tenantId = tenantResult.rows[0].id;

        await client.query(
          `INSERT INTO users (id, tenant_id, name, work_email, personal_email, phone, password_hash, role, is_active, work_days, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $3, '', $4, 'super_admin', true, '{1,2,3,4,5}', now(), now())`,
          [tenantId, record.name, decoded.email, record.password_hash]
        );

        await client.query(
          "UPDATE pending_registrations SET is_completed = true, updated_at = now() WHERE id = $1",
          [record.id]
        );

        await client.query("COMMIT");
      } catch (txError) {
        await client.query("ROLLBACK");
        throw txError;
      } finally {
        client.release();
      }

      res.status(200).json({
        success: true,
        tenantSubdomain: subdomain,
        email: decoded.email,
        name: record.name,
      });
    } catch (error) {
      console.error("Complete registration error:", error);
      res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
    }
  }

  static async googleSignup(req: Request, res: Response): Promise<void> {
    try {
      const { token, type, companyName, planConfig } = req.body;

      if (!token) {
        res.status(400).json({ success: false, error: "Google access token is required" });
        return;
      }

      let googleUser;
      try {
        const response = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${token}` }
        });
        googleUser = response.data;
      } catch (err) {
        console.error("Failed to verify Google access token:", err);
        res.status(400).json({ success: false, error: "Invalid Google token" });
        return;
      }

      if (!googleUser || !googleUser.email) {
        res.status(400).json({ success: false, error: "Failed to retrieve email from Google" });
        return;
      }

      const email = googleUser.email.toLowerCase().trim();
      const name = googleUser.name || "Google User";

      // Check if user already exists
      const existingUser = await pool.query(
        "SELECT id FROM users WHERE work_email = $1 OR personal_email = $1 LIMIT 1",
        [email]
      );
      if (existingUser.rows.length > 0) {
        res.status(409).json({ success: false, error: "An account with this email already exists" });
        return;
      }

      const accountType = type === "team" ? "team" : "freelancer";
      if (accountType === "team" && !companyName?.trim()) {
        res.status(400).json({ success: false, error: "Company name is required for team accounts" });
        return;
      }

      const baseSlug = accountType === "team" ? slugify(companyName || name) : slugify(name);
      const subdomain = await uniqueSubdomain(baseSlug || "workspace");
      const tenantName = accountType === "team" ? (companyName || name) : name;
      const planType = planConfig?.tier || "basic";

      const safePlanConfig = {
        tier: planConfig?.tier ?? null,
        sets: Array.isArray(planConfig?.sets) ? planConfig.sets : [],
        ai: Array.isArray(planConfig?.ai) ? planConfig.ai : [],
        billing: planConfig?.billing ?? "yearly",
        currency: planConfig?.currency ?? "USD",
      };

      const dummyPasswordHash = await bcrypt.hash(Math.random().toString(36), 12);
      const verificationToken = JWTUtils.createTemporaryToken({ email }, "24h");
      const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const dbClient = await pool.connect();
      try {
        await dbClient.query("BEGIN");

        // Insert pending registration (already completed & verified)
        await dbClient.query(
          `INSERT INTO pending_registrations
             (email, name, password_hash, verification_token, verification_expires_at, is_verified, is_completed, plan_config, type, company_name, updated_at)
           VALUES ($1, $2, $3, $4, $5, true, true, $6, $7, $8, now())
           ON CONFLICT (email) DO UPDATE SET
             name = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash,
             verification_token = EXCLUDED.verification_token,
             verification_expires_at = EXCLUDED.verification_expires_at,
             is_verified = true,
             is_completed = true,
             plan_config = EXCLUDED.plan_config,
             type = EXCLUDED.type,
             company_name = EXCLUDED.company_name,
             updated_at = now()`,
          [email, name.trim(), dummyPasswordHash, verificationToken, verificationExpiresAt, JSON.stringify(safePlanConfig), accountType, tenantName]
        );

        // Create Tenant
        const tenantResult = await dbClient.query(
          `INSERT INTO tenants (id, name, subdomain, plan_type, max_users, is_active, is_setup_complete, settings, web_inquiry_secret_key, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 10, true, false, '{}', $4, now(), now())
           RETURNING id`,
          [tenantName, subdomain, planType, `${crypto.randomInt(10000, 100000)}/secretkey/${subdomain}`]
        );
        const tenantId = tenantResult.rows[0].id;

        // Create User
        await dbClient.query(
          `INSERT INTO users (id, tenant_id, name, work_email, personal_email, phone, password_hash, role, is_active, work_days, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $3, '', $4, 'super_admin', true, '{1,2,3,4,5}', now(), now())`,
          [tenantId, name.trim(), email, dummyPasswordHash]
        );

        await dbClient.query("COMMIT");
      } catch (txError) {
        await dbClient.query("ROLLBACK");
        throw txError;
      } finally {
        dbClient.release();
      }

      res.status(200).json({
        success: true,
        tenantSubdomain: subdomain,
        email: email,
        name: name,
      });
    } catch (error) {
      console.error("Google signup error:", error);
      res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
    }
  }

  static async microsoftSignup(req: Request, res: Response): Promise<void> {
    try {
      const { token, type, companyName, planConfig } = req.body;

      if (!token) {
        res.status(400).json({ success: false, error: "Microsoft access token is required" });
        return;
      }

      let msUser;
      try {
        const response = await axios.get("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${token}` }
        });
        msUser = response.data;
      } catch (err) {
        console.error("Failed to verify Microsoft access token:", err);
        res.status(400).json({ success: false, error: "Invalid Microsoft token" });
        return;
      }

      if (!msUser || !(msUser.mail || msUser.userPrincipalName)) {
        res.status(400).json({ success: false, error: "Failed to retrieve email from Microsoft" });
        return;
      }

      const email = (msUser.mail || msUser.userPrincipalName).toLowerCase().trim();
      const name = msUser.displayName || msUser.givenName || "Microsoft User";

      // Check if user already exists
      const existingUser = await pool.query(
        "SELECT id FROM users WHERE work_email = $1 OR personal_email = $1 LIMIT 1",
        [email]
      );
      if (existingUser.rows.length > 0) {
        res.status(409).json({ success: false, error: "An account with this email already exists" });
        return;
      }

      const accountType = type === "team" ? "team" : "freelancer";
      if (accountType === "team" && !companyName?.trim()) {
        res.status(400).json({ success: false, error: "Company name is required for team accounts" });
        return;
      }

      const baseSlug = accountType === "team" ? slugify(companyName || name) : slugify(name);
      const subdomain = await uniqueSubdomain(baseSlug || "workspace");
      const tenantName = accountType === "team" ? (companyName || name) : name;
      const planType = planConfig?.tier || "basic";

      const safePlanConfig = {
        tier: planConfig?.tier ?? null,
        sets: Array.isArray(planConfig?.sets) ? planConfig.sets : [],
        ai: Array.isArray(planConfig?.ai) ? planConfig.ai : [],
        billing: planConfig?.billing ?? "yearly",
        currency: planConfig?.currency ?? "USD",
      };

      const dummyPasswordHash = await bcrypt.hash(Math.random().toString(36), 12);
      const verificationToken = JWTUtils.createTemporaryToken({ email }, "24h");
      const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const dbClient = await pool.connect();
      try {
        await dbClient.query("BEGIN");

        // Insert pending registration (already completed & verified)
        await dbClient.query(
          `INSERT INTO pending_registrations
             (email, name, password_hash, verification_token, verification_expires_at, is_verified, is_completed, plan_config, type, company_name, updated_at)
           VALUES ($1, $2, $3, $4, $5, true, true, $6, $7, $8, now())
           ON CONFLICT (email) DO UPDATE SET
             name = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash,
             verification_token = EXCLUDED.verification_token,
             verification_expires_at = EXCLUDED.verification_expires_at,
             is_verified = true,
             is_completed = true,
             plan_config = EXCLUDED.plan_config,
             type = EXCLUDED.type,
             company_name = EXCLUDED.company_name,
             updated_at = now()`,
          [email, name.trim(), dummyPasswordHash, verificationToken, verificationExpiresAt, JSON.stringify(safePlanConfig), accountType, tenantName]
        );

        // Create Tenant
        const tenantResult = await dbClient.query(
          `INSERT INTO tenants (id, name, subdomain, plan_type, max_users, is_active, is_setup_complete, settings, web_inquiry_secret_key, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 10, true, false, '{}', $4, now(), now())
           RETURNING id`,
          [tenantName, subdomain, planType, `${crypto.randomInt(10000, 100000)}/secretkey/${subdomain}`]
        );
        const tenantId = tenantResult.rows[0].id;

        // Create User
        await dbClient.query(
          `INSERT INTO users (id, tenant_id, name, work_email, personal_email, phone, password_hash, role, is_active, work_days, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $3, '', $4, 'super_admin', true, '{1,2,3,4,5}', now(), now())`,
          [tenantId, name.trim(), email, dummyPasswordHash]
        );

        await dbClient.query("COMMIT");
      } catch (txError) {
        await dbClient.query("ROLLBACK");
        throw txError;
      } finally {
        dbClient.release();
      }

      res.status(200).json({
        success: true,
        tenantSubdomain: subdomain,
        email: email,
        name: name,
      });
    } catch (error) {
      console.error("Microsoft signup error:", error);
      res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
    }
  }
}
