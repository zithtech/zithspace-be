// src/modules/payroll/services/settings.service.ts
//
// Business logic for the Payroll General Settings page. Owns the transaction
// boundary (withTenant) and the rules (default seeding). Repositories do the SQL.

import { withTenant, TenantClient } from '../db/pool';
import * as repo from '../repositories/settings.repo';
import { Actor, PayrollSettings } from '../types';
import { UpdateSettingsInput } from '../validators/settings.validator';

/**
 * Read the tenant's payroll settings, seeding sensible defaults on first access
 * so the Settings page always has a complete, editable payload.
 */
export async function getSettings(actor: Actor): Promise<PayrollSettings> {
  return withTenant(actor.tenantId, (client) => ensureSettingsRow(client, actor.userId));
}

/** Persist the full General Settings payload and return the saved state. */
export async function updateSettings(
  actor: Actor,
  input: UpdateSettingsInput
): Promise<PayrollSettings> {
  return withTenant(actor.tenantId, (client) =>
    repo.upsertSettings(client, {
      financialYearStartMonth: input.financialYearStartMonth,
      currency: input.currency,
      payFrequency: input.payFrequency,
      salaryCalcBasis: input.salaryCalcBasis,
      salaryFixedDays: input.salaryFixedDays,
      lopCalcBasis: input.lopCalcBasis,
      lopFixedDays: input.lopFixedDays,
      roundingMode: input.roundingMode,
      roundingNearest: input.roundingNearest,
      decimalPlaces: input.decimalPlaces,
      payDay: input.payDay,
      enableLop: input.enableLop,
      actorId: actor.userId,
    })
  );
}

// ─── internals ───────────────────────────────────────────────────────────────

async function ensureSettingsRow(client: TenantClient, actorId: string): Promise<PayrollSettings> {
  const existing = await repo.findSettings(client);
  if (existing) return existing;
  // First access for this tenant → seed the India-flavoured defaults.
  return repo.upsertSettings(client, {
    financialYearStartMonth: 4,
    currency: 'INR',
    payFrequency: 'monthly',
    salaryCalcBasis: 'calendar_days',
    salaryFixedDays: 30,
    lopCalcBasis: 'calendar_days',
    lopFixedDays: 30,
    roundingMode: 'nearest',
    roundingNearest: 1,
    decimalPlaces: 2,
    payDay: 1,
    enableLop: true,
    actorId,
  });
}
