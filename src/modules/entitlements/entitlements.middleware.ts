// src/modules/entitlements/entitlements.middleware.ts
//
// Blocks whole modules a tenant's PLAN does not include, by path prefix.
//
// SOURCE OF TRUTH IS THE ADMIN CATALOGUE, NOT THIS FILE.
//   The keys below are admin_feature_catalog ids (hrms, work_proposals,
//   admin_clients_v2). What a plan grants, and what a product sells, are both
//   edited in the admin — never redeployed. This map only records which URL
//   space corresponds to which catalogue entry, which is a property of the
//   routing table and does belong in code.
//
// WHY A PREFIX GATE INSTEAD OF PER-ROUTER MOUNTS:
//   HRMS and Finance are spread across ~25 separate app.use() mounts. Adding a
//   check to each router means 25 chances to miss one, and a missed route is
//   the worst outcome — the nav hides the feature while the API still serves
//   it, so the hole is invisible until somebody finds it. One gate mounted
//   ahead of the routers cannot be partially applied, and this list is
//   auditable in a single read.

import { Response, NextFunction } from 'express';
import { AuthRequest } from '@/types';
import { JWTUtils } from '@/utils/jwt';
import { ENFORCING, FAIL_OPEN } from './entitlements.service';
import { featureResolverService } from '@/modules/subscriptions';
import { productFromRequest } from '@/config/brand';

/**
 * URL prefix → the catalogue entry it belongs to.
 *
 * Recruitment lives under hrms in the catalogue (hrms_candidate_pipeline,
 * hrms_openings), so gating hrms covers it — there is no separate key.
 *
 * Longest prefix wins, so a more specific entry can override a broader one.
 */
