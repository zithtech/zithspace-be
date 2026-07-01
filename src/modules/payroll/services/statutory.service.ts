// src/modules/payroll/services/statutory.service.ts
//
// Business logic for statutory PF & ESI config. Seeds India-default rates on
// first read so the settings forms always have a complete payload.

import { withTenant, TenantClient } from '../db/pool';
import * as repo from '../repositories/statutory.repo';
import { Actor, EsiConfig, PfConfig } from '../types';
import { UpdateEsiInput, UpdatePfInput } from '../validators/statutory.validator';

// ── PF ───────────────────────────────────────────────────────────────────────
export async function getPf(actor: Actor): Promise<PfConfig> {
  return withTenant(actor.tenantId, (client) => ensurePf(client, actor.userId));
}

export async function updatePf(actor: Actor, input: UpdatePfInput): Promise<PfConfig> {
  return withTenant(actor.tenantId, (client) =>
    repo.upsertPf(client, {
      enabled: input.enabled,
      employeeRate: input.employeeRate,
      employerRate: input.employerRate,
      wageCeiling: input.wageCeiling,
      restrictToCeiling: input.restrictToCeiling,
      includeEmployerInCtc: input.includeEmployerInCtc,
      epsEnabled: input.epsEnabled,
      epsRate: input.epsRate,
      edliEnabled: input.edliEnabled,
      edliRate: input.edliRate,
      adminChargesRate: input.adminChargesRate,
      establishmentCode: input.establishmentCode ?? null,
      actorId: actor.userId,
    })
  );
}

async function ensurePf(client: TenantClient, actorId: string): Promise<PfConfig> {
  const existing = await repo.findPf(client);
  if (existing) return existing;
  return repo.upsertPf(client, {
    enabled: true,
    employeeRate: 12,
    employerRate: 12,
    wageCeiling: 15000,
    restrictToCeiling: true,
    includeEmployerInCtc: true,
    epsEnabled: true,
    epsRate: 8.33,
    edliEnabled: true,
    edliRate: 0.5,
    adminChargesRate: 0.5,
    establishmentCode: null,
    actorId,
  });
}

// ── ESI ──────────────────────────────────────────────────────────────────────
export async function getEsi(actor: Actor): Promise<EsiConfig> {
  return withTenant(actor.tenantId, (client) => ensureEsi(client, actor.userId));
}

export async function updateEsi(actor: Actor, input: UpdateEsiInput): Promise<EsiConfig> {
  return withTenant(actor.tenantId, (client) =>
    repo.upsertEsi(client, {
      enabled: input.enabled,
      employeeRate: input.employeeRate,
      employerRate: input.employerRate,
      wageThreshold: input.wageThreshold,
      establishmentCode: input.establishmentCode ?? null,
      actorId: actor.userId,
    })
  );
}

async function ensureEsi(client: TenantClient, actorId: string): Promise<EsiConfig> {
  const existing = await repo.findEsi(client);
  if (existing) return existing;
  return repo.upsertEsi(client, {
    enabled: true,
    employeeRate: 0.75,
    employerRate: 3.25,
    wageThreshold: 21000,
    establishmentCode: null,
    actorId,
  });
}
