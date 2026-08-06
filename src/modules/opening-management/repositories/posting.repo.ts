// src/modules/opening-management/repositories/posting.repo.ts
//
// Raw-SQL data access for Phase 4: om_posting_settings and om_opening_postings.
//
// One function here — `findDueInternalPostings` — deliberately runs OUTSIDE
// withTenant, because the scheduled sweep has no tenant context. See its doc
// comment for why that is safe and what it is not allowed to do.

import { omPool, TenantClient } from '../db/pool';
import { OpeningPosting, PostingSettings, PostingType } from '../types';

// ─── Settings ───────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = { internalPostingDays: 15, autoMoveToExternal: true };

function mapSettings(r: any, tenantId: string): PostingSettings {
  if (!r) {
    // A tenant that never configured anything still gets the documented
    // defaults, so callers never have to handle "no settings row".
    return {
      tenantId,
      internalPostingDays: DEFAULT_SETTINGS.internalPostingDays,
      autoMoveToExternal: DEFAULT_SETTINGS.autoMoveToExternal,
      updatedBy: null,
      updatedAt: null,
    };
  }
  return {
    tenantId: r.tenant_id,
    internalPostingDays: r.internal_posting_days,
    autoMoveToExternal: r.auto_move_to_external,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}

export async function findSettings(client: TenantClient): Promise<PostingSettings> {
  const { rows } = await client.query(
    `SELECT tenant_id, internal_posting_days, auto_move_to_external, updated_by, updated_at
       FROM om_posting_settings WHERE tenant_id = $1`,
    [client.tenantId]
  );
  return mapSettings(rows[0], client.tenantId);
}

/** Upsert — the tenant row is created on first write. */
export async function upsertSettings(
  client: TenantClient,
  data: { internalPostingDays?: number; autoMoveToExternal?: boolean },
  actorId: string
): Promise<PostingSettings> {
  const { rows } = await client.query(
    // The ::int / ::boolean casts are load-bearing: an untyped parameter inside
    // COALESCE is inferred as text, which does not match the column type.
    `INSERT INTO om_posting_settings
       (tenant_id, internal_posting_days, auto_move_to_external, created_by, updated_by)
     VALUES ($1, COALESCE($2::int, $4::int), COALESCE($3::boolean, $5::boolean), $6, $6)
     ON CONFLICT (tenant_id) DO UPDATE
        SET internal_posting_days = COALESCE($2::int, om_posting_settings.internal_posting_days),
            auto_move_to_external = COALESCE($3::boolean, om_posting_settings.auto_move_to_external),
            updated_by = $6,
            updated_at = now()
     RETURNING tenant_id, internal_posting_days, auto_move_to_external, updated_by, updated_at`,
    [
      client.tenantId,
      data.internalPostingDays ?? null,
      data.autoMoveToExternal ?? null,
      DEFAULT_SETTINGS.internalPostingDays,
      DEFAULT_SETTINGS.autoMoveToExternal,
      actorId,
    ]
  );
  return mapSettings(rows[0], client.tenantId);
}

// ─── Postings ───────────────────────────────────────────────────────────────

function mapPosting(r: any): OpeningPosting {
  return {
    id: r.id,
    openingId: r.opening_id,
    postingType: r.posting_type,
    status: r.status,
    postedAt: r.posted_at,
    expiresAt: r.expires_at,
    autoMove: r.auto_move,
    movedAt: r.moved_at,
    closedAt: r.closed_at,
    closedReason: r.closed_reason,
    postedBy: r.posted_by,
    postedByName: r.posted_by_name ?? null,
    isAutomated: r.is_automated,
    daysRemaining: r.days_remaining === null || r.days_remaining === undefined
      ? null
      : Number(r.days_remaining),
  };
}

// days_remaining is computed in SQL so every caller sees the same number,
// derived from the database clock rather than whatever the app server thinks.
const POSTING_SELECT = `
  SELECT p.id, p.opening_id, p.posting_type, p.status, p.posted_at, p.expires_at,
         p.auto_move, p.moved_at, p.closed_at, p.closed_reason,
         p.posted_by, u.name AS posted_by_name, p.is_automated,
         CASE WHEN p.status = 'active' AND p.expires_at IS NOT NULL
              THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (p.expires_at - now())) / 86400))
              ELSE NULL
         END AS days_remaining
    FROM om_opening_postings p
    LEFT JOIN users u ON u.id = p.posted_by::text
`;

export interface CreatePostingData {
  openingId: string;
  postingType: PostingType;
  /** Internal only. Null for external postings. */
  expiresAt: Date | null;
  autoMove: boolean;
  postedBy: string;
  isAutomated: boolean;
}

export async function insertPosting(
  client: TenantClient,
  data: CreatePostingData
): Promise<OpeningPosting> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO om_opening_postings
       (tenant_id, opening_id, posting_type, expires_at, auto_move, posted_by, is_automated)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      client.tenantId,
      data.openingId,
      data.postingType,
      data.expiresAt,
      data.autoMove,
      data.postedBy,
      data.isAutomated,
    ]
  );
  const created = await findById(client, rows[0].id);
  if (!created) throw new Error('[opening-management] posting vanished after insert');
  return created;
}

