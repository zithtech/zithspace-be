import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { TenantClient } from '../db/pool';
import { PasswordProtectionMode, AgreementPasswordMode, PasswordScope, SecuritySettings } from '../types';

const SALT_ROUNDS = 12;

export interface UnlockActor {
  actorId: string | null;
  actorType: 'STAFF_USER' | 'CLIENT_USER' | 'SYSTEM';
  ipAddress: string;
  userAgent?: string;
}

export interface SecurityPolicyUpdateInput {
  passwordProtectionMode?: PasswordProtectionMode;
  tenantPassword?: string;
  requirePasswordForPdf?: boolean;
}

/** Get tenant security policy and password status (without exposing password hash). */
export async function getTenantSecuritySettings(client: TenantClient): Promise<SecuritySettings> {
  const { rows } = await client.query<any>(
    `SELECT password_protection_mode AS "passwordProtectionMode",
            (tenant_password_hash IS NOT NULL AND tenant_password_hash != '') AS "hasTenantPassword",
            tenant_password_version AS "tenantPasswordVersion",
            require_password_for_pdf AS "requirePasswordForPdf",
            updated_at AS "updatedAt"
       FROM pa_branding
      WHERE tenant_id = $1`,
    [client.tenantId]
  );

  if (rows[0]) {
    return {
      passwordProtectionMode: rows[0].passwordProtectionMode || 'DISABLED',
      hasTenantPassword: Boolean(rows[0].hasTenantPassword),
      tenantPasswordVersion: rows[0].tenantPasswordVersion || 1,
      requirePasswordForPdf: rows[0].requirePasswordForPdf ?? true,
      updatedAt: rows[0].updatedAt,
    };
  }

  return {
    passwordProtectionMode: 'DISABLED',
    hasTenantPassword: false,
    tenantPasswordVersion: 1,
    requirePasswordForPdf: true,
  };
}

/** Update tenant security settings and default tenant password. */
export async function updateTenantSecuritySettings(
  client: TenantClient,
  input: SecurityPolicyUpdateInput,
  actor: UnlockActor
): Promise<SecuritySettings> {
  const current = await getTenantSecuritySettings(client);
  let passwordHash: string | null = null;
  let incrementVersion = false;

  if (input.tenantPassword && input.tenantPassword.trim().length > 0) {
    passwordHash = await bcrypt.hash(input.tenantPassword.trim(), SALT_ROUNDS);
    incrementVersion = true;
  }

  const newMode = input.passwordProtectionMode ?? current.passwordProtectionMode;
  const newRequirePdf = input.requirePasswordForPdf ?? current.requirePasswordForPdf;
  const newVersion = incrementVersion ? current.tenantPasswordVersion + 1 : current.tenantPasswordVersion;

  await client.query(
    `INSERT INTO pa_branding (
       tenant_id, password_protection_mode, tenant_password_hash,
       tenant_password_version, require_password_for_pdf
     )
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id) DO UPDATE SET
       password_protection_mode = EXCLUDED.password_protection_mode,
       tenant_password_hash = COALESCE(EXCLUDED.tenant_password_hash, pa_branding.tenant_password_hash),
       tenant_password_version = EXCLUDED.tenant_password_version,
       require_password_for_pdf = EXCLUDED.require_password_for_pdf,
       updated_at = now()`,
    [client.tenantId, newMode, passwordHash, newVersion, newRequirePdf]
  );

  await logAudit(client, {
    tenantId: client.tenantId,
    actorId: actor.actorId,
    actorType: actor.actorType,
    action: 'TENANT_SECURITY_POLICY_UPDATED',
    ipAddress: actor.ipAddress,
    details: {
      passwordProtectionMode: newMode,
      passwordUpdated: Boolean(passwordHash),
      tenantPasswordVersion: newVersion,
    },
  });

  return getTenantSecuritySettings(client);
}

