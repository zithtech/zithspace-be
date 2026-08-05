// src/modules/opening-management/services/statusMachine.ts
//
// The opening lifecycle, as data. Pure — no database, no HTTP — so the rules can
// be read in one place and reasoned about without tracing calls.
//
//   draft ──▶ pending_approval ──▶ approved ──▶ internal_posting ──▶ external_posting
//                                                      └──────▶ in_progress ──▶ filled ──▶ closed
//   on_hold parks any active status and resumes to where it came from.
//   cancelled / closed are terminal unless an admin reopens them.
//
// WHY the rules live here and not in a CHECK constraint: legality depends on the
// actor's permissions and on which phase owns the move — neither is expressible
// in SQL. The database still guarantees the status VALUE is one of the ten.

import { AllowedTransition, OpeningStatus } from '../types';

export interface TransitionRule {
  to: OpeningStatus;
  /** Verb shown in the UI, e.g. "Put on hold". */
  label: string;
  /** A note is mandatory — used for moves someone will later ask "why?" about. */
  requiresNote?: boolean;
  /** Needs `opening.manage`; reserved for reopening and for undoing approval. */
  requiresManage?: boolean;
  /**
   * Owned by another phase's endpoint. These are legal moves, but NOT through
   * `POST /:id/status` — routing them here would let a caller walk straight past
   * the approval chain.
   */
  ownedBy?: 'approval';
}

export const TRANSITIONS: Record<OpeningStatus, TransitionRule[]> = {
  draft: [
    { to: 'pending_approval', label: 'Submit for approval', ownedBy: 'approval' },
    { to: 'cancelled', label: 'Cancel opening', requiresNote: true },
  ],

  pending_approval: [
    { to: 'approved', label: 'Approve', ownedBy: 'approval' },
    { to: 'draft', label: 'Return to draft', ownedBy: 'approval' },
    // Cancelling mid-approval also closes the outstanding approval steps.
    { to: 'cancelled', label: 'Cancel opening', requiresNote: true },
  ],

  approved: [
    { to: 'internal_posting', label: 'Post internally' },
    { to: 'external_posting', label: 'Post externally' },
    { to: 'on_hold', label: 'Put on hold', requiresNote: true },
    { to: 'cancelled', label: 'Cancel opening', requiresNote: true },
    // Undoing an approval to edit the requisition again is an admin act.
    { to: 'draft', label: 'Reopen for editing', requiresNote: true, requiresManage: true },
  ],

  internal_posting: [
    { to: 'external_posting', label: 'Publish externally' },
    { to: 'in_progress', label: 'Start interviewing' },
    { to: 'on_hold', label: 'Put on hold', requiresNote: true },
    { to: 'filled', label: 'Mark filled' },
    { to: 'closed', label: 'Close recruitment', requiresNote: true },
    { to: 'cancelled', label: 'Cancel opening', requiresNote: true },
  ],

  external_posting: [
    { to: 'in_progress', label: 'Start interviewing' },
    { to: 'on_hold', label: 'Put on hold', requiresNote: true },
    { to: 'filled', label: 'Mark filled' },
    { to: 'closed', label: 'Close recruitment', requiresNote: true },
    { to: 'cancelled', label: 'Cancel opening', requiresNote: true },
  ],

  in_progress: [
    // Back to sourcing when the pipeline runs dry.
    { to: 'external_posting', label: 'Resume external sourcing' },
    { to: 'on_hold', label: 'Put on hold', requiresNote: true },
    { to: 'filled', label: 'Mark filled' },
    { to: 'closed', label: 'Close recruitment', requiresNote: true },
    { to: 'cancelled', label: 'Cancel opening', requiresNote: true },
  ],

  on_hold: [
    { to: 'approved', label: 'Resume' },
    { to: 'internal_posting', label: 'Resume internal posting' },
    { to: 'external_posting', label: 'Resume external posting' },
    { to: 'in_progress', label: 'Resume interviewing' },
    { to: 'closed', label: 'Close recruitment', requiresNote: true },
    { to: 'cancelled', label: 'Cancel opening', requiresNote: true },
  ],

  filled: [
    { to: 'closed', label: 'Close opening' },
    // A joiner dropping out is the usual reason to walk this back.
    { to: 'in_progress', label: 'Reopen hiring', requiresNote: true, requiresManage: true },
  ],

  // Terminal states. Reopening is deliberately an admin-only escape hatch.
  cancelled: [
    { to: 'draft', label: 'Reopen as draft', requiresNote: true, requiresManage: true },
  ],
  closed: [
    { to: 'in_progress', label: 'Reopen hiring', requiresNote: true, requiresManage: true },
  ],
};

/** Statuses no longer being worked — used by list defaults and Phase 7 archiving. */
export const TERMINAL_STATUSES: OpeningStatus[] = ['cancelled', 'closed'];

/** Statuses where the opening is actively being recruited for. */
export const ACTIVE_STATUSES: OpeningStatus[] = [
  'approved',
  'internal_posting',
  'external_posting',
  'in_progress',
];

export function findRule(from: OpeningStatus, to: OpeningStatus): TransitionRule | undefined {
  return TRANSITIONS[from]?.find((r) => r.to === to);
}

/**
 * What the caller may do from `from`, right now. Moves owned by another phase
 * are excluded — they have their own endpoints — and manage-only moves are
 * hidden from callers who lack the permission, so the UI can render this list
 * directly as buttons.
 */
export function allowedTransitionsFor(
  from: OpeningStatus,
  canManage: boolean
): AllowedTransition[] {
  return (TRANSITIONS[from] ?? [])
    .filter((r) => !r.ownedBy)
    .filter((r) => canManage || !r.requiresManage)
    .map((r) => ({
      to: r.to,
      label: r.label,
      requiresNote: !!r.requiresNote,
      requiresManage: !!r.requiresManage,
    }));
}