export async function findById(
  client: TenantClient,
  id: string
): Promise<OpeningPosting | null> {
  const { rows } = await client.query(
    `${POSTING_SELECT} WHERE p.tenant_id = $1 AND p.id = $2`,
    [client.tenantId, id]
  );
  return rows[0] ? mapPosting(rows[0]) : null;
}

export async function findByOpening(
  client: TenantClient,
  openingId: string
): Promise<OpeningPosting[]> {
  const { rows } = await client.query(
    `${POSTING_SELECT}
      WHERE p.tenant_id = $1 AND p.opening_id = $2
      ORDER BY p.posted_at DESC`,
    [client.tenantId, openingId]
  );
  return rows.map(mapPosting);
}

export async function findActive(
  client: TenantClient,
  openingId: string,
  postingType: PostingType
): Promise<OpeningPosting | null> {
  const { rows } = await client.query(
    `${POSTING_SELECT}
      WHERE p.tenant_id = $1 AND p.opening_id = $2
        AND p.posting_type = $3 AND p.status = 'active'`,
    [client.tenantId, openingId, postingType]
  );
  return rows[0] ? mapPosting(rows[0]) : null;
}

/**
 * Finish an active posting.
 *
 * `status = 'active'` makes it a compare-and-set: the sweep and a human closing
 * the same posting at the same moment cannot both succeed, so the move happens
 * exactly once.
 */
export async function closePosting(
  client: TenantClient,
  postingId: string,
  data: {
    status: 'expired' | 'closed';
    reason: string | null;
    /** Set when this posting handed over to the next one (internal → external). */
    moved: boolean;
    isAutomated: boolean;
  }
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE om_opening_postings
        SET status = $3,
            closed_at = now(),
            closed_reason = $4,
            moved_at = CASE WHEN $5::boolean THEN now() ELSE moved_at END,
            is_automated = is_automated OR $6::boolean,
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND status = 'active'`,
    [client.tenantId, postingId, data.status, data.reason, data.moved, data.isAutomated]
  );
  return (rowCount ?? 0) > 0;
}

/** Close every active posting on an opening — used when recruitment ends. */
export async function closeAllActive(
  client: TenantClient,
  openingId: string,
  reason: string
): Promise<number> {
  const { rowCount } = await client.query(
    `UPDATE om_opening_postings
        SET status = 'closed', closed_at = now(), closed_reason = $3, updated_at = now()
      WHERE tenant_id = $1 AND opening_id = $2 AND status = 'active'`,
    [client.tenantId, openingId, reason]
  );
  return rowCount ?? 0;
}

/** Keep the denormalised copy on om_openings in step with the posting rows. */
export async function stampOpeningPosting(
  client: TenantClient,
  openingId: string,
  data: {
    postingType: PostingType;
    internalPostingEndsAt: Date | null;
  }
): Promise<void> {
  if (data.postingType === 'internal') {
    await client.query(
      `UPDATE om_openings
          SET posted_internally_at = now(), internal_posting_ends_at = $3
        WHERE tenant_id = $1 AND id = $2`,
      [client.tenantId, openingId, data.internalPostingEndsAt]
    );
  } else {
    await client.query(
      `UPDATE om_openings
          SET posted_externally_at = now(), internal_posting_ends_at = NULL
        WHERE tenant_id = $1 AND id = $2`,
      [client.tenantId, openingId]
    );
  }
}

// ─── The scheduled sweep ────────────────────────────────────────────────────

export interface DuePosting {
  tenantId: string;
  openingId: string;
  postingId: string;
}

/**
 * Internal postings whose window has expired, ACROSS ALL TENANTS.
 *
 * This is the one query in the module that runs on the raw pool instead of
 * inside `withTenant`, because a cron tick has no tenant context. Two things
 * make that acceptable:
 *
 *   1. It is read-only and returns nothing but ids. Every mutation the sweep
 *      performs afterwards goes through `withTenant(tenantId, …)` like any other
 *      write, so tenant scoping still governs all writes.
 *   2. It mirrors the existing platform precedent (leave-v2's accrual scheduler
 *      enumerates tenants the same way).
 *
 * CAVEAT for whoever moves the app off the superuser DB role: RLS would block
 * this query. It would then need a BYPASSRLS role, or a loop over tenants.
 */
export async function findDueInternalPostings(limit = 500): Promise<DuePosting[]> {
  const { rows } = await omPool.query(
    `SELECT p.tenant_id, p.opening_id, p.id AS posting_id
       FROM om_opening_postings p
       JOIN om_openings o ON o.id = p.opening_id
                         AND o.deleted_at IS NULL
                         AND o.status = 'internal_posting'
      WHERE p.posting_type = 'internal'
        AND p.status = 'active'
        AND p.auto_move = true
        AND p.expires_at <= now()
      ORDER BY p.expires_at ASC
      LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    tenantId: r.tenant_id,
    openingId: r.opening_id,
    postingId: r.posting_id,
  }));
}
