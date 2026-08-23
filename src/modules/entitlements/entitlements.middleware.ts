// src/modules/entitlements/entitlements.middleware.ts
//
// Gates a route group on what the TENANT bought.
//
// MOUNT AT THE ROUTER LEVEL, NEVER PER-HANDLER:
//
//     router.use(authenticate, resolveTenant, requireCapability('qa'));
//
// Per-handler mounting is how a route gets missed, and a missed route is worse
// than no gate at all: the nav hides the feature while the API still serves it,
// so the hole is invisible until someone finds it.
//
// This runs AFTER resolveTenant (needs req.tenantId) and alongside — not
// instead of — the RBAC permission checks. Entitlement asks "did this company
// buy it"; permissions ask "is this person allowed". Both must pass.

import { Response, NextFunction } from 'express';
import { AuthRequest } from '@/types';
import { JWTUtils } from '@/utils/jwt';
import { Capability, ENFORCING, hasCapability } from './entitlements.service';

export const requireCapability = (capability: Capability) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId ?? req.user?.tenantId;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant context is required',
          code: 'TENANT_REQUIRED',
        });
        return;
      }

      if (await hasCapability(tenantId, capability)) {
        next();
        return;
      }

      if (!ENFORCING) {
        console.warn(
          `[entitlements] would block tenant=${tenantId} capability=${capability} ` +
            `${req.method} ${req.originalUrl} (enforcement off)`
        );
        next();
        return;
      }

      // Deliberately vague: the caller learns their plan lacks this, not which
      // other products exist or who else has them.
      res.status(403).json({
        success: false,
        error: 'This feature is not included in your plan',
        code: 'ENTITLEMENT_REQUIRED',
      });
    } catch (error) {
      console.error('[entitlements] capability check failed:', error);

      // The kill switch has to cover THIS path too, not just the deny path.
      // The likeliest reason a check throws is that ent_tenant_entitlements
      // does not exist yet — i.e. this deployed before anyone ran
      // db/ddl/tenant_entitlements.sql by hand.
      // If enforcement is off and a lookup failure still 500'd, the switch
      // would fail exactly when it is most needed.
      if (!ENFORCING) {
        console.warn(
          `[entitlements] check errored but enforcement is off — allowing ` +
            `${req.method} ${req.originalUrl}`
        );
        next();
        return;
      }

      // Enforcing: fail CLOSED. An access gate that opens when the database
      // hiccups is not an access gate.
      res.status(500).json({
        success: false,
        error: 'Entitlement check failed',
        code: 'ENTITLEMENT_CHECK_ERROR',
      });
    }
  };
};

/**
 * Path-prefix → capability map for WHOLE modules a product may not include.
 *
 * WHY A PREFIX GATE INSTEAD OF PER-ROUTER MOUNTS:
 *   HRMS and Finance are spread across ~25 separate `app.use()` mounts. Adding
 *   requireCapability() to each router means 25 chances to miss one, and a
 *   missed route is the worst outcome — the nav hides the feature while the API
 *   still serves it, so the hole is invisible until someone finds it. One
 *   prefix-driven gate mounted ahead of the routers cannot be partially
 *   applied, and this list is auditable in a single read.
 *
 *   The capability keys here are the SAME ones the nav config attaches to
 *   modules and items (see zukvo-fe/src/lib/product.ts). That is the point of
 *   the shared vocabulary: hiding something in the nav and blocking its API
 *   cannot drift apart, because both read the same key.
 *
 * Longest prefix wins, so a more specific entry can override a broader one.
 */
