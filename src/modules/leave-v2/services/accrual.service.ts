// src/modules/leave-v2/services/accrual.service.ts
//
// The accrual engine. Given a tenant + a month, it grants the leave each
// employee is entitled to for that period, writing idempotent credits to the
// ledger. Safe to re-run: duplicate periods are no-ops (ON CONFLICT DO NOTHING).
//
// Resolution: an employee may match several policies; the MOST-SPECIFIC scope
// wins per leave type — user > position > subdepartment > department > grade > org.

import { withTenant } from '../db/pool';
import * as repo from '../repositories/accrual.repo';
import * as leaveTypeRepo from '../repositories/leaveType.repo';
import { Actor, TERM_MONTHS, TermCycle } from '../types';

const SCOPE_RANK: Record<string, number> = {
  user: 5,
  position: 4,
  subdepartment: 3,
  department: 2,
  grade: 1,
  org: 0,
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The id on an employee that a given scope type matches against. */
function scopeValue(emp: repo.ResolvedEmployee, scopeType: string): string | null {
  switch (scopeType) {
    case 'user': return emp.userId;
    case 'position': return emp.positionId;
    case 'subdepartment': return emp.subDepartmentId;
    case 'department': return emp.departmentId;
    case 'grade': return emp.gradeId;
    case 'org': return '*'; // org matches everyone
    default: return null;
  }
}

function assignmentMatches(emp: repo.ResolvedEmployee, a: { scopeType: string; scopeId: string | null }): boolean {
  if (a.scopeType === 'org') return true;
  const v = scopeValue(emp, a.scopeType);
  return v != null && v === a.scopeId;
}

/** Highest specificity rank at which this policy matches the employee, or -1 if it doesn't. */
export function policyRankFor(emp: repo.ResolvedEmployee, policy: repo.AccrualPolicy): number {
  let best = -1;
  for (const a of policy.assignments) {
    if (assignmentMatches(emp, a)) best = Math.max(best, SCOPE_RANK[a.scopeType] ?? 0);
  }
  return best;
}

// Months since the tenant's leave-year start (0–11).
function monthsOffset(month: number, leaveYearStart: number): number {
  return ((month - leaveYearStart) % 12 + 12) % 12;
}

// The calendar period a grant covers (a month for monthly, the whole term for term_total).
function periodBounds(method: string, termCycle: TermCycle, year: number, month: number, leaveYearStart: number): { start: Date; end: Date } {
  if (method === 'monthly') {
    return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 0)) };
  }
  const months = TERM_MONTHS[termCycle];
  const off = monthsOffset(month, leaveYearStart);
  const leaveYear = month >= leaveYearStart ? year : year - 1;
  const termIndex = Math.floor(off / months);
  const startMonth0 = leaveYearStart - 1 + termIndex * months; // 0-based from Jan of leaveYear
  return { start: new Date(Date.UTC(leaveYear, startMonth0, 1)), end: new Date(Date.UTC(leaveYear, startMonth0 + months, 0)) };
}

const DAY = 86_400_000;

// Fraction of the period the employee is present for (1 if joined on/before the
// period start or join date unknown; 0 if they join after the period ends).
function prorationFraction(period: { start: Date; end: Date }, joinDate: string | null): number {
  if (!joinDate) return 1;
  const join = new Date(`${joinDate}T00:00:00Z`);
  if (join <= period.start) return 1;
  if (join > period.end) return 0;
  const totalDays = (period.end.getTime() - period.start.getTime()) / DAY + 1;
  const presentDays = (period.end.getTime() - join.getTime()) / DAY + 1;
  return presentDays / totalDays;
}

// Round prorated leave to the nearest half day.
const roundUnits = (n: number) => Math.round(n * 2) / 2;

function periodKey(method: string, termCycle: TermCycle, year: number, month: number, leaveYearStart: number): string {
  if (method === 'monthly') return `m:${year}-${pad2(month)}`;
  const termMonths = TERM_MONTHS[termCycle];
  const off = monthsOffset(month, leaveYearStart);
  const leaveYear = month >= leaveYearStart ? year : year - 1;
  const termIndex = Math.floor(off / termMonths);
  return `t:${termCycle}:${leaveYear}:${termIndex}`;
}

export interface AccrualSummary {
  tenantId: string;
  year: number;
  month: number;
  leaveYearStartMonth: number;
  employees: number;
  policies: number;
  credited: number;   // new ledger rows written (or would-write in dry-run)
  skipped: number;    // already existed (idempotent)
}

export interface AccrualLeaveTypeStat {
  leaveTypeId: string;
  leaveTypeName: string;
  employees: number; // distinct employees credited for this type
  units: number;     // total units credited for this type
}

export interface AccrualDetail {
  userId: string;
  userName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  units: number;
  periodKey: string;
  prorated: boolean;
}

export interface AccrualResult extends AccrualSummary {
  dryRun: boolean;
  byLeaveType: AccrualLeaveTypeStat[];
  details: AccrualDetail[]; // per (employee, leave type) grant — capped
}

const DETAILS_CAP = 1000;

/**
 * Run accrual for one tenant for a given month (defaults to the current month).
 * dryRun = compute & return the breakdown WITHOUT writing to the ledger.
 */
