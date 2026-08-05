import { TenantClient, withTenant } from '../db/pool';
import * as repo from '../repositories/referral.repo';
import * as openingRepo from '../repositories/opening.repo';
import { Actor, CreateReferralInput, OpeningReferral, OpeningError } from '../types';

export async function createReferral(
  actor: Actor,
  openingId: string,
  input: CreateReferralInput
): Promise<OpeningReferral> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await openingRepo.findById(client, openingId);
    if (!opening) throw OpeningError.notFound('Opening not found');

    if (opening.status === 'draft' || opening.status === 'pending_approval') {
      throw OpeningError.badRequest(
        `This opening is still "${opening.status}" — it cannot receive referrals yet`
      );
    }
    if (['cancelled', 'closed'].includes(opening.status)) {
      throw OpeningError.badRequest(
        `This opening is "${opening.status}" — it is no longer accepting referrals`
      );
    }

    return repo.createReferral(client, openingId, actor.userId, input);
  });
}

export async function listReferrals(
  actor: Actor,
  openingId: string
): Promise<OpeningReferral[]> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await openingRepo.findById(client, openingId);
    if (!opening) throw OpeningError.notFound('Opening not found');
    return repo.listReferrals(client, openingId);
  });
}

export async function markConverted(
  actor: Actor,
  openingId: string,
  referralId: string
): Promise<OpeningReferral> {
  return withTenant(actor.tenantId, async (client) => {
    const ref = await repo.getReferral(client, referralId);
    if (!ref || ref.openingId !== openingId) {
      throw OpeningError.notFound('Referral not found');
    }
    if (ref.status !== 'pending') {
      throw OpeningError.conflict(`Referral is already ${ref.status}`);
    }
    return repo.markConverted(client, referralId);
  });
}

export async function deleteReferral(
  actor: Actor,
  referralId: string
): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.getReferral(client, referralId);
    if (!existing) throw OpeningError.notFound('Referral not found');
    await repo.deleteReferral(client, referralId);
  });
}