const MODULE_PREFIX_CAPABILITIES: ReadonlyArray<readonly [string, Capability]> = [
  // ── Finance ──
  ['/api/invoices', 'finance'],
  ['/api/invoicesetting', 'finance'],
  ['/api/invoice-templates', 'finance'],
  ['/api/accounts', 'finance'],
  ['/api/payroll', 'finance'],
  ['/api/payouts', 'finance'],
  ['/api/reimbursement', 'finance'],
  ['/api/reimbursements', 'finance'],
  ['/api/reimbursement-categories', 'finance'],
  ['/api/reimbursement-configurations', 'finance'],
  ['/api/reimbursement-settings', 'finance'],

  // ── HRMS ──
  ['/api/leave', 'hrms'],
  ['/api/leaves', 'hrms'],
  ['/api/leave-types', 'hrms'],
  ['/api/leave-adjustments', 'hrms'],
  ['/api/leave-origins', 'hrms'],
  ['/api/leave-allocation', 'hrms'],
  ['/api/leave-request', 'hrms'],
  ['/api/leave-balances', 'hrms'],
  ['/api/attendance', 'hrms'],
  ['/api/onboarding', 'hrms'],
  ['/api/performance-report', 'hrms'],
  ['/api/escalations-v2', 'hrms'],
  ['/api/escalation-categories', 'hrms'],
  ['/api/escalation-statuses', 'hrms'],
  ['/api/escalation-priorities', 'hrms'],
  ['/api/profile/new', 'hrms'],
  ['/api/employee-exit', 'hrms'],
  ['/api/letters-docs', 'hrms'],

  // ── Recruitment ──
  ['/api/pipeline', 'rec_suite'],
  ['/api/opening-management', 'rec_suite'],
  ['/api/recruitment', 'rec_suite'],
  ['/api/position-configuration', 'rec_suite'],

  // ── My Hub (personal HR surface) ──
  ['/api/my-hub', 'my_hub'],

  // ── Features INSIDE Work that are sold separately ──
  ['/api/proposals', 'proposals'],
  ['/api/proposal-sections', 'proposals'],
  ['/api/proposal-templates', 'proposals'],
  // BidIq has no mount of its own — it is POST /api/leads/:id/analyze — so
  // gating leads covers it. That is also why the BidIq nav item asks for
  // 'leads' rather than a capability of its own: a separate key would suggest
  // an API boundary that does not exist.
  ['/api/leads', 'leads'],
  ['/api/lead-settings', 'leads'],
  ['/api/squads', 'squads'],
  ['/api/timesheets', 'timesheet'],
  ['/api/daily-updates', 'daily_updates'],

  // ── Features inside Admin ──
  ['/api/clients-v2', 'clients'],

  // ── Standalone ──
  // Mounted under the bare `app.use("/api", skillExperienceRoutes)`, so the
  // real paths are /api/skills and /api/experience.
  ['/api/skills', 'skills'],
  ['/api/experience', 'skills'],

  // NOT LISTED, deliberately:
  //   chat       — runs through the Stream SDK, not this API. Hiding the UI is
  //                the whole control; there is no prefix here to gate.
  //   bookmarks  — stored in localStorage under `nav_shortcuts`. No backend.
];

function capabilityForPath(pathname: string): Capability | null {
  let bestLen = -1;
  let best: Capability | null = null;
  for (const [prefix, capability] of MODULE_PREFIX_CAPABILITIES) {
    if ((pathname === prefix || pathname.startsWith(`${prefix}/`)) && prefix.length > bestLen) {
      bestLen = prefix.length;
      best = capability;
    }
  }
  return best;
}

/**
 * Resolve the tenant WITHOUT the usual resolveTenant middleware.
 *
 * This gate is mounted ahead of the routers, so neither resolveTenant nor
 * authenticateToken has run yet. It reads the tenant from the same places they
 * would and stays deliberately lenient: if it cannot work out who is calling,
 * it defers rather than rejecting — the router's own auth will refuse an
 * unauthenticated caller a moment later, and a gate that 400s on requests auth
 * would have rejected anyway just produces confusing errors.
 */
function tenantIdFromRequest(req: AuthRequest): string | null {
  const header = req.headers['x-tenant-id'];
  if (typeof header === 'string' && header) return header;

  try {
    const token = JWTUtils.extractTokenFromHeader(req.headers.authorization);
    if (!token) return null;
    return JWTUtils.verifyAccessToken(token).tenantId ?? null;
  } catch {
    // Invalid/expired token — let authenticateToken produce the real 401.
    return null;
  }
}

/**
 * Blocks whole modules a tenant's products do not include, by path prefix.
 * Mount ONCE in app.ts, before the route mounts.
 */
export const moduleEntitlementGate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const capability = capabilityForPath(req.path);
  if (!capability) {
    next();
    return;
  }

  const tenantId = tenantIdFromRequest(req);
  if (!tenantId) {
    next();
    return;
  }

  try {
    if (await hasCapability(tenantId, capability)) {
      next();
      return;
    }

    if (!ENFORCING) {
      console.warn(
        `[entitlements] would block tenant=${tenantId} capability=${capability} ` +
          `${req.method} ${req.originalUrl} (enforcement off)`
      );
      next();
      return;
    }

    res.status(403).json({
      success: false,
      error: 'This feature is not included in your plan',
      code: 'ENTITLEMENT_REQUIRED',
    });
  } catch (error) {
    console.error('[entitlements] module gate failed:', error);
    if (!ENFORCING) {
      next();
      return;
    }
    res.status(500).json({
      success: false,
      error: 'Entitlement check failed',
      code: 'ENTITLEMENT_CHECK_ERROR',
    });
  }
};

export default { requireCapability, moduleEntitlementGate };
