// src/modules/performance-report/services/reports.service.ts
//
// Business logic for the in-month performance report. Owns the transaction
// boundary (withTenant); repositories do the SQL. First slice: tickets worked
// within a date range, optionally scoped to a project and/or member.

import { withTenant } from '../db/pool';
import * as repo from '../repositories/reports.repo';
import { Actor } from '../types';
import { TicketReportQuery, LeaveReportQuery } from '../validators/reports.validator';

export async function getTicketReport(
  actor: Actor,
  query: TicketReportQuery
): Promise<repo.TicketReportRow[]> {
  return withTenant(actor.tenantId, (client) =>
    repo.findWorkedTickets(client, {
      from: query.from,
      to: query.to,
      projectId: query.projectId,
      memberId: query.memberId,
    })
  );
}

export async function getLeaveReport(
  actor: Actor,
  query: LeaveReportQuery
): Promise<repo.LeaveReportRow[]> {
  return withTenant(actor.tenantId, (client) =>
    repo.findLeaveRequests(client, {
      from: query.from,
      to: query.to,
      memberId: query.memberId,
    })
  );
}
