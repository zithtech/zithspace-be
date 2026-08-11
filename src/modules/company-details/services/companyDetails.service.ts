// src/modules/company-details/services/companyDetails.service.ts
// Use-case layer: opens the tenant-scoped transaction and applies the rules the
// repositories deliberately stay ignorant of.

import { withTenant } from '../db/pool';
import * as companyRepo from '../repositories/companyDetails.repo';
import * as branchRepo from '../repositories/branch.repo';
import { Actor, CompanyBranch, CompanyDetails, CompanyDetailsError } from '../types';
import {
  CreateBranchInput,
  SaveCompanyDetailsInput,
  UpdateBranchInput,
} from '../validators/companyDetails.validator';

/** The company profile plus its branches — what the settings screen loads. */
export async function getOverview(
  actor: Actor
): Promise<{ company: CompanyDetails | null; branches: CompanyBranch[] }> {
  return withTenant(actor.tenantId, async (client) => ({
    company: await companyRepo.findByTenant(client),
    branches: await branchRepo.findAll(client),
  }));
}

export async function getCompany(actor: Actor): Promise<CompanyDetails | null> {
  return withTenant(actor.tenantId, (client) => companyRepo.findByTenant(client));
}

export async function saveCompany(
  actor: Actor,
  input: SaveCompanyDetailsInput
): Promise<CompanyDetails> {
  return withTenant(actor.tenantId, (client) => companyRepo.save(client, input, actor.userId));
}

export async function listBranches(actor: Actor): Promise<CompanyBranch[]> {
  return withTenant(actor.tenantId, (client) => branchRepo.findAll(client));
}

export async function getBranch(actor: Actor, id: string): Promise<CompanyBranch> {
  const branch = await withTenant(actor.tenantId, (client) => branchRepo.findById(client, id));
  if (!branch) throw CompanyDetailsError.notFound('Branch');
  return branch;
}

/**
 * A branch may only reuse the company email once that email exists — otherwise
 * we'd hand out branches whose effectiveEmail is silently null.
 */
async function assertCompanyEmailAvailable(
  actor: Actor,
  // Optional because the schema's `.default(true)` fills it in at parse time;
  // an omitted flag therefore means "reuse the company email".
  input: { useCompanyEmail?: boolean }
): Promise<void> {
  if (input.useCompanyEmail === false) return;
  const email = await withTenant(actor.tenantId, (client) => companyRepo.findPrimaryEmail(client));
  if (!email) {
    throw CompanyDetailsError.badRequest(
      'Save the company details first, or give this branch its own email address'
    );
  }
}

export async function createBranch(
  actor: Actor,
  input: CreateBranchInput
): Promise<CompanyBranch> {
  await assertCompanyEmailAvailable(actor, input);
  return withTenant(actor.tenantId, (client) => branchRepo.create(client, input, actor.userId));
}

export async function updateBranch(
  actor: Actor,
  id: string,
  input: UpdateBranchInput
): Promise<CompanyBranch> {
  await assertCompanyEmailAvailable(actor, input);
  const branch = await withTenant(actor.tenantId, (client) =>
    branchRepo.update(client, id, input, actor.userId)
  );
  if (!branch) throw CompanyDetailsError.notFound('Branch');
  return branch;
}

export async function deleteBranch(actor: Actor, id: string): Promise<void> {
  const deleted = await withTenant(actor.tenantId, (client) => branchRepo.remove(client, id));
  if (!deleted) throw CompanyDetailsError.notFound('Branch');
}