export async function runAccrualForTenant(
  tenantId: string,
  asOf?: { year: number; month: number },
  opts: { dryRun?: boolean } = {}
): Promise<AccrualResult> {
  const dryRun = !!opts.dryRun;
  const now = new Date();
  const year = asOf?.year ?? now.getUTCFullYear();
  const month = asOf?.month ?? now.getUTCMonth() + 1; // 1–12
  const effectiveDate = `${year}-${pad2(month)}-01`;

  return withTenant(tenantId, async (client) => {
    // NB: sequential — a single pooled pg connection cannot run queries
    // concurrently inside a transaction, so do NOT Promise.all these.
    const leaveYearStart = await repo.getLeaveYearStartMonth(client);
    const employees = await repo.resolveEmployees(client);
    const policies = await repo.loadActivePolicies(client);
    const leaveTypes = await leaveTypeRepo.findAll(client, { includeInactive: true });
    const nameOf = new Map(leaveTypes.map((t) => [t.id, t.name]));
    const existing = dryRun ? await repo.getExistingAccrualKeys(client) : null;

    let credited = 0;
    let skipped = 0;
    const ltStats = new Map<string, { employees: Set<string>; units: number }>();
    const details: AccrualDetail[] = [];
    const record = (emp: repo.ResolvedEmployee, leaveTypeId: string, units: number, periodK: string, prorated: boolean) => {
      credited++;
      const s = ltStats.get(leaveTypeId) ?? { employees: new Set<string>(), units: 0 };
      s.employees.add(emp.userId);
      s.units += units;
      ltStats.set(leaveTypeId, s);
      if (details.length < DETAILS_CAP) {
        details.push({ userId: emp.userId, userName: emp.userName, leaveTypeId, leaveTypeName: nameOf.get(leaveTypeId) ?? leaveTypeId, units, periodKey: periodK, prorated });
      }
    };

    for (const emp of employees) {
      // Rank the policies that apply to this employee (most specific first).
      const ranked = policies
        .map((p) => ({ p, rank: policyRankFor(emp, p) }))
        .filter((x) => x.rank >= 0)
        .sort((a, b) => b.rank - a.rank);
      if (ranked.length === 0) continue;

      // Winning line per leave type = first (highest-rank) policy that defines it.
      const winning = new Map<string, { policy: repo.AccrualPolicy; line: repo.AccrualLine }>();
      for (const { p } of ranked) {
        for (const line of p.lines) {
          if (!winning.has(line.leaveTypeId)) winning.set(line.leaveTypeId, { policy: p, line });
        }
      }

      for (const { policy, line } of winning.values()) {
        // Both monthly and term_total are attempted every run; idempotency on the
        // period key makes term_total once-per-term. Proration handles mid-period joiners.
        const period = periodBounds(line.accrualMethod, policy.termCycle, year, month, leaveYearStart);
        const fraction = prorationFraction(period, emp.joinDate);
        if (fraction <= 0) continue; // joined after this period ends
        const units = roundUnits(line.countPerPeriod * fraction);
        if (units <= 0) continue;

        const pk = periodKey(line.accrualMethod, policy.termCycle, year, month, leaveYearStart);

        if (dryRun) {
          const key = `${emp.userId}|${line.leaveTypeId}|${pk}`;
          if (existing!.has(key)) { skipped++; continue; }
          existing!.add(key); // de-dupe within the run (mirrors ON CONFLICT)
          record(emp, line.leaveTypeId, units, pk, fraction < 1);
          continue;
        }

        const ok = await repo.insertAccrualCredit(client, {
          employeeId: emp.employeeId,
          leaveTypeId: line.leaveTypeId,
          units,
          periodKey: pk,
          policyId: policy.id,
          effectiveDate,
          note: `Accrual ${line.accrualMethod} (${policy.termCycle})${fraction < 1 ? ` · prorated ${Math.round(fraction * 100)}%` : ''}`,
        });
        if (ok) record(emp, line.leaveTypeId, units, pk, fraction < 1); else skipped++;
      }
    }

    const byLeaveType: AccrualLeaveTypeStat[] = [...ltStats.entries()]
      .map(([leaveTypeId, s]) => ({ leaveTypeId, leaveTypeName: nameOf.get(leaveTypeId) ?? leaveTypeId, employees: s.employees.size, units: s.units }))
      .sort((a, b) => b.units - a.units);

    return {
      tenantId,
      year,
      month,
      leaveYearStartMonth: leaveYearStart,
      employees: employees.length,
      policies: policies.length,
      credited,
      skipped,
      dryRun,
      byLeaveType,
      details,
    };
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────
export async function getLeaveSettings(actor: Actor): Promise<{ leaveYearStartMonth: number; schedulerEnabled: boolean }> {
  return withTenant(actor.tenantId, async (client) => ({
    leaveYearStartMonth: await repo.getLeaveYearStartMonth(client),
    schedulerEnabled: process.env.LEAVE_ACCRUAL_ENABLED === 'true',
  }));
}

export async function setLeaveYearStartMonth(actor: Actor, month: number): Promise<{ leaveYearStartMonth: number }> {
  return withTenant(actor.tenantId, async (client) => ({
    leaveYearStartMonth: await repo.upsertLeaveYearStartMonth(client, month),
  }));
}
