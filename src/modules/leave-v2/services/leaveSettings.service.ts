import { withTenant } from '../db/pool';
import * as repo from '../repositories/leaveSettings.repo';
import { Actor } from '../types';

export async function getMailSettings(actor: Actor) {
  return withTenant(actor.tenantId, async (client) => {
    return repo.getSettings(client);
  });
}

export async function updateMailSettings(actor: Actor, input: repo.MailConfig) {
  return withTenant(actor.tenantId, async (client) => {
    return repo.upsertSettings(client, actor.tenantId, input);
  });
}
