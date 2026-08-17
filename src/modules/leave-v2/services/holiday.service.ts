// src/modules/leave-v2/services/holiday.service.ts
import { withTenant } from '../db/pool';
import * as repo from '../repositories/holiday.repo';
import * as catalogRepo from '../repositories/holidayCatalog.repo';
import { Actor, LeaveV2Error } from '../types';
import { HolidayInput } from '../validators/holiday.validator';

const dedupKey = (name: string, fromDate: string) => `${name.trim().toLowerCase()}__${fromDate}`;

export async function listHolidays(actor: Actor, opts: { year?: number; includeInactive?: boolean; search?: string; type?: string; limit?: number; offset?: number }) {
  return withTenant(actor.tenantId, async (client) => {
    const { data, total } = await repo.findAll(client, opts);
    
    // For stats, we need all the rows matching the year/inactive filter but not paginated.
    // So we fetch without pagination.
    const allData = (await repo.findAll(client, { year: opts.year, includeInactive: opts.includeInactive })).data;
    const stats = {
      total: allData.length,
      national: allData.filter((r) => r.type === 'National' || r.type === 'ALL').length,
      state: allData.filter((r) => r.type === 'State').length,
      active: allData.filter((r) => r.isActive).length,
    };
    
    return { data, total, stats };
  });
}

export async function getHoliday(actor: Actor, id: string) {
  return withTenant(actor.tenantId, async (client) => {
    const h = await repo.findById(client, id);
    if (!h) throw LeaveV2Error.notFound('Holiday');
    return h;
  });
}

export async function createHoliday(actor: Actor, input: HolidayInput) {
  return withTenant(actor.tenantId, (client) =>
    repo.insert(client, normalize(input), actor.userId)
  );
}

export async function updateHoliday(actor: Actor, id: string, input: HolidayInput) {
  return withTenant(actor.tenantId, async (client) => {
    const updated = await repo.update(client, id, normalize(input), actor.userId);
    if (!updated) throw LeaveV2Error.notFound('Holiday');
    return updated;
  });
}

export async function deleteHoliday(actor: Actor, id: string) {
  return withTenant(actor.tenantId, async (client) => {
    const ok = await repo.softDelete(client, id, actor.userId);
    if (!ok) throw LeaveV2Error.notFound('Holiday');
  });
}

// ── Catalog (global reference → add to tenant) ────────────────────────────────
export async function getCatalogCountries(actor: Actor) {
  return withTenant(actor.tenantId, (client) => catalogRepo.countries(client));
}

/** Catalog entries for a country, each flagged whether the tenant already has it. */
export async function listCatalog(actor: Actor, country: string, query?: { search?: string; type?: string; limit?: number; offset?: number }) {
  return withTenant(actor.tenantId, async (client) => {
    const { data: catalog, total } = await catalogRepo.listByCountry(client, country, query);
    
    // We only need existing to check added status.
    const { data: existing } = await repo.findAll(client, { includeInactive: true });
    const have = new Set(existing.map((h) => dedupKey(h.name, h.fromDate)));
    
    const data = catalog.map((c) => ({ ...c, added: have.has(dedupKey(c.name, c.fromDate)) }));
    
    // For stats, we need all the rows for this country matching the search/type but not paginated.
    // Instead of doing another full query, wait, `GovernmentHolidaysPanel` stats:
    // stats: { total: catalog.length, added, available: catalog.length - added, selected: selected.length }
    // These stats are dependent on the FULL catalog for this country (not filtered by search/type in the UI).
    // Let's just fetch all catalog rows for this country without search/type/pagination to compute stats.
    const { data: allCatalog } = await catalogRepo.listByCountry(client, country);
    const totalCatalog = allCatalog.length;
    const addedCount = allCatalog.filter((c) => have.has(dedupKey(c.name, c.fromDate))).length;
    const stats = {
      total: totalCatalog,
      added: addedCount,
      available: totalCatalog - addedCount,
    };
    
    return { data, total, stats };
  });
}

/** Copy selected catalog entries into the tenant's holidays (skipping any already present). */
export async function addFromCatalog(actor: Actor, catalogIds: string[]) {
  return withTenant(actor.tenantId, async (client) => {
    const entries = await catalogRepo.getByIds(client, catalogIds);
    const { data: existing } = await repo.findAll(client, { includeInactive: true });
    const have = new Set(existing.map((h) => dedupKey(h.name, h.fromDate)));

    let added = 0;
    let skipped = 0;
    for (const c of entries) {
      if (have.has(dedupKey(c.name, c.fromDate))) { skipped++; continue; }
      await repo.insert(
        client,
        {
          name: c.name,
          country: c.country,
          states: c.states,
          districts: c.districts,
          fromDate: c.fromDate,
          toDate: c.toDate,
          type: c.type,
          rule: c.rule,
          isActive: true,
        },
        actor.userId
      );
      have.add(dedupKey(c.name, c.fromDate));
      added++;
    }
    return { added, skipped };
  });
}

/** Remove tenant holidays that match the given catalog entries (by name + date). */
export async function removeFromCatalog(actor: Actor, catalogIds: string[]) {
  return withTenant(actor.tenantId, async (client) => {
    const entries = await catalogRepo.getByIds(client, catalogIds);
    const { data: existing } = await repo.findAll(client, { includeInactive: true });
    const byKey = new Map(existing.map((h) => [dedupKey(h.name, h.fromDate), h.id] as const));

    let removed = 0;
    let missing = 0;
    for (const c of entries) {
      const holidayId = byKey.get(dedupKey(c.name, c.fromDate));
      if (!holidayId) { missing++; continue; }
      const ok = await repo.softDelete(client, holidayId, actor.userId);
      if (ok) removed++; else missing++;
    }
    return { removed, missing };
  });
}

// Coverage nests Country → State → District depending on the holiday type:
//   National/Restricted → states ['ALL'], no districts
//   State               → picked states, no districts
//   Local               → parent states + picked districts
function normalize(input: HolidayInput): repo.HolidayData {
  const isRegional = input.type === 'State' || input.type === 'Local';
  return {
    name: input.name,
    country: input.country,
    states: isRegional ? input.states : ['ALL'],
    districts: input.type === 'Local' ? input.districts : [],
    fromDate: input.fromDate,
    toDate: input.toDate,
    type: input.type,
    rule: input.rule,
    isActive: input.isActive,
  };
}