const MODULE_PREFIX_FEATURES: ReadonlyArray<readonly [string, string]> = [
  // ── Finance ──
  ['/api/invoices', 'finance_invoice'],
  ['/api/invoicesetting', 'finance_invoice'],
  ['/api/invoice-templates', 'finance_invoice'],
  ['/api/customers', 'finance_invoice'],
  ['/api/accounts', 'finance_accounts'],
  ['/api/v2/payroll', 'finance_payroll_v2'],
  ['/api/payroll', 'finance_payroll_v2'],
  ['/api/payouts', 'finance_payroll_v2'],
  ['/api/v2/reimbursement', 'finance_reimbursement_v2'],
  ['/api/reimbursement', 'finance_reimbursement_v2'],
  ['/api/reimbursements', 'finance_reimbursement_v2'],
  ['/api/reimbursement-categories', 'finance_reimbursement_v2'],
  ['/api/reimbursement-configurations', 'finance_reimbursement_v2'],
  ['/api/reimbursement-settings', 'finance_reimbursement_v2'],
  ['/api/vendor', 'finance'],

  // ── HRMS: Leaves 2.0 ──
  ['/api/v2/leave', 'hrms_leaves_v2'],
  ['/api/leave', 'hrms_leaves_v2'],
  ['/api/leaves', 'hrms_leaves_v2'],
  ['/api/leave-types', 'hrms_leaves_v2'],
  ['/api/leave-adjustments', 'hrms_leaves_v2'],
  ['/api/leave-origins', 'hrms_leaves_v2'],
  ['/api/leave-allocation', 'hrms_leaves_v2'],
  ['/api/leave-request', 'hrms_leaves_v2'],
  ['/api/leave-balances', 'hrms_leaves_v2'],
  ['/api/company-government-holidays', 'hrms_leaves_v2'],
  ['/api/fixed-holidays', 'hrms_leaves_v2'],

  // ── HRMS: Attendance ──
  ['/api/attendance', 'hrms_attendance'],
  ['/api/shifts', 'hrms_attendance'],

  // ── HRMS: Onboarding ──
  ['/api/onboarding', 'hrms_onboarding'],
  ['/api/candidate-form', 'hrms_onboarding'],

  // ── HRMS: Performance Report ──
  ['/api/performance-report', 'hrms_performance_report'],

  // ── HRMS: Doc Suite ──
  ['/api/hrms/letters', 'hrms_doc_suite'],
  ['/api/letters-docs', 'hrms_doc_suite'],
  ['/api/letters', 'hrms_doc_suite'],
  ['/api/repositories', 'hrms_doc_suite'],

  // ── HRMS: Candidate Pipeline / Recruitment ──
  ['/api/pipeline', 'hrms_candidate_pipeline'],
  ['/api/candidates', 'hrms_candidate_pipeline'],
  ['/api/recruitment-statuses', 'hrms_candidate_pipeline'],
  ['/api/recruitment-actions', 'hrms_candidate_pipeline'],
  ['/api/recruitment-client', 'hrms_candidate_pipeline'],
  ['/api/recruitment', 'hrms_candidate_pipeline'],

  // ── HRMS: Openings ──
  ['/api/v2/openings', 'hrms_openings'],
  ['/api/opening-management', 'hrms_openings'],

  // ── HRMS: Exit ──
  ['/api/exit', 'hrms_employee_exit'],
  ['/api/employee-exit', 'hrms_employee_exit'],
  ['/api/employee-assets', 'hrms_employee_exit'],

  // ── HRMS: Profiles ──
  ['/api/profile/new', 'hrms'],
  ['/api/employee-work-details', 'hrms'],
  ['/api/employee-timelines', 'hrms'],

  // ── My Hub (personal HR surface) ──
  ['/api/my-hub', 'my_hub'],

  // ── Features inside Work sold separately ──
  ['/api/proposals', 'work_proposals'],
  ['/api/proposal-sections', 'work_proposals'],
  ['/api/proposal-templates', 'work_proposals'],
  ['/api/leads', 'work_lead_management'],
  ['/api/lead-settings', 'work_lead_management'],
  ['/api/squad', 'work_squad_management'],
  ['/api/squads', 'work_squad_management'],
  ['/api/timesheets', 'work_timesheet'],
  ['/api/daily-updates', 'work_daily_updates'],
  ['/api/tickets', 'work_tickets'],
  ['/api/buckets', 'work_tickets_buckets'],
  ['/api/trash', 'work_tickets_trash'],
  ['/api/time-tracking', 'work_time_tracking'],
  ['/api/projects', 'work_projects'],
  ['/api/v2/qa/playbooks', 'work_playbooks'],
  ['/api/v2/qa/test-scopes', 'work_qa_space'],
  ['/api/v2/qa/submissions', 'work_qa_space'],
  ['/api/v2/qa/analytics', 'work_qa_space'],
  ['/api/v2/qa/scenarios', 'work_qa_space'],
  ['/api/v2/qa', 'work_qa_space'],
  ['/api/v2/yapiez', 'work_qa_space'],
  ['/api/bug-list', 'work_qa_space'],
  ['/api/documenthub', 'work_document_hub'],
  ['/api/v2/document-hubs', 'work_document_hub'],
  ['/api/escalations-v2', 'work_escalations'],
  ['/api/escalation-categories', 'work_escalations'],
  ['/api/escalation-statuses', 'work_escalations'],
  ['/api/escalation-priorities', 'work_escalations'],

  // ── Features inside Admin ──
  ['/api/clients-v2', 'admin_clients_v2'],

  // ── Standalone ──
  ['/api/skills', 'home_home_general_skills'],
  ['/api/experience', 'home_home_general_skills'],

  // NOT LISTED, deliberately:
  //   chat      — runs through the Stream SDK, not this API. Hiding the UI is
  //               the whole control; there is no prefix here to gate.
  //   bookmarks — stored in localStorage under nav_shortcuts. No backend.
];

function featureForPath(pathname: string): string | null {
  let bestLen = -1;
  let best: string | null = null;
  for (const [prefix, feature] of MODULE_PREFIX_FEATURES) {
    if ((pathname === prefix || pathname.startsWith(prefix + '/')) && prefix.length > bestLen) {
      bestLen = prefix.length;
      best = feature;
    }
  }
  return best;
}

/**
 * Does the granted set satisfy this requirement?
 *
 * UPWARD ONLY: an exact match, or a granted DESCENDANT. Holding
 * hrms_leaves_v2 satisfies a requirement of hrms — you clearly have some HRMS.
 *
 * Deliberately NOT the reverse. A product holds CORE rows (work, admin, home)
 * purely as nav containers while selling only some of the modules beneath
 * them, so treating a container as a grant let a Testiez tenant through to
 * /api/proposals, /api/leads, /api/squads and the rest — every item-level
 * exclusion defeated by one row.
 *
 * Safe for existing plans: Zukvo plans grant only leaf FEATURE rows, never
 * parents, so the downward direction never fired for them. Verified across all
 * seven — identical results before and after.
 */