/** Determines if an agreement requires password unlock. */
export async function evaluateAgreementLockStatus(
  client: TenantClient,
  agreementId: string
): Promise<{
  isLocked: boolean;
  reason?: string;
  scope?: PasswordScope;
}> {
  const tenantSettings = await getTenantSecuritySettings(client);

  if (tenantSettings.passwordProtectionMode === 'DISABLED') {
    return { isLocked: false };
  }

  const { rows } = await client.query<any>(
    `SELECT is_password_protected, password_mode, password_hash
       FROM pa_agreements
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, agreementId]
  );

  if (!rows[0]) {
    return { isLocked: false };
  }

  const agreement = rows[0];
  const mode: AgreementPasswordMode = agreement.password_mode || 'INHERIT_TENANT';

  if (mode === 'NONE') {
    return { isLocked: false };
  }

  if (mode === 'CUSTOM') {
    if (agreement.password_hash) {
      return { isLocked: true, scope: 'AGREEMENT' };
    }
    return { isLocked: tenantSettings.hasTenantPassword, scope: 'TENANT' };
  }

  if (tenantSettings.hasTenantPassword) {
    return { isLocked: true, scope: 'TENANT' };
  }

  return { isLocked: false };
}

/** Determines if a template requires password unlock. */
export async function evaluateTemplateLockStatus(
  client: TenantClient,
  templateId: string
): Promise<{
  isLocked: boolean;
  reason?: string;
  scope?: PasswordScope;
}> {
  const tenantSettings = await getTenantSecuritySettings(client);

  if (tenantSettings.passwordProtectionMode === 'DISABLED') {
    return { isLocked: false };
  }

  const { rows } = await client.query<any>(
    `SELECT is_password_protected, password_mode, password_hash
       FROM pa_agreement_templates
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, templateId]
  );

  if (!rows[0]) {
    return { isLocked: false };
  }

  const template = rows[0];
  const mode: AgreementPasswordMode = template.password_mode || 'INHERIT_TENANT';

  if (mode === 'NONE') {
    return { isLocked: false };
  }

  if (mode === 'CUSTOM') {
    if (template.password_hash) {
      return { isLocked: true, scope: 'TEMPLATE' };
    }
    return { isLocked: tenantSettings.hasTenantPassword, scope: 'TENANT' };
  }

  if (tenantSettings.hasTenantPassword) {
    return { isLocked: true, scope: 'TENANT' };
  }

  return { isLocked: false };
}

/** Check rate limiting for password attempts. */
async function checkRateLimit(client: TenantClient, resourceId: string, ipAddress: string): Promise<void> {
  const { rows } = await client.query<any>(
    `SELECT attempt_count, locked_until 
       FROM pa_password_unlock_attempts 
      WHERE tenant_id = $1 AND resource_id = $2 AND ip_address = $3`,
    [client.tenantId, resourceId, ipAddress]
  );

  if (rows[0] && rows[0].locked_until) {
    const lockTime = new Date(rows[0].locked_until).getTime();
    if (lockTime > Date.now()) {
      const minutesLeft = Math.ceil((lockTime - Date.now()) / 60000);
      throw new Error(`Too many failed attempts. Try again in ${minutesLeft} minute(s).`);
    }
  }
}

/** Record failed attempt and lock if attempt count >= 5. */
async function recordFailedAttempt(client: TenantClient, resourceId: string, ipAddress: string): Promise<number> {
  const { rows } = await client.query<any>(
    `INSERT INTO pa_password_unlock_attempts (tenant_id, resource_id, ip_address, attempt_count, last_attempt)
     VALUES ($1, $2, $3, 1, now())
     ON CONFLICT (tenant_id, resource_id, ip_address) DO UPDATE SET
       attempt_count = CASE 
         WHEN pa_password_unlock_attempts.locked_until IS NOT NULL AND pa_password_unlock_attempts.locked_until < now() 
         THEN 1 
         ELSE pa_password_unlock_attempts.attempt_count + 1 
       END,
       locked_until = CASE 
         WHEN pa_password_unlock_attempts.attempt_count + 1 >= 5 THEN now() + interval '15 minutes'
         ELSE NULL 
       END,
       last_attempt = now()
     RETURNING attempt_count, locked_until`,
    [client.tenantId, resourceId, ipAddress]
  );
  return rows[0]?.attempt_count || 1;
}

/** Clear rate limit attempts on successful password unlock. */
async function clearRateLimit(client: TenantClient, resourceId: string, ipAddress: string): Promise<void> {
  await client.query(
    `DELETE FROM pa_password_unlock_attempts 
      WHERE tenant_id = $1 AND resource_id = $2 AND ip_address = $3`,
    [client.tenantId, resourceId, ipAddress]
  );
}

