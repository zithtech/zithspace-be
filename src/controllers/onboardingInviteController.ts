import { Response } from "express";
import crypto from "crypto";

import { AuthRequest } from "@/types";
import { withTenant, onboardingPool } from "@/db/onboardingPool";
import { emailService } from "@/utils/emailService";
import { createPersonalDetails, getPersonalDetails, updatePersonalDetails } from "./createEmployeeDetailes";
import { getBankPayrollDetails, updateBankPayrollDetails } from "./bankAndPayrolllController";
import { getEmployeeHistory, createEmployeeHistory, deleteAllEmployeeHistory } from "./employeeHistoryController";
import { fetchActiveDocumentTypes } from "./onboardingDocumentTypeController";

// Sections an employee is allowed to self-fill via the public link.
const EMPLOYEE_SECTIONS = ["personal", "bank", "history"] as const;
const INVITE_TTL_DAYS = Number(process.env.ONBOARDING_INVITE_TTL_DAYS ?? 7);

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Build a synthetic AuthRequest so the raw-SQL section controllers can run
 *  outside the HTTP auth flow (public submit) or inside another tenant tx. */
function actorReq(tenantId: string, userId: string, body: any): AuthRequest {
  return { user: { id: userId }, tenantId, params: {}, body } as any;
}

/**
 * Per-tenant frontend origin for invite links, e.g. https://acme.zukvo.com.
 * Each tenant has its own subdomain, so the link must point at the tenant's
 * own host — not a single hardcoded FRONTEND_URL (which would send every new
 * hire to one tenant's domain). Falls back to FRONTEND_URL for local dev
 * where there is no subdomain-based routing.
 */
function frontendBase(subdomain?: string | null): string {
  if (subdomain) {
    const baseDomain = process.env.TENANT_BASE_DOMAIN || "zukvo.com";
    return `https://${subdomain}.${baseDomain}`;
  }
  return process.env.FRONTEND_URL || "http://localhost:3000";
}

