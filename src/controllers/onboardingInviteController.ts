import { Response } from "express";
import crypto from "crypto";

import { AuthRequest } from "@/types";
import { withTenant, onboardingPool } from "@/db/onboardingPool";
import { emailService } from "@/utils/emailService";
import { brandForRequest, tenantOrigin } from "@/config/brand";
import { createPersonalDetails, getPersonalDetails, updatePersonalDetails } from "./createEmployeeDetailes";
import { getBankPayrollDetails, updateBankPayrollDetails } from "./bankAndPayrolllController";
import { getEmployeeHistory, createEmployeeHistory, deleteAllEmployeeHistory } from "./employeeHistoryController";
import { fetchActiveDocumentTypes } from "./onboardingDocumentTypeController";
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from "@/utils/transactionHistory";

const empName = (r: any) => [r?.first_name, r?.last_name].filter(Boolean).join(" ").trim();
const empLabel = (r: any) => `${r?.employee_code ?? ""}${r?.employee_code && empName(r) ? " · " : ""}${empName(r)}`.trim() || "Employee";

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
 *
 * The BRAND half matters just as much as the subdomain: an invite sent from
 * the Testiez surface has to land on {slug}.testiez.com. Sending a Testiez hire
 * to zukvo.com tells them about a product nobody sold them. `req` is passed so
 * the brand comes from the origin the inviter was actually looking at — see
 * config/brand.ts for the resolution order.
 */
