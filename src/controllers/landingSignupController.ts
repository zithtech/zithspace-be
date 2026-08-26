import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import axios from "axios";
import { JWTUtils } from "@/utils/jwt";
import { EmailService } from "@/utils/emailService";
import pool from "@/config/dbpool";
import crypto from "crypto";
import { RBACService } from "@/modules/rbac/rbac.service";
import {
  invalidateTenant,
  Product,
  ALL_PRODUCTS,
} from "@/modules/entitlements/entitlements.service";
import {
  productFromRequest,
  brandForRequest,
  tenantOrigin,
  Brand,
} from "@/config/brand";

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

interface PlanConfig {
  tier?: string | number | null;
  sets?: string[];
  ai?: string[];
  billing?: string;
  currency?: string;
}

/** Normalise whatever the pricing page posted into a stable shape. */
function safePlanConfig(planConfig: any): PlanConfig {
  return {
    tier: planConfig?.tier ?? null,
    sets: Array.isArray(planConfig?.sets) ? planConfig.sets : [],
    ai: Array.isArray(planConfig?.ai) ? planConfig.ai : [],
    billing: planConfig?.billing ?? "yearly",
    currency: planConfig?.currency ?? "USD",
  };
}

export class LandingSignupController {
  // ───────────────────────────────────────────────────────────────────────────
  // SHARED PROVISIONING CORE
  //
  // One place creates a tenant. The three signup entry points (email/password,
  // Google, Microsoft) differ only in how they establish identity; everything
  // after that — subdomain, plan, the tenant + super-admin rows, the brand-door
  // grant, RBAC, the Admin onboard call and the welcome email — is identical and
  // lives here. Previously this block was copy-pasted three times and drifted.
  // ───────────────────────────────────────────────────────────────────────────

  /** Resolve the chosen plan against the Admin control plane. */
  private static async resolvePlan(
    planConfig: PlanConfig
  ): Promise<{ planId: number; planName: string }> {
    let planId = parseInt(String(planConfig?.tier));
    let planName = "Free Trial";

    const adminUrl = process.env.ADMIN_API_URL || "http://localhost:5000";
    try {
      const plansRes = await axios.get(`${adminUrl}/api/plans`);
      const allPlans = Array.isArray(plansRes.data)
        ? plansRes.data
        : plansRes.data?.data || [];

      if (isNaN(planId)) {
        const trialPlan = allPlans.find(
          (p: any) => p.plan_type === "TRIAL" || p.trial_days > 0
        );
        planId = trialPlan ? trialPlan.id : 1;
      }
      const selected = allPlans.find((p: any) => p.id === planId);
      if (selected) planName = selected.name;
    } catch (err) {
      console.error("[signup] failed to fetch plans from Admin backend:", err);
      if (isNaN(planId)) planId = 1;
    }

    return { planId, planName };
  }

