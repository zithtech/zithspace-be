// src/modules/performance-report/services/settings.service.ts
//
// Business logic for the Performance Report Settings page. Owns the transaction
// boundary (withTenant) and the rules (default seeding, full-set assembly).
// Repositories do the SQL.

import { withTenant, TenantClient } from '../db/pool';
import * as repo from '../repositories/settings.repo';
import {
  Actor,
  MODULE_KEYS,
  ModuleSetting,
  PerfReportSettingsDetail,
} from '../types';
import { UpdateSettingsInput } from '../validators/settings.validator';

// Default weight per module so the 5 modules sum to 100 out of the box.
const DEFAULT_WEIGHT = 100 / MODULE_KEYS.length; // 20

/**
 * Read the tenant's settings, seeding sensible defaults on first access so the
 * Settings page always has a complete, editable payload (5 modules + top-level).
 */
export async function getSettings(actor: Actor): Promise<PerfReportSettingsDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const settings = await ensureSettingsRow(client, actor.userId);
    const modules = await ensureModuleRows(client, actor.userId);
    return { ...settings, modules: sortModules(modules) };
  });
}

/**
 * Persist the full Settings payload in one transaction: the top-level
 * auto-generation config plus every module's enabled/weight/config. Returns the
 * freshly persisted state.
 */
export async function updateSettings(
  actor: Actor,
  input: UpdateSettingsInput
): Promise<PerfReportSettingsDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const settings = await repo.upsertSettings(client, {
      autoGenerateEnabled: input.autoGenerateEnabled,
      generationDay: input.generationDay,
      generationTime: input.generationTime,
      actorId: actor.userId,
    });

    const saved: ModuleSetting[] = [];
    for (const m of input.modules) {
      saved.push(
        await repo.upsertModule(client, {
          moduleKey: m.moduleKey,
          isEnabled: m.isEnabled,
          weight: m.weight,
          config: m.config,
          actorId: actor.userId,
        })
      );
    }

    // Any module not present in the payload keeps its existing row; merge so the
    // returned set is always the complete catalog.
    const existing = await repo.findModules(client);
    const merged = mergeByKey(saved, existing);
    return { ...settings, modules: sortModules(merged) };
  });
}

/** The tenant's distinct ticket statuses (+counts) for the status-marks editor. */
export async function listTicketStatuses(
  actor: Actor
): Promise<Array<{ status: string; count: number }>> {
  return withTenant(actor.tenantId, (client) => repo.findTicketStatuses(client));
}

// ─── internals ───────────────────────────────────────────────────────────────

async function ensureSettingsRow(client: TenantClient, actorId: string) {
  const existing = await repo.findSettings(client);
  if (existing) return existing;
  return repo.upsertSettings(client, {
    autoGenerateEnabled: true,
    generationDay: 'last_day',
    generationTime: '23:59',
    actorId,
  });
}

async function ensureModuleRows(client: TenantClient, actorId: string): Promise<ModuleSetting[]> {
  const existing = await repo.findModules(client);
  const have = new Set(existing.map((m) => m.moduleKey));
  const missing = MODULE_KEYS.filter((k) => !have.has(k));
  if (missing.length === 0) return existing;

  const seeded: ModuleSetting[] = [];
  for (const key of missing) {
    seeded.push(
      await repo.upsertModule(client, {
        moduleKey: key,
        isEnabled: true,
        weight: DEFAULT_WEIGHT,
        config: {},
        actorId,
      })
    );
  }
  return [...existing, ...seeded];
}

/** Later entries win — used to overlay just-saved rows on the full set. */
function mergeByKey(primary: ModuleSetting[], fallback: ModuleSetting[]): ModuleSetting[] {
  const byKey = new Map<string, ModuleSetting>();
  for (const m of fallback) byKey.set(m.moduleKey, m);
  for (const m of primary) byKey.set(m.moduleKey, m);
  return [...byKey.values()];
}

/** Stable order matching MODULE_KEYS so the FE renders modules consistently. */
function sortModules(modules: ModuleSetting[]): ModuleSetting[] {
  const order = new Map(MODULE_KEYS.map((k, i) => [k, i]));
  return [...modules].sort(
    (a, b) => (order.get(a.moduleKey) ?? 0) - (order.get(b.moduleKey) ?? 0)
  );
}
