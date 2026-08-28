// src/modules/entitlements/permission-features.ts
//
// Which catalogue feature each PERMISSION RESOURCE belongs to.
//
// The permission catalogue (446 rows across 47 resources) is global and has no
// tenant or product column — every tenant sees every permission. That is fine
// while one product exists and wrong the moment two do: a Testiez tenant should
// not be offered Payroll, Leave or Recruitment when building a role, because
// those APIs will refuse the request no matter which permissions the role
// carries.
//
// Resources map to admin_feature_catalog ids, the same vocabulary the nav and
// the API gate use. Matching is UPWARD ONLY — see satisfies() below for why
// holding a parent must not grant its children.
//
// A resource that is absent from this map is treated as ALWAYS AVAILABLE. That
// is the safe default: an unmapped resource stays visible exactly as it is
// today, so adding a permission resource can never silently hide it. Only
// exclusions need naming.

/** Resources every tenant keeps regardless of plan. */
const UNIVERSAL = new Set<string>([
  // Notifications and your own profile are not sold; every user has both.
  'notification',
  'profile',
  // Roles and settings administer the tenant itself, whatever it bought.
  'role',
  'settings',
  'dashboard',
]);

export const PERMISSION_RESOURCE_FEATURES: Readonly<Record<string, string>> = {
  // ── Work ──
  ticket: 'work_tickets',
  project: 'work_projects',
  qa: 'work_qa_space',
  document: 'work_document_hub',
  time_tracking: 'work_time_tracking',
  timesheet: 'work_timesheet',
  daily_update: 'work_daily_updates',
  proposal: 'work_proposals',
  squad: 'work_squads',
  lead: 'work_lead_management',
  bidiq: 'work_bidiq',
  escalation: 'work_escalations',
  report: 'work',

  // ── HRMS (recruitment lives here in the catalogue) ──
  leave: 'hrms_leaves_v2',
  attendance: 'hrms_attendance',
  shift: 'hrms_attendance',
  onboarding: 'hrms_onboarding',
  exit: 'hrms_employee_exit',
  performance: 'hrms_performance_report',
  letter: 'hrms_doc_suite',
  letter_template: 'hrms_doc_suite',
  pipeline: 'hrms_candidate_pipeline',
  opening: 'hrms_openings',
  recruitment: 'hrms',

  // ── Finance ──
  account: 'finance_accounts',
  invoice: 'finance_invoice',
  reimbursement: 'finance_reimbursement_v2',
  payroll: 'finance_payroll_v2',
  salary: 'finance_payroll_v2',
  vendor: 'finance',

  // ── Admin ──
  // `user` is Members administration, which Testiez ships under Admin — not HR
  // employee records, which live under hrms_profile.
  user: 'admin_members',
  org: 'admin_org_structure',
  client: 'admin_clients_v2',

  // ── My Hub ──
  my_hub: 'my_hub',

  // ── Standalone ──
  mail: 'home_home_general_mail',
  calendar: 'home_home_general_calendar',
  chat: 'home_home_general_team_chat',
  skills: 'home_home_general_skills',
  bookmark: 'home_home_general_bookmarks',
  activity_log: 'home_home_general_activity',
  hotspot: 'home_home_general_hotspot',
  integration: 'home_home_general_integrations',
};

/**
 * Does the granted feature set satisfy this requirement?
 *
 * UPWARD ONLY: an exact match, or a granted DESCENDANT of the requirement.
 * Holding hrms_leaves_v2 satisfies a requirement of hrms — you clearly have
 * some HRMS.
 *
 * Deliberately NOT the reverse. Holding a parent does not grant its children,
 * because a product holds CORE rows (work, admin, home) purely as nav
 * containers while selling only some of the modules beneath them. Treating the
 * container as a grant made every Work permission visible to Testiez —
 * Proposals, Leads, BidIq, Squads, Timesheet, Daily Updates — defeating the
 * item-level exclusions entirely.
 *
 * The cost of this direction: a plan that grants only a MODULE will not imply
 * the pages beneath it, so plans must enumerate what they sell. That is how
 * product_features and the Testiez plan are already built.
 */
function satisfies(granted: readonly string[], required: string): boolean {
  return granted.some((f) => f === required || f.startsWith(required + '_'));
}

/**
 * Is a permission resource available to a tenant holding these features?
 *
 * NO FEATURES MEANS UNMANAGED — everything is available. Same rule as the rest
 * of the module: a tenant with no subscription, or an unreachable control
 * plane, must behave exactly as it did before any of this existed.
 */
export function isResourceAvailable(resource: string, granted: readonly string[]): boolean {
  if (granted.length === 0) return true;
  if (UNIVERSAL.has(resource)) return true;

  const required = PERMISSION_RESOURCE_FEATURES[resource];
  if (!required) return true; // unmapped: visible, as before

  return satisfies(granted, required);
}
