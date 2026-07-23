// src/modules/reimbursement-v2/services/reimbursementSettings.service.ts

import { withTenant } from '../db/pool';
import * as repo from '../repositories/reimbursementSettings.repo';
import { Actor } from '../types';

export async function getMailSettings(actor: Actor) {
  return withTenant(actor.tenantId, async (client) => {
    return repo.getSettings(client);
  });
}

export async function updateMailSettings(actor: Actor, input: repo.ReimbMailConfig) {
  return withTenant(actor.tenantId, async (client) => {
    return repo.upsertSettings(client, actor.tenantId, input);
  });
}