/** Branded HTML for the onboarding-invite email. */
function inviteEmailHtml(opts: { firstName: string; link: string; expiresAt: string | Date }): string {
  const expires = new Date(opts.expiresAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `
  <div style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="padding:22px 28px;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">Welcome aboard 👋</div>
      </div>
      <div style="padding:24px 28px;color:#334155;font-size:14px;line-height:1.6;">
        <p style="margin:0 0 14px;">Hi ${opts.firstName || "there"},</p>
        <p style="margin:0 0 18px;">
          You've been invited to complete your onboarding. Use the secure link below to fill in your
          personal, bank &amp; payroll, and work-history details. It only takes a few minutes.
        </p>
        <a href="${opts.link}"
           style="display:inline-block;background:#3B82F6;color:#ffffff;text-decoration:none;font-weight:600;
                  font-size:14px;padding:12px 22px;border-radius:8px;">
          Complete your onboarding
        </a>
        <p style="margin:18px 0 0;font-size:12px;color:#94a3b8;">
          This private link expires on <strong>${expires}</strong>. If the button doesn't work, copy this URL:<br/>
          <span style="word-break:break-all;color:#64748b;">${opts.link}</span>
        </p>
      </div>
    </div>
  </div>`;
}

// ──────────────────────────────────────────────────────────────────────────
// HR-side (authenticated) handlers
// ──────────────────────────────────────────────────────────────────────────

/**
 * POST /api/onboarding/invite
 * HR seeds a draft employee (kept inactive: status=false) and gets a tokenized,
 * time-limited public link the new hire uses to fill Personal / Bank / History.
 */
export async function createInvite(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const { firstName, lastName, workEmail, personalEmail, mobile, gender, dob } = req.body || {};
    if (!firstName || !lastName || !workEmail) {
      return res.status(400).json({
        success: false,
        error: "firstName, lastName and workEmail are required to create an invite",
      });
    }

    const userId = req.user.id;
    const tenantId = req.tenantId;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);

    const result = await withTenant(tenantId, async (client) => {
      // 1. Create the draft employee (generates employee_code, status=true).
      const employee = await createPersonalDetails(
        actorReq(tenantId, userId, {
          personal: {
            firstName,
            lastName,
            workEmail,
            personalEmail: personalEmail || null,
            // NOT NULL columns the employee will correct later via the link.
            // Must be non-empty: createPersonalDetails coerces falsy -> NULL.
            mobile: mobile || "0000000000",
            gender: gender || "Unspecified",
            dob: dob || "1970-01-01",
          },
        }),
        undefined,
        client,
      );

      // 2. Mark it inactive so it stays out of active employee / leave / payroll
      //    queries until HR completes and activates it.
      await client.query(
        `UPDATE employees SET status = false, updated_by = $1, updated_at = now()
          WHERE id = $2 AND tenant_id = $3`,
        [userId, employee.id, tenantId],
      );

      // 3. Persist the invite token (hashed) + expiry.
      const invite = await client.query(
        `INSERT INTO employee_onboarding_invites
           (tenant_id, employee_id, token_hash, sections, status, expires_at, created_by)
         VALUES ($1, $2, $3, $4, 'invited', now() + ($5 || ' days')::interval, $6)
         RETURNING id, expires_at`,
        [tenantId, employee.id, tokenHash, EMPLOYEE_SECTIONS as unknown as string[], String(INVITE_TTL_DAYS), userId],
      );

      return { employee, invite: invite.rows[0] };
    });

    const link = `${frontendBase(req.tenant?.subdomain)}/onboard/${token}`;

    // Email the link to the new hire at BOTH their work and personal addresses.
    // Best-effort: a mail failure must not fail invite creation.
    const recipients = [workEmail, personalEmail].filter(Boolean) as string[];
    let emailed = false;
    try {
      await emailService.sendCentralizedMail({
        tenantId,
        to: recipients.join(", "),
        subject: "Complete your onboarding",
        html: inviteEmailHtml({ firstName, link, expiresAt: result.invite.expires_at }),
        text:
          `Hi ${firstName || "there"},\n\n` +
          `You've been invited to complete your onboarding. Use this secure link:\n${link}\n\n` +
          `It expires on ${new Date(result.invite.expires_at).toDateString()}.`,
      });
      emailed = true;
    } catch (mailErr) {
      console.error("createInvite: failed to email onboarding link:", mailErr);
    }

    return res.status(201).json({
      success: true,
      message: "Onboarding invite created",
      data: {
        inviteId: result.invite.id,
        employeeId: result.employee.id,
        employeeCode: result.employee.employee_code,
        link,
        token, // returned ONCE so the caller can copy/share it
        expiresAt: result.invite.expires_at,
        sections: EMPLOYEE_SECTIONS,
        emailed,
        emailedTo: recipients,
      },
    });
  } catch (err: any) {
    console.error("createInvite error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
  }
}

/**
 * GET /api/onboarding/invites
 * Lists draft/pending onboarding records for the tenant (the "awaiting" queue).
 */
export async function listInvites(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const data = await withTenant(req.tenantId, async (db) => {
      const { rows } = await db.query(
        `SELECT i.id, i.employee_id, i.status, i.sections,
                i.expires_at, i.created_at, i.submitted_at, i.completed_at,
                (i.expires_at < now()) AS is_expired,
                e.first_name, e.last_name, e.employee_code, e.work_email,
                e.personal_email, e.status AS employee_active
           FROM employee_onboarding_invites i
           JOIN employees e ON e.id = i.employee_id
          WHERE i.tenant_id = $1 AND i.status <> 'revoked'
          ORDER BY i.created_at DESC`,
        [req.tenantId],
      );
      return rows.map((r: any) => ({
        inviteId: r.id,
        employeeId: r.employee_id,
        employeeCode: r.employee_code,
        firstName: r.first_name,
        lastName: r.last_name,
        workEmail: r.work_email,
        personalEmail: r.personal_email,
        status: r.status,
        sections: r.sections,
        isExpired: r.is_expired,
        expiresAt: r.expires_at,
        submittedAt: r.submitted_at,
        completedAt: r.completed_at,
        createdAt: r.created_at,
      }));
    });

    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    console.error("listInvites error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
  }
}