function frontendBase(subdomain: string | null | undefined, req?: AuthRequest): string {
  return tenantOrigin(subdomain, brandForRequest(req));
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

    const nameRegex = /^[A-Za-z\s]+$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const mobileRegex = /^[0-9]{7,15}$/;
    if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) {
      return res.status(400).json({ success: false, error: "First and last name must contain only letters and spaces" });
    }
    if (!emailRegex.test(workEmail) || (personalEmail && !emailRegex.test(personalEmail))) {
      return res.status(400).json({ success: false, error: "Invalid email format" });
    }
    if (mobile && !mobileRegex.test(mobile)) {
      return res.status(400).json({ success: false, error: "Mobile must be 7-15 digits" });
    }


    const userId = req.user.id;
    const tenantId = req.tenantId;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);

    const result = await withTenant(tenantId, async (client) => {
      // 1. Check if an employee record already exists in onboarding for this email
      const existingEmp = await client.query(
        `SELECT id, employee_code, first_name, last_name, date_of_birth FROM employees 
           WHERE tenant_id = $1 AND (LOWER(work_email) = LOWER($2) OR (personal_email IS NOT NULL AND LOWER(personal_email) = LOWER($2))) 
           ORDER BY (CASE WHEN date_of_birth IS NOT NULL AND date_of_birth::text NOT LIKE '1970-01-01%' THEN 0 ELSE 1 END) ASC, created_at ASC 
           LIMIT 1`,
        [tenantId, workEmail.trim()]
      );

      let employee = existingEmp.rows[0];

      if (!employee) {
        // Create the draft employee only if one does not already exist
        employee = await createPersonalDetails(
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

        // Mark it inactive so it stays out of active employee / leave / payroll
        // queries until HR completes and activates it.
        await client.query(
          `UPDATE employees SET status = false, updated_by = $1, updated_at = now()
            WHERE id = $2 AND tenant_id = $3`,
          [userId, employee.id, tenantId],
        );
      }

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

    const link = `${frontendBase(req.tenant?.subdomain, req)}/onboard/${token}`;

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

    recordTransaction({
      req,
      section: Section.HR,
      module: Module.ONBOARDING,
      page: Page.ONBOARDING_INVITES,
      action: Action.CREATE,
      actionLabel: `Created onboarding invite for ${firstName} ${lastName} (${result.employee.employee_code})`,
      entityType: EntityType.ONBOARDING_INVITE,
      entityId: result.invite.id,
      entityLabel: empLabel(result.employee),
      afterData: {
        employeeCode: result.employee.employee_code,
        firstName,
        lastName,
        workEmail,
        personalEmail: personalEmail || null,
        status: "invited",
        sections: EMPLOYEE_SECTIONS,
        emailed,
      },
    });

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
 * POST /api/onboarding/invite/:inviteId/regenerate
 * Regenerates an expired invite with a new token and expiry, and re-sends the email.
 */
export async function regenerateInvite(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");
    const { inviteId } = req.params;

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);

    const result = await withTenant(req.tenantId, async (db) => {
      const { rows: inviteRows } = await db.query(
        `SELECT i.id, i.employee_id, e.first_name, e.last_name, e.work_email, e.personal_email, e.employee_code 
           FROM employee_onboarding_invites i
           JOIN employees e ON e.id = i.employee_id
          WHERE i.id = $1 AND i.tenant_id = $2`,
        [inviteId, req.tenantId]
      );
      const inviteData = inviteRows[0];
      if (!inviteData) return null;

      const { rows: updatedRows } = await db.query(
        `UPDATE employee_onboarding_invites
            SET token_hash = $1,
                expires_at = now() + ($2 || ' days')::interval,
                status = 'invited',
                updated_at = now()
          WHERE id = $3 AND tenant_id = $4
          RETURNING id, expires_at`,
        [tokenHash, String(INVITE_TTL_DAYS), inviteId, req.tenantId]
      );
      
      return { inviteData, updatedInvite: updatedRows[0] };
    });

    if (!result) return res.status(404).json({ success: false, error: "Invite not found" });

    const link = `${frontendBase(req.tenant?.subdomain, req)}/onboard/${token}`;

    const { first_name, work_email, personal_email } = result.inviteData;
    const recipients = [work_email, personal_email].filter(Boolean) as string[];
    let emailed = false;
    
    try {
      await emailService.sendCentralizedMail({
        tenantId: req.tenantId,
        to: recipients.join(", "),
        subject: "Action required: Your onboarding link has been regenerated",
        html: inviteEmailHtml({ firstName: first_name, link, expiresAt: result.updatedInvite.expires_at }),
        text:
          `Hi ${first_name || "there"},\n\n` +
          `Your onboarding invite has been regenerated. Use this secure link:\n${link}\n\n` +
          `It expires on ${new Date(result.updatedInvite.expires_at).toDateString()}.`,
      });
      emailed = true;
    } catch (mailErr) {
      console.error("regenerateInvite: failed to email onboarding link:", mailErr);
    }

    recordTransaction({
      req,
      section: Section.HR,
      module: Module.ONBOARDING,
      page: Page.ONBOARDING_INVITES,
      action: Action.UPDATE,
      actionLabel: `Regenerated onboarding invite for ${result.inviteData.first_name} ${result.inviteData.last_name}`,
      entityType: EntityType.ONBOARDING_INVITE,
      entityId: inviteId,
      entityLabel: empLabel(result.inviteData),
      afterData: {
        status: "invited",
        emailed,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Onboarding invite regenerated",
      data: {
        inviteId,
        link,
        token,
        expiresAt: result.updatedInvite.expires_at,
        emailed,
        emailedTo: recipients,
      }
    });
  } catch (err: any) {
    console.error("regenerateInvite error:", err);
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
    const { search, limit, offset, status } = req.query;

    const payload = await withTenant(req.tenantId, async (db) => {
      // 1. Fetch global stats
      const statsRes = await db.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'invited' THEN 1 ELSE 0 END) as invited,
          SUM(CASE WHEN status = 'employee_submitted' THEN 1 ELSE 0 END) as submitted,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
         FROM employee_onboarding_invites WHERE tenant_id = $1 AND status <> 'revoked'`,
        [req.tenantId]
      );
      
      const stats = {
        total: Number(statsRes.rows[0].total) || 0,
        invited: Number(statsRes.rows[0].invited) || 0,
        submitted: Number(statsRes.rows[0].submitted) || 0,
        completed: Number(statsRes.rows[0].completed) || 0,
      };

      // 2. Build filtered query
      const conditions = ["i.tenant_id = $1", "i.status <> 'revoked'"];
      const params: any[] = [req.tenantId];

      if (typeof status === 'string' && status !== 'all') {
        params.push(status);
        conditions.push(`i.status = $${params.length}`);
      }

      if (typeof search === 'string' && search.trim() !== '') {
        params.push(`%${search}%`);
        conditions.push(`(e.first_name ILIKE $${params.length} OR e.last_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length} OR (e.first_name || ' ' || e.last_name) ILIKE $${params.length})`);
      }

      const whereClause = `WHERE ${conditions.join(" AND ")}`;

      // 3. Get total count for pagination
      const countRes = await db.query(
        `SELECT COUNT(*) FROM employee_onboarding_invites i JOIN employees e ON e.id = i.employee_id ${whereClause}`,
        params
      );
      const total = Number(countRes.rows[0].count) || 0;

      // 4. Fetch page of invites
      let sql = `SELECT i.id, i.employee_id, i.status, i.sections,
                i.expires_at, i.created_at, i.submitted_at, i.completed_at,
                (i.expires_at < now()) AS is_expired,
                e.first_name, e.last_name, e.employee_code, e.work_email,
                e.personal_email, e.status AS employee_active
           FROM employee_onboarding_invites i
           JOIN employees e ON e.id = i.employee_id
           ${whereClause}
           ORDER BY i.created_at DESC`;

      if (typeof limit === 'string') {
        params.push(parseInt(limit, 10));
        sql += ` LIMIT $${params.length}`;
      }
      if (typeof offset === 'string') {
        params.push(parseInt(offset, 10));
        sql += ` OFFSET $${params.length}`;
      }

      const { rows } = await db.query(sql, params);

      const data = rows.map((r: any) => ({
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

      return { data, total, stats };
    });

    return res.status(200).json({ success: true, ...payload });
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

    const revoked = await withTenant(req.tenantId, async (db) => {
      const { rows } = await db.query(
        `WITH prev AS (
           SELECT status FROM employee_onboarding_invites WHERE id = $1 AND tenant_id = $2
         ),
         upd AS (
           UPDATE employee_onboarding_invites
              SET status = 'revoked', updated_at = now()
            WHERE id = $1 AND tenant_id = $2 AND status <> 'completed'
            RETURNING employee_id
         )
         SELECT u.employee_id, (SELECT status FROM prev) AS prev_status,
                e.employee_code, e.first_name, e.last_name
           FROM upd u JOIN employees e ON e.id = u.employee_id`,
        [inviteId, req.tenantId],
      );
      return rows[0] || null;
    });

    if (!revoked) return res.status(404).json({ success: false, error: "Invite not found or already completed" });

    recordTransaction({
      req,
      section: Section.HR,
      module: Module.ONBOARDING,
      page: Page.ONBOARDING_INVITES,
      action: Action.REVOKE,
      actionLabel: `Revoked onboarding invite for ${empLabel(revoked)}`,
      entityType: EntityType.ONBOARDING_INVITE,
      entityId: inviteId,
      entityLabel: empLabel(revoked),
      beforeData: { status: revoked.prev_status },
      afterData: { status: "revoked" },
      changedFields: ["status"],
    });

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

    const nameRegex = /^[A-Za-z\s]+$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if ((firstName && !nameRegex.test(firstName)) || (lastName && !nameRegex.test(lastName))) {
      return res.status(400).json({ success: false, error: "First and last name must contain only letters and spaces" });
    }
    if ((workEmail && !emailRegex.test(workEmail)) || (personalEmail && !emailRegex.test(personalEmail))) {
      return res.status(400).json({ success: false, error: "Invalid email format" });
    }


    const result = await withTenant(req.tenantId, async (db) => {
      const beforeRes = await db.query(
        `SELECT employee_code, first_name, last_name, work_email, personal_email
           FROM employees WHERE tenant_id = $1 AND id = $2`,
        [req.tenantId, employeeId],
      );
      const before = beforeRes.rows[0];
      if (!before) return null;

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
      if (sets.length === 0) return { before, after: before };
      push("updated_by", req.user!.id);
      const { rows } = await db.query(
        `UPDATE employees
            SET ${sets.join(", ")}, updated_at = now()
          WHERE tenant_id = $1 AND id = $2
        RETURNING id, employee_code, first_name, last_name, work_email, personal_email`,
        params,
      );
      return { before, after: rows[0] || null };
    });

    if (!result || !result.after) return res.status(404).json({ success: false, error: "Employee not found" });
    const row = result.after;

    const snap = (r: any) => ({
      firstName: r.first_name,
      lastName: r.last_name,
      workEmail: r.work_email,
      personalEmail: r.personal_email,
    });
    const { changedFields, before: b, after: a } = diffShallow(snap(result.before), snap(result.after));
    if (changedFields.length > 0) {
      recordTransaction({
        req,
        section: Section.HR,
        module: Module.ONBOARDING,
        page: Page.ONBOARDING_INVITES,
        action: Action.UPDATE,
        actionLabel: `Updated onboarding contact for ${empLabel(result.after)}`,
        entityType: EntityType.EMPLOYEE,
        entityId: employeeId,
        entityLabel: empLabel(result.after),
        beforeData: b,
        afterData: a,
        changedFields,
      });
    }

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

    const activated = await withTenant(req.tenantId, async (db) => {
      const { rows } = await db.query(
        `UPDATE employees SET status = true, updated_by = $1, updated_at = now()
          WHERE id = $2 AND tenant_id = $3
        RETURNING employee_code, first_name, last_name`,
        [req.user!.id, employeeId, req.tenantId],
      );
      if (!rows[0]) return null;
      await db.query(
        `UPDATE employee_onboarding_invites
            SET status = 'completed', completed_at = now(), updated_at = now()
          WHERE employee_id = $1 AND tenant_id = $2 AND status <> 'revoked'`,
        [employeeId, req.tenantId],
      );
      return rows[0];
    });

    if (!activated) return res.status(404).json({ success: false, error: "Employee not found" });

    recordTransaction({
      req,
      section: Section.HR,
      module: Module.ONBOARDING,
      page: Page.ONBOARDING_EMPLOYEES,
      action: Action.ACTIVATE,
      actionLabel: `Activated employee ${empLabel(activated)}`,
      entityType: EntityType.EMPLOYEE,
      entityId: employeeId,
      entityLabel: empLabel(activated),
      beforeData: { status: false, inviteStatus: "employee_submitted" },
      afterData: { status: true, inviteStatus: "completed" },
      changedFields: ["status", "inviteStatus"],
    });

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

    const emp = await withTenant(invite.tenant_id, async (client) => {
      const { rows } = await client.query(
        `SELECT employee_code, first_name, last_name FROM employees WHERE id = $1 AND tenant_id = $2`,
        [invite.employee_id, invite.tenant_id],
      );
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

      return rows[0] || null;
    });

    // Public route: no auth middleware ran, so synthesize the actor/tenant that
    // recordTransaction needs. Attributed to the invite owner; actorType "system"
    // marks it as a non-staff (candidate-driven, via public link) submission.
    req.user = { id: actorId } as any;
    req.tenantId = invite.tenant_id;
    const submitted = [personal && "personal", bank && "bank", history !== undefined && "history"].filter(Boolean);
    recordTransaction({
      req,
      section: Section.HR,
      module: Module.ONBOARDING,
      page: Page.ONBOARDING_INVITES,
      action: Action.SUBMIT,
      actionLabel: `Onboarding details submitted via public link for ${empLabel(emp)} (${submitted.join(", ")})`,
      entityType: EntityType.ONBOARDING_INVITE,
      entityId: invite.id,
      entityLabel: empLabel(emp),
      actorType: "system",
      afterData: { status: "employee_submitted", submittedSections: submitted },
      metadata: { viaPublicLink: true, employeeId: invite.employee_id },
    });

    return res.status(200).json({ success: true, message: "Details submitted successfully" });
  } catch (err: any) {
    console.error("submitPublicInvite error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
  }
}