  /**
   * Create a tenant + its super-admin, grant the brand door, seed RBAC, attach
   * the subscription and send the welcome email.
   *
   * THE BRAND-DOOR GRANT IS A HARD, ATOMIC STEP. `ent_tenant_entitlements` is
   * RLS-protected, so we set `app.current_tenant_id` transaction-locally before
   * inserting into it, inside the SAME transaction as the tenant/user rows. If
   * the grant fails for any reason the whole signup rolls back — a tenant is
   * never left "unmanaged", which would silently mean full access to every
   * product (fine for Zukvo, catastrophic for Testiez).
   */
  private static async provisionTenant(
    req: Request,
    opts: {
      email: string;
      name: string;
      passwordHash: string;
      accountType: "team" | "freelancer";
      companyName?: string | null;
      planConfig: PlanConfig;
      /** When set, the pending_registrations row is marked completed in-tx. */
      completePendingId?: string;
    }
  ): Promise<{
    tenantId: string;
    userId: string;
    subdomain: string;
    planId: number;
    planName: string;
    product: Product;
    brand: Brand;
    adminAction: any;
  }> {
    const { email, name, passwordHash, accountType, companyName, planConfig } =
      opts;

    const tenantName =
      accountType === "team" ? companyName || name : name;
    const baseSlug =
      accountType === "team" ? slugify(companyName || name) : slugify(name);
    const subdomain = await uniqueSubdomain(baseSlug || "workspace");

    const { planId, planName } = await LandingSignupController.resolvePlan(
      planConfig
    );

    // Which brand door did this signup arrive through? Fall back to Zukvo only
    // when the origin is unrecognised (e.g. local dev). Validated against the
    // known product set rather than trusting the value blindly.
    const detected = productFromRequest(req);
    const product: Product =
      detected && ALL_PRODUCTS.includes(detected) ? detected : "zukvo";
    const brand = brandForRequest(req);

    const client = await pool.connect();
    let tenantId = "";
    let userId = "";
    try {
      await client.query("BEGIN");

      const tenantResult = await client.query(
        `INSERT INTO tenants (id, name, subdomain, plan_type, max_users, is_active, is_setup_complete, settings, web_inquiry_secret_key, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 10, true, false, '{}', $4, now(), now())
         RETURNING id`,
        [
          tenantName,
          subdomain,
          planName,
          `${crypto.randomInt(10000, 100000)}/secretkey/${subdomain}`,
        ]
      );
      tenantId = tenantResult.rows[0].id;

      const userResult = await client.query(
        `INSERT INTO users (id, tenant_id, name, work_email, personal_email, phone, password_hash, role, is_active, work_days, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $3, '', $4, 'super_admin', true, '{1,2,3,4,5}', now(), now())
         RETURNING id`,
        [tenantId, name, email, passwordHash]
      );
      userId = userResult.rows[0].id;

      if (opts.completePendingId) {
        await client.query(
          "UPDATE pending_registrations SET is_completed = true, updated_at = now() WHERE id = $1",
          [opts.completePendingId]
        );
      }

      // Grant the brand door in-transaction. ent_tenant_entitlements enforces
      // RLS (tenant_id must equal app.current_tenant_id), so set the GUC first.
      // Mirrors grantProduct() in entitlements.service, but atomic with the
      // tenant/user rows so it can never be silently skipped.
      await client.query(
        "SELECT set_config('app.current_tenant_id', $1, true)",
        [tenantId]
      );
      await client.query(
        `INSERT INTO ent_tenant_entitlements (tenant_id, product, status, source, expires_at)
              VALUES ($1, $2, 'active', 'signup', NULL)
         ON CONFLICT (tenant_id, product) DO UPDATE
              SET status = 'active', source = EXCLUDED.source, expires_at = EXCLUDED.expires_at, updated_at = now()`,
        [tenantId, product]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // The write happened on a pooled connection; drop any cached entitlement so
    // this instance sees the grant immediately.
    invalidateTenant(tenantId);

    await RBACService.setupDefaultRolesForTenant(tenantId);

    // Attach the plan in the Admin control plane. Best-effort: the account
    // exists and is entitled even if this call fails, and Admin reconciles later.
    let adminAction: any = { action: "UNKNOWN" };
    try {
      const adminUrl = process.env.ADMIN_API_URL || "http://localhost:5000";
      const resp = await axios.post(`${adminUrl}/api/subscriptions/onboard`, {
        tenantId,
        planId,
        billingCycle: (planConfig?.billing || "monthly").toUpperCase(),
      });
      adminAction = resp.data?.data || { action: "ERROR" };
    } catch (adminErr: any) {
      console.error(
        "[signup] Admin onboard API error:",
        adminErr?.message || adminErr
      );
      adminAction = {
        action: "API_ERROR",
        message:
          adminErr?.response?.data?.error ||
          adminErr?.response?.data?.message ||
          adminErr?.message ||
          "Unknown error",
      };
    }

    // Welcome email on the correct brand (fire-and-forget).
    const workspaceUrl = tenantOrigin(subdomain, brand);
    LandingSignupController.sendWorkspaceWelcomeEmail({
      to: email,
      name,
      planName,
      workspaceUrl,
      brand,
    }).catch((e) => console.error("[signup] welcome email error:", e));

    return {
      tenantId,
      userId,
      subdomain,
      planId,
      planName,
      product,
      brand,
      adminAction,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ENTRY POINT 1 — email / password (two-step: verify email, then complete)
  // ───────────────────────────────────────────────────────────────────────────

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
          JSON.stringify(safePlanConfig(planConfig)),
          accountType,
          companyName?.trim() || null,
        ]
      );

      const brand = brandForRequest(req);
      const landingUrl = process.env.LANDING_URL || "http://localhost:3000";
      const verifyLink = `${landingUrl}/verify-email?token=${verificationToken}`;

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #111;">
          <div style="margin-bottom: 32px;">
            <span style="font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">${brand.name}</span>
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
          subject: `Verify your ${brand.name} account`,
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

      const accountType = record.type === "team" ? "team" : "freelancer";

      const { subdomain, adminAction } =
        await LandingSignupController.provisionTenant(req, {
          email: decoded.email,
          name: record.name,
          passwordHash: record.password_hash,
          accountType,
          companyName: record.company_name,
          planConfig: record.plan_config || {},
          completePendingId: record.id,
        });

      res.status(200).json({
        success: true,
        tenantSubdomain: subdomain,
        email: decoded.email,
        name: record.name,
        decision: adminAction,
      });
    } catch (error: any) {
      console.error("Complete registration error:", error?.message || error);
      console.error("Complete registration stack:", error?.stack);
      res.status(500).json({ success: false, error: error?.message || "Something went wrong. Please try again." });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ENTRY POINT 2 & 3 — OAuth (Google / Microsoft), one-shot with auto-login
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Shared tail for the OAuth flows: record a pre-verified pending row, provision
   * the tenant, and auto-login by returning an access token + refresh cookie.
   */
  private static async completeOAuthSignup(
    req: Request,
    res: Response,
    identity: { email: string; name: string; accountType: "team" | "freelancer"; companyName?: string | null; planConfig: any }
  ): Promise<void> {
    const { email, name, accountType, companyName, planConfig } = identity;

    const cfg = safePlanConfig(planConfig);
    const tenantName = accountType === "team" ? companyName || name : name;
    const dummyPasswordHash = await bcrypt.hash(Math.random().toString(36), 12);
    const verificationToken = JWTUtils.createTemporaryToken({ email }, "24h");
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Record a pending row already marked verified + completed, for parity with
    // the email flow's audit trail.
    await pool.query(
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
      [email, name.trim(), dummyPasswordHash, verificationToken, verificationExpiresAt, JSON.stringify(cfg), accountType, tenantName]
    );

    const { tenantId, userId, subdomain, adminAction } =
      await LandingSignupController.provisionTenant(req, {
        email,
        name,
        passwordHash: dummyPasswordHash,
        accountType,
        companyName,
        planConfig: cfg,
      });

    // Auto-login: mint tokens for the freshly created super-admin.
    const authUser = {
      id: userId,
      tenantId,
      email,
      role: "super_admin",
      position: null,
      name,
    };
    const tokens = JWTUtils.generateTokenPair(authUser as any);

    // Refresh token as an httpOnly cookie — same options as the login flow.
    // sameSite "none" in production because signup is submitted cross-site from
    // the marketing domain to the API domain, and only "none" is stored there.
    res.cookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.status(200).json({
      success: true,
      tenantSubdomain: subdomain,
      email,
      name,
      accessToken: tokens.accessToken,
      decision: adminAction,
    });
  }

  static async googleSignup(req: Request, res: Response): Promise<void> {
    try {
      const { token, type, companyName, planConfig } = req.body;

      if (!token) {
        res.status(400).json({ success: false, error: "Google access token is required" });
        return;
      }

      let googleUser: any;
      try {
        const response = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${token}` },
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

      await LandingSignupController.completeOAuthSignup(req, res, {
        email,
        name,
        accountType,
        companyName: accountType === "team" ? companyName?.trim() : null,
        planConfig,
      });
    } catch (error: any) {
      console.error("Google signup error:", error?.message || error);
      res.status(500).json({ success: false, error: error?.message || "Something went wrong. Please try again." });
    }
  }

  static async microsoftSignup(req: Request, res: Response): Promise<void> {
    try {
      const { token, type, companyName, planConfig } = req.body;

      if (!token) {
        res.status(400).json({ success: false, error: "Microsoft access token is required" });
        return;
      }

      let msUser: any;
      try {
        const response = await axios.get("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${token}` },
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

      await LandingSignupController.completeOAuthSignup(req, res, {
        email,
        name,
        accountType,
        companyName: accountType === "team" ? companyName?.trim() : null,
        planConfig,
      });
    } catch (error: any) {
      console.error("Microsoft signup error:", error?.message || error);
      res.status(500).json({ success: false, error: error?.message || "Something went wrong. Please try again." });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────

  private static async sendWorkspaceWelcomeEmail(opts: {
    to: string;
    name: string;
    planName: string;
    workspaceUrl: string;
    brand: Brand;
  }): Promise<void> {
    const { to, name, planName, workspaceUrl, brand } = opts;
    const firstName = name.split(" ")[0];

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%); padding: 40px 40px 50px; border-radius: 16px 16px 0 0; text-align: center;">
          <div style="font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; margin-bottom: 8px;">${brand.name}</div>
          <div style="font-size: 15px; color: rgba(255,255,255,0.8);">Your workspace is ready 🎉</div>
        </div>

        <!-- Body -->
        <div style="padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
          <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 12px;">Congratulations, ${firstName}!</h1>
          <p style="font-size: 15px; color: #6b7280; line-height: 1.7; margin: 0 0 28px;">
            Your ${brand.name} workspace has been successfully created. Here are your workspace details:
          </p>

          <!-- Details Card -->
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 28px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-size: 13px; color: #9ca3af; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; width: 40%;">Plan</td>
                <td style="padding: 8px 0; font-size: 14px; color: #111827; font-weight: 600;">${planName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-size: 13px; color: #9ca3af; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Email</td>
                <td style="padding: 8px 0; font-size: 14px; color: #111827; font-weight: 600;">${to}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-size: 13px; color: #9ca3af; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Workspace</td>
                <td style="padding: 8px 0; font-size: 14px; color: #6366f1; font-weight: 600;">${workspaceUrl}</td>
              </tr>
            </table>
          </div>

          <!-- CTA -->
          <div style="text-align: center; margin-bottom: 28px;">
            <a href="${workspaceUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366F1, #8B5CF6); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 15px; font-weight: 600; letter-spacing: -0.2px;">Open My Workspace →</a>
          </div>

          <p style="font-size: 13px; color: #9ca3af; text-align: center; line-height: 1.6; margin: 0;">
            If you have any questions, reply to this email or contact us at <a href="mailto:${brand.supportEmail}" style="color: #6366f1; text-decoration: none;">${brand.supportEmail}</a>.
          </p>
        </div>
      </div>
    `;

    await emailService.sendCentralizedMail({
      to,
      subject: `🎉 Your ${brand.name} workspace is ready, ${firstName}!`,
      html,
      text: `Hi ${firstName}, your ${brand.name} workspace is ready! Plan: ${planName} | Email: ${to} | Access it here: ${workspaceUrl}`,
    });
  }
}