/** Verify password and create a server-side hashed unlock session for agreements. */
export async function verifyAndCreateUnlockSession(
  client: TenantClient,
  agreementId: string,
  inputPassword: string,
  actor: UnlockActor
): Promise<{ token: string; expiresAt: string }> {
  await checkRateLimit(client, agreementId, actor.ipAddress);
  await new Promise((resolve) => setTimeout(resolve, 300));

  const lockEval = await evaluateAgreementLockStatus(client, agreementId);
  if (!lockEval.isLocked || !lockEval.scope) {
    throw new Error('Agreement does not require a password');
  }

  let hashToCompare: string | null = null;
  let activeVersion = 1;

  if (lockEval.scope === 'AGREEMENT') {
    const { rows } = await client.query<any>(
      `SELECT password_hash, password_version FROM pa_agreements WHERE tenant_id = $1 AND id = $2`,
      [client.tenantId, agreementId]
    );
    hashToCompare = rows[0]?.password_hash;
    activeVersion = rows[0]?.password_version || 1;
  } else {
    const { rows } = await client.query<any>(
      `SELECT tenant_password_hash, tenant_password_version FROM pa_branding WHERE tenant_id = $1`,
      [client.tenantId]
    );
    hashToCompare = rows[0]?.tenant_password_hash;
    activeVersion = rows[0]?.tenant_password_version || 1;
  }

  if (!hashToCompare) {
    throw new Error('Password configuration missing');
  }

  const isValid = await bcrypt.compare(inputPassword, hashToCompare);

  if (!isValid) {
    const attempts = await recordFailedAttempt(client, agreementId, actor.ipAddress);
    await logAudit(client, {
      tenantId: client.tenantId,
      agreementId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      action: 'UNLOCK_FAILED',
      ipAddress: actor.ipAddress,
      details: { attemptCount: attempts },
    });
    throw new Error('Incorrect password');
  }

  await clearRateLimit(client, agreementId, actor.ipAddress);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  await client.query(
    `INSERT INTO pa_agreement_unlock_sessions
       (tenant_id, agreement_id, user_id, client_id, session_token_hash, password_scope, password_version, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      client.tenantId,
      agreementId,
      actor.actorType === 'STAFF_USER' ? actor.actorId : null,
      actor.actorType === 'CLIENT_USER' ? actor.actorId : null,
      tokenHash,
      lockEval.scope,
      activeVersion,
      actor.ipAddress,
      actor.userAgent || null,
      expiresAt,
    ]
  );

  await logAudit(client, {
    tenantId: client.tenantId,
    agreementId,
    actorId: actor.actorId,
    actorType: actor.actorType,
    action: 'UNLOCKED_SUCCESS',
    ipAddress: actor.ipAddress,
    details: { scope: lockEval.scope, version: activeVersion },
  });

  return { token: rawToken, expiresAt };
}

/** Verify password and create a server-side hashed unlock session for templates. */
export async function verifyAndCreateTemplateUnlockSession(
  client: TenantClient,
  templateId: string,
  inputPassword: string,
  actor: UnlockActor
): Promise<{ token: string; expiresAt: string }> {
  await checkRateLimit(client, templateId, actor.ipAddress);
  await new Promise((resolve) => setTimeout(resolve, 300));

  const lockEval = await evaluateTemplateLockStatus(client, templateId);
  if (!lockEval.isLocked || !lockEval.scope) {
    throw new Error('Template does not require a password');
  }

  let hashToCompare: string | null = null;
  let activeVersion = 1;

  if (lockEval.scope === 'TEMPLATE') {
    const { rows } = await client.query<any>(
      `SELECT password_hash, password_version FROM pa_agreement_templates WHERE tenant_id = $1 AND id = $2`,
      [client.tenantId, templateId]
    );
    hashToCompare = rows[0]?.password_hash;
    activeVersion = rows[0]?.password_version || 1;
  } else {
    const { rows } = await client.query<any>(
      `SELECT tenant_password_hash, tenant_password_version FROM pa_branding WHERE tenant_id = $1`,
      [client.tenantId]
    );
    hashToCompare = rows[0]?.tenant_password_hash;
    activeVersion = rows[0]?.tenant_password_version || 1;
  }

  if (!hashToCompare) {
    throw new Error('Password configuration missing');
  }

  const isValid = await bcrypt.compare(inputPassword, hashToCompare);

  if (!isValid) {
    const attempts = await recordFailedAttempt(client, templateId, actor.ipAddress);
    await logAudit(client, {
      tenantId: client.tenantId,
      templateId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      action: 'TEMPLATE_UNLOCK_FAILED',
      ipAddress: actor.ipAddress,
      details: { attemptCount: attempts },
    });
    throw new Error('Incorrect password');
  }

  await clearRateLimit(client, templateId, actor.ipAddress);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  await client.query(
    `INSERT INTO pa_agreement_unlock_sessions
       (tenant_id, template_id, user_id, client_id, session_token_hash, password_scope, password_version, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      client.tenantId,
      templateId,
      actor.actorType === 'STAFF_USER' ? actor.actorId : null,
      actor.actorType === 'CLIENT_USER' ? actor.actorId : null,
      tokenHash,
      lockEval.scope,
      activeVersion,
      actor.ipAddress,
      actor.userAgent || null,
      expiresAt,
    ]
  );

  await logAudit(client, {
    tenantId: client.tenantId,
    templateId,
    actorId: actor.actorId,
    actorType: actor.actorType,
    action: 'TEMPLATE_UNLOCKED_SUCCESS',
    ipAddress: actor.ipAddress,
    details: { scope: lockEval.scope, version: activeVersion },
  });

  return { token: rawToken, expiresAt };
}