/** POST /api/onboarding/invite/:inviteId/revoke — disables the public link. */
export async function revokeInvite(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");
    const { inviteId } = req.params;

    const ok = await withTenant(req.tenantId, async (db) => {
      const { rowCount } = await db.query(
        `UPDATE employee_onboarding_invites
            SET status = 'revoked', updated_at = now()
          WHERE id = $1 AND tenant_id = $2 AND status <> 'completed'`,
        [inviteId, req.tenantId],
      );
      return (rowCount ?? 0) > 0;
    });

    if (!ok) return res.status(404).json({ success: false, error: "Invite not found or already completed" });
    return res.status(200).json({ success: true, message: "Invite revoked" });
  } catch (err: any) {
    console.error("revokeInvite error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
  }
}

/**
 * PUT /api/onboarding/invite/:employeeId
 * Lightweight edit of a draft's name + emails (used from the Invites queue).
 * Deliberately a narrow UPDATE on `employees` — unlike the full onboarding
 * update it does NOT touch addresses/identity/etc., so an HR name fix never
 * wipes details the employee already submitted.
 */
export async function updateInviteContact(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");
    const { employeeId } = req.params;
    const { firstName, lastName, workEmail, personalEmail } = req.body || {};

    const row = await withTenant(req.tenantId, async (db) => {
      const sets: string[] = [];
      const params: any[] = [req.tenantId, employeeId];
      const push = (col: string, val: any) => {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      };
      if (firstName !== undefined) push("first_name", firstName);
      if (lastName !== undefined) push("last_name", lastName);
      if (workEmail !== undefined) push("work_email", workEmail);
      if (personalEmail !== undefined) push("personal_email", personalEmail || null);
      if (sets.length === 0) return null;
      push("updated_by", req.user!.id);
      const { rows } = await db.query(
        `UPDATE employees
            SET ${sets.join(", ")}, updated_at = now()
          WHERE tenant_id = $1 AND id = $2
        RETURNING id, first_name, last_name, work_email, personal_email`,
        params,
      );
      return rows[0] || null;
    });

    if (!row) return res.status(404).json({ success: false, error: "Employee not found" });
    return res.status(200).json({
      success: true,
      data: {
        employeeId: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        workEmail: row.work_email,
        personalEmail: row.personal_email,
      },
    });
  } catch (err: any) {
    console.error("updateInviteContact error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
  }
}

/**
 * POST /api/onboarding/:employeeId/activate
 * HR finalizes onboarding: marks the employee active and the invite completed.
 */
