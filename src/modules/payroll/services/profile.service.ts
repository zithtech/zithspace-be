// src/modules/payroll/services/profile.service.ts
// Business logic for employee statutory & bank profiles.

import { withTenant } from '../db/pool';
import * as repo from '../repositories/profile.repo';
import { Actor, EmployeeProfile } from '../types';
import { UpsertProfileInput } from '../validators/profile.validator';

export async function getProfile(actor: Actor, employeeId: string): Promise<EmployeeProfile | null> {
  return withTenant(actor.tenantId, (client) => repo.findByEmployee(client, employeeId));
}

export async function listProfiles(actor: Actor): Promise<EmployeeProfile[]> {
  return withTenant(actor.tenantId, (client) => repo.listAll(client));
}

export async function upsertProfile(actor: Actor, employeeId: string, input: UpsertProfileInput): Promise<EmployeeProfile> {
  return withTenant(actor.tenantId, (client) =>
    repo.upsert(client, employeeId, {
      pan: input.pan ?? null,
      uan: input.uan ?? null,
      pfNumber: input.pfNumber ?? null,
      esiNumber: input.esiNumber ?? null,
      taxRegime: input.taxRegime,
      accountHolderName: input.accountHolderName ?? null,
      bankName: input.bankName ?? null,
      bankAccountNumber: input.bankAccountNumber ?? null,
      bankIfsc: input.bankIfsc ?? null,
      actorId: actor.userId,
    })
  );
}
