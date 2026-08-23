import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import axios from "axios";
import { JWTUtils } from "@/utils/jwt";
import { EmailService } from "@/utils/emailService";
import pool from "@/config/dbpool";
import crypto from "crypto";
import { RBACService } from "@/modules/rbac/rbac.service";
import { grantProduct } from "@/modules/entitlements/entitlements.service";
import { productFromRequest } from "@/config/brand";

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

/**
 * Builds the tenant workspace URL from FRONTEND_URL env var.
 * Works correctly in both local dev and production.
 * e.g. FRONTEND_URL=http://localhost:3005  → http://srvsh.localhost:3005
 *      FRONTEND_URL=https://app.zukvo.com  → https://srvsh.zukvo.com
 */
function buildWorkspaceUrl(subdomain: string): string {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3005';
  try {
    const u = new URL(frontendUrl);
    // Strip any leading "app." prefix so we replace it with the tenant subdomain
    const baseDomain = u.hostname.replace(/^app\./, '');
    return `${u.protocol}//${subdomain}.${baseDomain}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return `https://${subdomain}.zukvo.com`;
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
      let planId = parseInt(planConfig.tier);
      let actualPlanName = "Basic";

      const adminUrl = process.env.ADMIN_API_URL || 'http://localhost:5000';
      try {
        const plansRes = await axios.get(`${adminUrl}/api/plans`);
        const allPlans = Array.isArray(plansRes.data) ? plansRes.data : (plansRes.data?.data || []);
        
        if (isNaN(planId)) {
          const trialPlan = allPlans.find((p: any) => p.plan_type === 'TRIAL' || p.trial_days > 0);
          planId = trialPlan ? trialPlan.id : 1;
        }
        
        const selectedPlan = allPlans.find((p: any) => p.id === planId);
        if (selectedPlan) {
          actualPlanName = selectedPlan.name;
        }
      } catch (plansError) {
        console.error("Failed to fetch plans from Admin backend:", plansError);
        if (isNaN(planId)) planId = 1;
      }

      const tenantName =
        record.type === "team"
          ? (record.company_name || record.name)
          : record.name;

      const client = await pool.connect();
      let adminAction: any = { action: 'UNKNOWN' };
      try {
        await client.query("BEGIN");

        const tenantResult = await client.query(
          `INSERT INTO tenants (id, name, subdomain, plan_type, max_users, is_active, is_setup_complete, settings, web_inquiry_secret_key, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 10, true, false, '{}', $4, now(), now())
           RETURNING id`,
          [tenantName, subdomain, actualPlanName, `${crypto.randomInt(10000, 100000)}/secretkey/${subdomain}`]
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
        await RBACService.setupDefaultRolesForTenant(tenantId);

        // Record which brand door this signup came through. Without it the
        // tenant is "unmanaged", which means full access -- safe for Zukvo but
        // wrong for Testiez, which would get the entire suite. Best-effort:
        // a failure here must not fail an otherwise complete signup, but it
        // is loud because the tenant is over-provisioned until it is fixed.
        try {
          await grantProduct(tenantId, productFromRequest(req) ?? "zukvo", { source: "signup" });
        } catch (grantErr) {
          console.error(`[signup] tenant ${tenantId} created WITHOUT a product grant -- it will behave as unmanaged (full access) until granted:`, grantErr);
        }

        try {
          const response = await axios.post(`${adminUrl}/api/subscriptions/onboard`, {
            tenantId,
            planId,
            billingCycle: (planConfig.billing || 'monthly').toUpperCase()
          });
          
          adminAction = response.data?.data || { action: 'ERROR' };
        } catch (adminError: any) {
          console.error("Failed to call Admin Backend select-plan API:", adminError);
          const errorMsg = adminError.response?.data?.error || adminError.response?.data?.message || adminError.message || 'Unknown error';
          adminAction = { action: 'API_ERROR', message: errorMsg };
        }
      } catch (txError) {
        await client.query("ROLLBACK");
        throw txError;
      } finally {
        client.release();
      }

      // Send workspace welcome email (fire-and-forget)
      const workspaceUrl = buildWorkspaceUrl(subdomain);
      LandingSignupController.sendWorkspaceWelcomeEmail({
        to: decoded.email,
        name: record.name,
        planName: actualPlanName,
        workspaceUrl,
      }).catch(err => console.error('Welcome email error:', err));

      res.status(200).json({
        success: true,
        tenantSubdomain: subdomain,
        email: decoded.email,
        name: record.name,
        decision: adminAction
      });
    } catch (error: any) {
      console.error("Complete registration error:", error?.message || error);
      console.error("Complete registration stack:", error?.stack);
      res.status(500).json({ success: false, error: error?.message || "Something went wrong. Please try again." });
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
      let planId = parseInt(planConfig?.tier);
      let actualPlanName = 'Free Trial';

      const adminUrlG = process.env.ADMIN_API_URL || 'http://localhost:5000';
      try {
        const plansRes = await axios.get(`${adminUrlG}/api/plans`);
        const allPlans = Array.isArray(plansRes.data) ? plansRes.data : (plansRes.data?.data || []);
        if (isNaN(planId)) {
          const trialPlan = allPlans.find((p: any) => p.trial_days > 0);
          planId = trialPlan ? trialPlan.id : 1;
        }
        const selectedPlan = allPlans.find((p: any) => p.id === planId);
        if (selectedPlan) actualPlanName = selectedPlan.name;
      } catch { /* use default */ }

      const planType = actualPlanName;

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

      let tenantId: string = "";
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
        tenantId = tenantResult.rows[0].id;

        // Create User
        await dbClient.query(
          `INSERT INTO users (id, tenant_id, name, work_email, personal_email, phone, password_hash, role, is_active, work_days, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $3, '', $4, 'super_admin', true, '{1,2,3,4,5}', now(), now())`,
          [tenantId, name.trim(), email, dummyPasswordHash]
        );

        await dbClient.query("COMMIT");
        await RBACService.setupDefaultRolesForTenant(tenantId);

        // Record which brand door this signup came through. Without it the
        // tenant is "unmanaged", which means full access -- safe for Zukvo but
        // wrong for Testiez, which would get the entire suite. Best-effort:
        // a failure here must not fail an otherwise complete signup, but it
        // is loud because the tenant is over-provisioned until it is fixed.
        try {
          await grantProduct(tenantId, productFromRequest(req) ?? "zukvo", { source: "signup" });
        } catch (grantErr) {
          console.error(`[signup] tenant ${tenantId} created WITHOUT a product grant -- it will behave as unmanaged (full access) until granted:`, grantErr);
        }
      } catch (txError) {
        await dbClient.query("ROLLBACK");
        throw txError;
      } finally {
        dbClient.release();
      }

      // Send workspace welcome email (fire-and-forget)
      const googleWorkspaceUrl = buildWorkspaceUrl(subdomain);
      LandingSignupController.sendWorkspaceWelcomeEmail({
        to: email,
        name: name,
        planName: actualPlanName,
        workspaceUrl: googleWorkspaceUrl,
      }).catch(err => console.error('Welcome email error (Google):', err));

      let adminAction: any = { action: 'UNKNOWN' };
      try {
        const adminUrlG2 = process.env.ADMIN_API_URL || 'http://localhost:5000';
        const onboardRes = await axios.post(`${adminUrlG2}/api/subscriptions/onboard`, {
          tenantId,
          planId,
          billingCycle: (safePlanConfig.billing || 'monthly').toUpperCase()
        });
        adminAction = onboardRes.data?.data || { action: 'ERROR' };
      } catch (onboardErr: any) {
        console.error('Google signup: onboard API error', onboardErr);
        const errorMsg = onboardErr.response?.data?.error || onboardErr.response?.data?.message || onboardErr.message || 'Unknown error';
        adminAction = { action: 'API_ERROR', message: errorMsg };
      }

      // Fetch the newly created user to generate auth tokens (auto-login after signup)
      const newUserResult = await pool.query(
        `SELECT u.id, u.tenant_id, u.name, u.work_email, u.role
         FROM users u WHERE u.tenant_id = $1 AND u.work_email = $2 LIMIT 1`,
        [tenantId, email]
      );

      let accessToken: string | undefined;
      if (newUserResult.rows.length > 0) {
        const newUser = newUserResult.rows[0];
        const authUser = {
          id: newUser.id,
          tenantId: newUser.tenant_id,
          email: newUser.work_email,
          role: newUser.role,
          position: null,
          name: newUser.name,
        };
        const tokens = JWTUtils.generateTokenPair(authUser);
        accessToken = tokens.accessToken;

        // Set refresh token as httpOnly cookie — genuinely the same options as
        // the login flow now. It previously used sameSite "lax", which the
        // browser drops here: signup is submitted from the marketing site to the
        // API on a different registrable domain, so the response is cross-site
        // and only "none" is stored. The result was a refresh cookie that
        // silently never existed, ending the session at the first access-token
        // expiry instead of after seven days. `path` is set for the same reason
        // login sets it — so the cookie is sent for every API path.
        res.cookie("refreshToken", tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          path: "/",
        });
      }

      res.status(200).json({
        success: true,
        tenantSubdomain: subdomain,
        email,
        name,
        accessToken: accessToken ?? null,
        decision: adminAction,
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
      let msPlanId = parseInt(planConfig?.tier);
      let msActualPlanName = 'Free Trial';

      const adminUrlMs = process.env.ADMIN_API_URL || 'http://localhost:5000';
      try {
        const plansRes = await axios.get(`${adminUrlMs}/api/plans`);
        const allPlans = Array.isArray(plansRes.data) ? plansRes.data : (plansRes.data?.data || []);
        if (isNaN(msPlanId)) {
          const trialPlan = allPlans.find((p: any) => p.trial_days > 0);
          msPlanId = trialPlan ? trialPlan.id : 1;
        }
        const selectedPlan = allPlans.find((p: any) => p.id === msPlanId);
        if (selectedPlan) msActualPlanName = selectedPlan.name;
      } catch { /* use default */ }

      const planType = msActualPlanName;

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

      let tenantId: string = "";
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
        tenantId = tenantResult.rows[0].id;

        // Create User
        await dbClient.query(
          `INSERT INTO users (id, tenant_id, name, work_email, personal_email, phone, password_hash, role, is_active, work_days, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $3, '', $4, 'super_admin', true, '{1,2,3,4,5}', now(), now())`,
          [tenantId, name.trim(), email, dummyPasswordHash]
        );

        await dbClient.query("COMMIT");
        await RBACService.setupDefaultRolesForTenant(tenantId);

        // Record which brand door this signup came through. Without it the
        // tenant is "unmanaged", which means full access -- safe for Zukvo but
        // wrong for Testiez, which would get the entire suite. Best-effort:
        // a failure here must not fail an otherwise complete signup, but it
        // is loud because the tenant is over-provisioned until it is fixed.
        try {
          await grantProduct(tenantId, productFromRequest(req) ?? "zukvo", { source: "signup" });
        } catch (grantErr) {
          console.error(`[signup] tenant ${tenantId} created WITHOUT a product grant -- it will behave as unmanaged (full access) until granted:`, grantErr);
        }
      } catch (txError) {
        await dbClient.query("ROLLBACK");
        throw txError;
      } finally {
        dbClient.release();
      }

      // Send workspace welcome email (fire-and-forget)
      const msWorkspaceUrl = buildWorkspaceUrl(subdomain);
      LandingSignupController.sendWorkspaceWelcomeEmail({
        to: email,
        name: name,
        planName: planType,
        workspaceUrl: msWorkspaceUrl,
      }).catch(err => console.error('Welcome email error (Microsoft):', err));

      let msAdminAction: any = { action: 'UNKNOWN' };
      try {
        const adminUrlMs2 = process.env.ADMIN_API_URL || 'http://localhost:5000';
        const onboardResMs = await axios.post(`${adminUrlMs2}/api/subscriptions/onboard`, {
          tenantId,
          planId: msPlanId,
          billingCycle: (safePlanConfig.billing || 'monthly').toUpperCase()
        });
        msAdminAction = onboardResMs.data?.data || { action: 'ERROR' };
      } catch (onboardErr: any) {
        console.error('Microsoft signup: onboard API error', onboardErr);
        const errorMsg = onboardErr.response?.data?.error || onboardErr.response?.data?.message || onboardErr.message || 'Unknown error';
        msAdminAction = { action: 'API_ERROR', message: errorMsg };
      }

      // Fetch the newly created user to generate auth tokens (auto-login after signup)
      const newUserResult = await pool.query(
        `SELECT u.id, u.tenant_id, u.name, u.work_email, u.role
         FROM users u WHERE u.tenant_id = $1 AND u.work_email = $2 LIMIT 1`,
        [tenantId, email]
      );

      let accessToken: string | undefined;
      if (newUserResult.rows.length > 0) {
        const newUser = newUserResult.rows[0];
        const authUser = {
          id: newUser.id,
          tenantId: newUser.tenant_id,
          email: newUser.work_email,
          role: newUser.role,
          position: null,
          name: newUser.name,
        };
        const tokens = JWTUtils.generateTokenPair(authUser);
        accessToken = tokens.accessToken;

        // Set refresh token as httpOnly cookie — genuinely the same options as
        // the login flow now. It previously used sameSite "lax", which the
        // browser drops here: signup is submitted from the marketing site to the
        // API on a different registrable domain, so the response is cross-site
        // and only "none" is stored. The result was a refresh cookie that
        // silently never existed, ending the session at the first access-token
        // expiry instead of after seven days. `path` is set for the same reason
        // login sets it — so the cookie is sent for every API path.
        res.cookie("refreshToken", tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          path: "/",
        });
      }

      res.status(200).json({
        success: true,
        tenantSubdomain: subdomain,
        email,
        name,
        accessToken: accessToken ?? null,
        decision: msAdminAction,
      });
    } catch (error: any) {
      console.error("Microsoft signup error:", error?.message || error);
      res.status(500).json({ success: false, error: error?.message || "Something went wrong. Please try again." });
    }
  }

  private static async sendWorkspaceWelcomeEmail(opts: {
    to: string;
    name: string;
    planName: string;
    workspaceUrl: string;
  }): Promise<void> {
    const { to, name, planName, workspaceUrl } = opts;
    const firstName = name.split(' ')[0];

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%); padding: 40px 40px 50px; border-radius: 16px 16px 0 0; text-align: center;">
          <div style="font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; margin-bottom: 8px;">Zukvo</div>
          <div style="font-size: 15px; color: rgba(255,255,255,0.8);">Your workspace is ready 🎉</div>
        </div>

        <!-- Body -->
        <div style="padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
          <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 12px;">Congratulations, ${firstName}!</h1>
          <p style="font-size: 15px; color: #6b7280; line-height: 1.7; margin: 0 0 28px;">
            Your Zukvo workspace has been successfully created. Here are your workspace details:
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
            If you have any questions, reply to this email or contact us at <a href="mailto:support@zukvo.com" style="color: #6366f1; text-decoration: none;">support@zukvo.com</a>.
          </p>
        </div>
      </div>
    `;

    await emailService.sendCentralizedMail({
      to,
      subject: `🎉 Your Zukvo workspace is ready, ${firstName}!`,
      html,
      text: `Hi ${firstName}, your Zukvo workspace is ready! Plan: ${planName} | Email: ${to} | Access it here: ${workspaceUrl}`,
    });
  }
}