export async function activateEmployee(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");
    const { employeeId } = req.params;

    const ok = await withTenant(req.tenantId, async (db) => {
      const { rowCount } = await db.query(
        `UPDATE employees SET status = true, updated_by = $1, updated_at = now()
          WHERE id = $2 AND tenant_id = $3`,
        [req.user!.id, employeeId, req.tenantId],
      );
      await db.query(
        `UPDATE employee_onboarding_invites
            SET status = 'completed', completed_at = now(), updated_at = now()
          WHERE employee_id = $1 AND tenant_id = $2 AND status <> 'revoked'`,
        [employeeId, req.tenantId],
      );
      return (rowCount ?? 0) > 0;
    });

    if (!ok) return res.status(404).json({ success: false, error: "Employee not found" });
    return res.status(200).json({ success: true, message: "Employee activated" });
  } catch (err: any) {
    console.error("activateEmployee error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Public (unauthenticated) handlers — the token IS the credential
// ──────────────────────────────────────────────────────────────────────────

type InviteRow = {
  id: string;
  tenant_id: string;
  employee_id: string;
  status: string;
  sections: string[];
  expires_at: string;
  created_by: string | null;
};

/** Resolve + validate an invite by raw token (no tenant context needed —
 *  token_hash is globally unique). Returns null when invalid/expired/closed. */
async function resolveInvite(token: string): Promise<InviteRow | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const { rows } = await onboardingPool.query(
    `SELECT id, tenant_id, employee_id, status, sections, expires_at, created_by
       FROM employee_onboarding_invites
      WHERE token_hash = $1
      LIMIT 1`,
    [tokenHash],
  );
  const invite = rows[0] as InviteRow | undefined;
  if (!invite) return null;
  if (invite.status === "revoked" || invite.status === "completed") return null;
  if (new Date(invite.expires_at).getTime() < Date.now()) return null;
  return invite;
}

/**
 * GET /api/public/onboarding/:token
 * Returns the editable sections + any data already filled (so the form prefills).
 * Never exposes Employment or Assets.
 */
export async function getPublicInvite(req: AuthRequest, res: Response) {
  try {
    const invite = await resolveInvite(req.params.token);
    if (!invite) {
      return res.status(404).json({ success: false, error: "This onboarding link is invalid or has expired" });
    }

    const actor = actorReq(invite.tenant_id, invite.created_by || invite.employee_id, {});

    const [personal, bank, history, documentTypes] = await Promise.all([
      getPersonalDetails(actor, invite.employee_id).catch(() => null),
      getBankPayrollDetails(actor, invite.employee_id).catch(() => null),
      getEmployeeHistory(actor, invite.employee_id).catch(() => []),
      fetchActiveDocumentTypes(onboardingPool, invite.tenant_id).catch(() => []),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        status: invite.status,
        sections: invite.sections,
        expiresAt: invite.expires_at,
        employee: personal
          ? { firstName: (personal as any).firstName, lastName: (personal as any).lastName, employeeCode: (personal as any).employee_code }
          : null,
        // Only the employee-editable sections are returned.
        personal,
        bank,
        history,
        // Tenant catalog of documents to request per Employment-History entry.
        documentTypes,
      },
    });
  } catch (err: any) {
    console.error("getPublicInvite error:", err);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
}

/**
 * POST /api/public/onboarding/:token
 * The new hire submits Personal / Bank / History. Employment & Assets in the
 * body are ignored — HR fills those.
 */
export async function submitPublicInvite(req: AuthRequest, res: Response) {
  try {
    const invite = await resolveInvite(req.params.token);
    if (!invite) {
      return res.status(404).json({ success: false, error: "This onboarding link is invalid or has expired" });
    }

    const { personal, bank, history } = req.body || {};
    if (!personal && !bank && history === undefined) {
      return res.status(400).json({ success: false, error: "Nothing to submit" });
    }

    const actorId = invite.created_by || invite.employee_id;

    await withTenant(invite.tenant_id, async (client) => {
      if (personal) {
        await updatePersonalDetails(
          actorReq(invite.tenant_id, actorId, { personal }),
          invite.employee_id,
          client,
        );
      }
      if (bank) {
        await updateBankPayrollDetails(
          actorReq(invite.tenant_id, actorId, { bank }),
          invite.employee_id,
          client,
        );
      }
      if (history !== undefined) {
        await deleteAllEmployeeHistory(
          actorReq(invite.tenant_id, actorId, {}),
          invite.employee_id,
          client,
        );
        if (Array.isArray(history) && history.length > 0) {
          await createEmployeeHistory(
            actorReq(invite.tenant_id, actorId, { history }),
            invite.employee_id,
            client,
          );
        }
      }

      await client.query(
        `UPDATE employee_onboarding_invites
            SET status = 'employee_submitted', submitted_at = now(), updated_at = now()
          WHERE id = $1`,
        [invite.id],
      );
    });

    return res.status(200).json({ success: true, message: "Details submitted successfully" });
  } catch (err: any) {
    console.error("submitPublicInvite error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
  }
}
