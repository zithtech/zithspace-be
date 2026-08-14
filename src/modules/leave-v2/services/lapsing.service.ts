import { TenantClient, withTenant } from '../db/pool';
import * as repo from '../repositories/accrual.repo';
import { TermCycle } from '../types';
import { policyRankFor } from './accrual.service';

const TERM_MONTHS: Record<TermCycle, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

function monthsOffset(month: number, leaveYearStart: number): number {
  return ((month - leaveYearStart) % 12 + 12) % 12;
}

/** Determines if the term (for a given term cycle) ended exactly on the provided `asOf` date. */
function didTermEnd(termCycle: TermCycle, asOfYear: number, asOfMonth: number, asOfDay: number, leaveYearStart: number): boolean {
  // If term cycle is monthly, it always ends on the last day of the month.
  // Wait, we need to check if asOfDay is the last day of the month.
  const isLastDay = new Date(Date.UTC(asOfYear, asOfMonth, 0)).getUTCDate() === asOfDay;
  if (!isLastDay) return false;

  if (termCycle === 'monthly') return true;

  const months = TERM_MONTHS[termCycle];
  const leaveYear = asOfMonth >= leaveYearStart ? asOfYear : asOfYear - 1;
  const off = monthsOffset(asOfMonth, leaveYearStart);
  const termIndex = Math.floor(off / months);
  const startMonth0 = leaveYearStart - 1 + termIndex * months;
  
  // The end of this term is the last day of `startMonth0 + months - 1`
  const termEnd = new Date(Date.UTC(leaveYear, startMonth0 + months, 0));
  
  return termEnd.getUTCFullYear() === asOfYear && (termEnd.getUTCMonth() + 1) === asOfMonth && termEnd.getUTCDate() === asOfDay;
}

export interface LapsingResult {
  tenantId: string;
  year: number;
  month: number;
  day: number;
  lapsedCount: number;
  totalLapseUnits: number;
  dryRun: boolean;
}

export async function runLapsingForTenant(
  tenantId: string,
  asOf?: { year: number; month: number; day: number }, // usually yesterday
  opts: { dryRun?: boolean } = {}
): Promise<LapsingResult> {
  const dryRun = !!opts.dryRun;
  
  // Default asOf to yesterday, because lapsing usually runs early on the 1st of the month, targeting the end of the previous month.
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const year = asOf?.year ?? yesterday.getUTCFullYear();
  const month = asOf?.month ?? yesterday.getUTCMonth() + 1;
  const day = asOf?.day ?? yesterday.getUTCDate();

  return withTenant(tenantId, async (client) => {
    const leaveYearStart = await repo.getLeaveYearStartMonth(client);
    const employees = await repo.resolveEmployees(client);
    const policies = await repo.loadActivePolicies(client);
    
    let lapsedCount = 0;
    let totalLapseUnits = 0;

    for (const emp of employees) {
      // Find the winning policy for each leave type
      const ranked = policies
        .map((p) => ({ p, rank: policyRankFor(emp, p) }))
        .filter((x) => x.rank >= 0)
        .sort((a, b) => b.rank - a.rank);
      
      if (ranked.length === 0) continue;

      const winning = new Map<string, { policy: repo.AccrualPolicy; line: repo.AccrualLine }>();
      for (const { p } of ranked) {
        for (const line of p.lines) {
          if (!winning.has(line.leaveTypeId)) winning.set(line.leaveTypeId, { policy: p, line });
        }
      }

      // Fetch employee's balance STRICTLY as of the term end date.
      // This ensures idempotency: if we already inserted a lapse entry on this date, 
      // the balance will be 0 (or carryForwardMax) and we won't lapse again.
      // It also prevents accidentally lapsing accruals from future months.
      const asOfStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      const { rows: balRows } = await client.query(
        `SELECT leave_type_id, COALESCE(SUM(units), 0) AS available
           FROM lv2_leave_ledger
          WHERE tenant_id = $1 AND user_id = $2 AND effective_date <= $3
          GROUP BY leave_type_id`,
        [client.tenantId, emp.userId, asOfStr]
      );
      const balanceMap = new Map(balRows.map(b => [b.leave_type_id, Number(b.available)]));

      for (const { policy, line } of winning.values()) {
        const balance = balanceMap.get(line.leaveTypeId) ?? 0;
        if (balance <= 0) continue; // nothing to lapse

        // Did this policy's term end yesterday?
        if (!didTermEnd(policy.termCycle, year, month, day, leaveYearStart)) {
          continue;
        }

        let lapseUnits = 0;
        if (!line.carryForward) {
          lapseUnits = balance;
        } else if (line.carryForwardMax !== null && balance > line.carryForwardMax) {
          lapseUnits = balance - line.carryForwardMax;
        }

        if (lapseUnits <= 0) continue;

        lapsedCount++;
        totalLapseUnits += lapseUnits;

        if (!dryRun) {
          await client.query(
            `INSERT INTO lv2_leave_ledger
               (tenant_id, user_id, leave_type_id, entry_type, units, source, note, effective_date)
             VALUES ($1, $2, $3, 'lapse', $4, 'system_lapsing', $5, $6)`,
            [
              client.tenantId,
              emp.userId,
              line.leaveTypeId,
              -lapseUnits, // deduction
              `Lapsed at end of ${policy.termCycle} term (carry-forward rules applied)`,
              `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
            ]
          );
        }
      }
    }

    return {
      tenantId,
      year,
      month,
      day,
      lapsedCount,
      totalLapseUnits,
      dryRun,
    };
  });
}
