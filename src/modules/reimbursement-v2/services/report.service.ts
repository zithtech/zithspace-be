// src/modules/reimbursement-v2/services/report.service.ts
// Read-only dashboard aggregations. Owns the transaction boundary; no writes.

import { withTenant } from '../db/pool';
import * as repo from '../repositories/report.repo';
import { Actor } from '../types';

export interface DashboardSummary {
  byStatus: repo.StatusBucket[];
  totals: { count: number; total: number };
}

export async function summary(actor: Actor, range: repo.DateRange): Promise<DashboardSummary> {
  return withTenant(actor.tenantId, async (client) => {
    const byStatus = await repo.summaryByStatus(client, range);
    const totals = byStatus.reduce(
      (acc, b) => ({ count: acc.count + b.count, total: Math.round((acc.total + b.total) * 100) / 100 }),
      { count: 0, total: 0 }
    );
    return { byStatus, totals };
  });
}

export async function byCategory(actor: Actor, range: repo.DateRange): Promise<repo.CategorySpend[]> {
  return withTenant(actor.tenantId, (client) => repo.spendByCategory(client, range));
}

export async function byUser(actor: Actor, range: repo.DateRange): Promise<repo.UserSpend[]> {
  return withTenant(actor.tenantId, (client) => repo.spendByUser(client, range));
}
