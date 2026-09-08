// src/modules/qa-playbooks/constants.ts
//
// The closed vocabularies a playbook is written against. These are served to
// the FE through GET /playbooks/meta so the reader, the filters and the author
// form all render from one list — nothing hardcodes a copy that can drift.
//
// They are closed sets on purpose: an unrecognised level or category would be
// invisible to every filter, so the author form offers exactly these and the
// API rejects anything else.

export const LEVELS = ['junior', 'intermediate', 'senior', 'expert'] as const;
export type PlaybookLevel = (typeof LEVELS)[number];

export const CATEGORIES = [
  'ui',
  'input_validation',
  'functional',
  'boundary',
  'account_state',
  'api',
  'auth',
  'session',
  'security',
  'performance',
  'browser_device',
  'accessibility',
] as const;
export type PlaybookCategory = (typeof CATEGORIES)[number];

export const RISKS = ['low', 'medium', 'high', 'critical'] as const;
export type PlaybookRisk = (typeof RISKS)[number];

/**
 * Where a recommendation points the reader next.
 *
 * A closed set, for the same reason levels and categories are: an unrecognised
 * type renders without an icon and filters as nothing. Deliberately several
 * kinds rather than one "link" — "how do I test login?" is answered differently
 * by a tutorial, by OWASP, and by an application you can go and try it on, and
 * a playbook that only ever cites one of those is a playbook with a blind spot.
 */
export const REFERENCE_TYPES = [
  'qa_guide',
  'security_standard',
  'real_test_cases',
  'real_application',
  'tutorial',
  'standard',
] as const;
export type PlaybookReferenceType = (typeof REFERENCE_TYPES)[number];

export const REFERENCE_TYPE_LABELS: Record<PlaybookReferenceType, string> = {
  qa_guide: 'QA Guide',
  security_standard: 'Security Standard',
  real_test_cases: 'Real Test Cases',
  real_application: 'Real Application',
  tutorial: 'Tutorial',
  standard: 'Standard',
};

/** What each type is for, shown to the author picking one. */
export const REFERENCE_TYPE_HINTS: Record<PlaybookReferenceType, string> = {
  qa_guide: 'A written walkthrough of testing this feature',
  security_standard: 'OWASP and friends — the security position on it',
  real_test_cases: 'A published list of cases to compare yours against',
  real_application: 'Something live to try the check on',
  tutorial: 'A video or course covering it',
  standard: 'The spec itself — RFC, WCAG, an API standard',
};

/** Who can see a playbook, and on what terms. See migration 002 for the rules. */
export const VISIBILITIES = ['public', 'premium', 'workspace'] as const;
export type PlaybookVisibility = (typeof VISIBILITIES)[number];

export const STATUSES = ['draft', 'published', 'archived'] as const;
export type PlaybookStatus = (typeof STATUSES)[number];

export const CATEGORY_LABELS: Record<PlaybookCategory, string> = {
  ui: 'UI',
  input_validation: 'Input Validation',
  functional: 'Functional',
  boundary: 'Boundary & Edge Cases',
  account_state: 'Account States',
  api: 'API & Network',
  auth: 'Authentication',
  session: 'Session & Logout',
  security: 'Security',
  performance: 'Performance',
  browser_device: 'Browser & Device',
  accessibility: 'Accessibility',
};

export const LEVEL_LABELS: Record<PlaybookLevel, string> = {
  junior: 'Junior',
  intermediate: 'Intermediate',
  senior: 'Senior',
  expert: 'Expert',
};

export const VISIBILITY_LABELS: Record<PlaybookVisibility, string> = {
  public: 'Public',
  premium: 'Premium',
  workspace: 'My workspace',
};

/** Slugs are the public identity of a playbook, so they are derived, not typed. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