function satisfies(granted: readonly string[], required: string): boolean {
  return granted.some((f) => f === required || f.startsWith(required + '_'));
}

/**
 * Resolve the tenant WITHOUT the usual resolveTenant middleware.
 *
 * This gate is mounted ahead of the routers, so neither resolveTenant nor
 * authenticateToken has run yet. It reads the tenant from the same places they
 * would and stays deliberately lenient: if it cannot work out who is calling it
 * defers, because the router's own auth will refuse an unauthenticated caller a
 * moment later, and a gate that 400s on requests auth would reject anyway just
 * produces confusing errors.
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

export const moduleEntitlementGate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const required = featureForPath(req.path);
  if (!required) {
    next();
    return;
  }

  const tenantId = tenantIdFromRequest(req);
  if (!tenantId) {
    next();
    return;
  }

  try {
    const product = productFromRequest(req);
    const granted = await featureResolverService.getTenantFeatures(
      tenantId,
      product ? product.toUpperCase() : undefined
    );

    // NO FEATURES MEANS UNMANAGED, NOT ENTITLED TO NOTHING.
    //
    // The same rule the entitlements service applies to absent grants, and for
    // the same reason: a tenant with no subscription must behave exactly as it
    // did before any of this existed. It also covers the Admin API being
    // unreachable — the resolver returns an empty list on failure, and locking
    // every tenant out of HRMS and Finance because a control-plane call timed
    // out would be a far worse failure than serving the request.
    if (granted.length === 0 || satisfies(granted, required)) {
      next();
      return;
    }

    if (!ENFORCING) {
      console.warn(
        '[entitlements] would block tenant=' + tenantId + ' feature=' + required +
        ' ' + req.method + ' ' + req.originalUrl + ' (enforcement off)'
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
    // Control-plane fault. The behaviour is a deliberate, env-controlled choice
    // (see FAIL_OPEN): open by default so a wobble does not take the whole API
    // down; set ENTITLEMENTS_FAIL_OPEN=false to fail closed where a missed
    // entitlement check is worse than an outage.
    if (FAIL_OPEN || !ENFORCING) {
      next();
      return;
    }
    res.status(503).json({
      success: false,
      error: 'Entitlement service temporarily unavailable',
      code: 'ENTITLEMENT_UNAVAILABLE',
    });
  }
};

/**
 * Express middleware for fine-grained / exact subscription feature authorization.
 *
 * For child-level features and actions (e.g. 'work_proposals_templates', 'work_lead_bidiq'),
 * exact matching is used by default so that having a broad or unrelated feature does not
 * accidentally authorize deeper actions.
 *
 * Set `options.exact = false` to enable prefix / upward resolution for page/module level checks.
 */
export const requireSubscriptionFeature = (
  featureKey: string,
  options: { exact?: boolean } = { exact: true }
) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = tenantIdFromRequest(req) || (req as any).tenantId;
    if (!tenantId) {
      next();
      return;
    }

    try {
      const product = productFromRequest(req);
      const granted = await featureResolverService.getTenantFeatures(
        tenantId,
        product ? product.toUpperCase() : undefined
      );

      // NO FEATURES MEANS UNMANAGED, NOT ENTITLED TO NOTHING (consistent with moduleEntitlementGate)
      if (granted.length === 0) {
        next();
        return;
      }

      const isEntitled = options.exact
        ? granted.includes(featureKey)
        : satisfies(granted, featureKey);

      if (isEntitled) {
        next();
        return;
      }

      if (!ENFORCING) {
        console.warn(
          `[entitlements] would block tenant=${tenantId} exactFeature=${featureKey} ` +
          `${req.method} ${req.originalUrl} (enforcement off)`
        );
        next();
        return;
      }

      res.status(403).json({
        success: false,
        error: 'This feature is not included in your plan',
        code: 'ENTITLEMENT_REQUIRED',
        requiredFeature: featureKey,
      });
    } catch (error) {
      console.error(`[entitlements] requireSubscriptionFeature failed for ${featureKey}:`, error);
      if (FAIL_OPEN || !ENFORCING) {
        next();
        return;
      }
      res.status(503).json({
        success: false,
        error: 'Entitlement service temporarily unavailable',
        code: 'ENTITLEMENT_UNAVAILABLE',
      });
    }
  };
};

export default { moduleEntitlementGate, requireSubscriptionFeature };
