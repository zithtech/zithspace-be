import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { JWTUtils } from "@/utils/jwt";
import { EmailService } from "@/utils/emailService";
import pool from "@/config/dbpool";

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
          `INSERT INTO tenants (id, name, subdomain, plan_type, max_users, is_active, is_setup_complete, settings, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 10, true, false, '{}', now(), now())
           RETURNING id`,
          [tenantName, subdomain, planType]
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
}
