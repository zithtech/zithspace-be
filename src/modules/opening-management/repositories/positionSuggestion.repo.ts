// src/modules/opening-management/repositories/positionSuggestion.repo.ts
//
// The shared, cross-tenant cache of AI suggestions per job title.
//
// This is the ONE repository in the module that does not take a TenantClient,
// because `om_position_suggestions` has no tenant_id and no RLS — see the
// header of 008_position_suggestions.sql for why, and for what must never be
// written here. It therefore runs on the raw pool.

import { omPool } from '../db/pool';
import { AssistField, SuggestionGroup } from '../services/aiAssist.types';

/**
 * Match key: case-insensitive, whitespace-collapsed.
 *
 * The SQL btrims the parameter too, so a caller that forgets to normalise still
 * matches — the index is on `lower(btrim(position))` and both sides must agree.
 */
function normalize(position: string): string {
  return position.trim().replace(/\s+/g, ' ');
}

export interface CachedSuggestions {
  position: string;
  groups: SuggestionGroup[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Cached suggestions for this title + field, or null on a miss.
 * Inactive rows are treated as a miss, which is how `is_active = false`
 * forces a regeneration.
 */
export async function find(
  position: string,
  field: AssistField
): Promise<CachedSuggestions | null> {
  const key = normalize(position);
  if (!key) return null;

  const { rows } = await omPool.query(
    `SELECT position, content -> $2 AS groups, created_at, updated_at
       FROM om_position_suggestions
      WHERE lower(btrim(position)) = lower(btrim($1)) AND is_active
      LIMIT 1`,
    [key, field]
  );

  const row = rows[0];
  if (!row?.groups || !Array.isArray(row.groups) || row.groups.length === 0) return null;

  return {
    position: row.position,
    groups: row.groups as SuggestionGroup[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Write the groups for one field, leaving the other field's cached content
 * alone.
 *
 * `content || jsonb_build_object(...)` merges at the top level, so generating
 * responsibilities for a title that already has a job_description entry adds to
 * the row rather than replacing it. The ON CONFLICT target is the unique index
 * on the normalised title, so two first-time requests racing produce one row.
 */
export async function upsert(
  position: string,
  field: AssistField,
  groups: SuggestionGroup[]
): Promise<void> {
  const key = normalize(position);
  if (!key || groups.length === 0) return;

  await omPool.query(
    `INSERT INTO om_position_suggestions (position, content)
     VALUES ($1, jsonb_build_object($2::text, $3::jsonb))
     ON CONFLICT (lower(btrim(position))) DO UPDATE
        SET content = om_position_suggestions.content || jsonb_build_object($2::text, $3::jsonb),
            is_active = true,
            updated_at = now()`,
    [key, field, JSON.stringify(groups)]
  );
}

/**
 * Fold user-added items into the cached groups so the next person asking about
 * this title sees them too.
 *
 * Merged in memory rather than in SQL: the de-duplication is case-insensitive
 * and order-preserving, which is far clearer in TypeScript than in a jsonb
 * expression. A miss is a no-op — customs only extend an existing cache entry.
 */
export async function addCustomItems(
  position: string,
  field: AssistField,
  additions: { groupKey: string; items: string[] }[]
): Promise<void> {
  const key = normalize(position);
  if (!key || additions.length === 0) return;

  const existing = await find(key, field);
  if (!existing) return;

  const byKey = new Map(additions.map((a) => [a.groupKey, a.items]));
  let changed = false;

  const merged = existing.groups.map((group) => {
    const extra = byKey.get(group.key);
    if (!extra?.length) return group;

    const seen = new Set(group.items.map((i) => i.toLowerCase()));
    const fresh = extra.filter((i) => {
      const k = i.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (fresh.length === 0) return group;

    changed = true;
    return { ...group, items: [...group.items, ...fresh.map((i) => i.trim())] };
  });

  if (changed) await upsert(key, field, merged);
}

/** Retire a cached entry so the next request regenerates it. */
export async function deactivate(position: string): Promise<void> {
  const key = normalize(position);
  if (!key) return;
  await omPool.query(
    `UPDATE om_position_suggestions
        SET is_active = false, updated_at = now()
      WHERE lower(btrim(position)) = lower(btrim($1))`,
    [key]
  );
}
