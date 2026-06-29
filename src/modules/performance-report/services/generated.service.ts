// src/modules/performance-report/services/generated.service.ts
//
// Saves a generated report: uploads the PDF to R2, then upserts the thin metadata
// row (scores + summary + file URL). Listing reads back with the member joined.

import { withTenant } from '../db/pool';
import * as repo from '../repositories/generated.repo';
import { Actor } from '../types';
import { SaveGeneratedInput } from '../validators/generated.validator';
import { uploadGeneratedReportToR2 } from '@/utils/r2Client';

export async function saveGenerated(actor: Actor, input: SaveGeneratedInput) {
  // Upload first (outside the tx) so a failed upload doesn't leave a row.
  const { url, key } = await uploadGeneratedReportToR2(
    input.pdfBase64,
    actor.tenantId,
    input.userId,
    input.periodKey
  );

  return withTenant(actor.tenantId, (client) =>
    repo.upsert(client, {
      userId: input.userId,
      periodKey: input.periodKey,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      overall: input.scores.overall ?? null,
      tickets: input.scores.tickets ?? null,
      timeTracking: input.scores.timeTracking ?? null,
      dailyUpdates: input.scores.dailyUpdates ?? null,
      attendance: input.scores.attendance ?? null,
      leaves: input.scores.leaves ?? null,
      summary: input.summary,
      fileUrl: url,
      fileKey: key,
      generatedBy: actor.userId,
    })
  );
}

export async function listGenerated(actor: Actor, period?: string) {
  return withTenant(actor.tenantId, async (client) => ({
    reports: await repo.list(client, period),
    periods: await repo.listPeriods(client),
  }));
}

export async function listMine(actor: Actor) {
  return withTenant(actor.tenantId, (client) => repo.listForUser(client, actor.userId));
}

export async function deleteGenerated(actor: Actor, id: string): Promise<boolean> {
  return withTenant(actor.tenantId, (client) => repo.remove(client, id));
}