/** Validate session token for agreement or template passed in X-Agreement-Unlock-Token header. */
export async function validateUnlockSession(
  client: TenantClient,
  agreementId: string,
  rawToken: string | undefined
): Promise<boolean> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    return false;
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

  const { rows } = await client.query<any>(
    `SELECT s.id
       FROM pa_agreement_unlock_sessions s
       LEFT JOIN pa_agreements a ON a.id = s.agreement_id AND a.tenant_id = s.tenant_id
       LEFT JOIN pa_branding b ON b.tenant_id = s.tenant_id
      WHERE s.session_token_hash = $1
        AND s.agreement_id = $2
        AND s.tenant_id = $3
        AND s.expires_at > now()
        AND (
          (s.password_scope = 'TENANT' AND s.password_version = b.tenant_password_version)
          OR
          (s.password_scope = 'AGREEMENT' AND s.password_version = a.password_version)
        )`,
    [tokenHash, agreementId, client.tenantId]
  );

  return Boolean(rows[0]);
}

/** Validate session token for template. */
export async function validateTemplateUnlockSession(
  client: TenantClient,
  templateId: string,
  rawToken: string | undefined
): Promise<boolean> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    return false;
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

  const { rows } = await client.query<any>(
    `SELECT s.id
       FROM pa_agreement_unlock_sessions s
       LEFT JOIN pa_agreement_templates t ON t.id = s.template_id AND t.tenant_id = s.tenant_id
       LEFT JOIN pa_branding b ON b.tenant_id = s.tenant_id
      WHERE s.session_token_hash = $1
        AND s.template_id = $2
        AND s.tenant_id = $3
        AND s.expires_at > now()
        AND (
          (s.password_scope = 'TENANT' AND s.password_version = b.tenant_password_version)
          OR
          (s.password_scope = 'TEMPLATE' AND s.password_version = t.password_version)
        )`,
    [tokenHash, templateId, client.tenantId]
  );

  return Boolean(rows[0]);
}

/** Log security actions without recording any sensitive text or passwords. */
export async function logAudit(
  client: TenantClient,
  params: {
    tenantId: string;
    agreementId?: string | null;
    templateId?: string | null;
    actorId?: string | null;
    actorType: 'STAFF_USER' | 'CLIENT_USER' | 'SYSTEM';
    action: string;
    ipAddress?: string | null;
    details?: Record<string, any>;
  }
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO pa_security_audit_logs
         (tenant_id, agreement_id, template_id, actor_id, actor_type, action, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        params.tenantId,
        params.agreementId || null,
        params.templateId || null,
        params.actorId || null,
        params.actorType,
        params.action,
        params.ipAddress || null,
        params.details ? JSON.stringify(params.details) : null,
      ]
    );
  } catch (err) {
    console.error('[project-agreements] Audit log failure:', err);
  }
}
