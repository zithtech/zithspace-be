// src/modules/performance-report/services/autoGenerate.service.ts
//
// Background service that automatically computes module scores, renders reports,
// uploads PDFs to R2, and saves generated monthly records for all active members.

import puppeteer, { Browser } from 'puppeteer';
import dayjs from 'dayjs';
import { perfReportPool, withTenant, TenantClient } from '../db/pool';
import * as generatedRepo from '../repositories/generated.repo';
import * as settingsRepo from '../repositories/settings.repo';
import { ModuleSetting } from '../types';
import { findWorkedTickets, findLeaveRequests, TicketReportRow, LeaveReportRow } from '../repositories/reports.repo';
import { uploadGeneratedReportToR2 } from '@/utils/r2Client';

export interface SweepResult {
  scannedTenants: number;
  generatedCount: number;
  failedCount: number;
  errors: Array<{ tenantId: string; userId?: string; error: string }>;
}

// ─── Scoring Helpers ─────────────────────────────────────────────────────────

export interface TicketPointInput {
  status: string;
  estimateHours: number;
  trackedSeconds: number;
}

const POINT_STEPS: Array<{ maxOverMin: number; points: number }> = [
  { maxOverMin: 30, points: 94 }, // 0–30 min
  { maxOverMin: 60, points: 90 }, // 30–60 min
  { maxOverMin: 90, points: 85 }, // 1h–1h30
  { maxOverMin: 120, points: 78 }, // 1h30–2h
  { maxOverMin: 180, points: 70 }, // 2h–3h
  { maxOverMin: 240, points: 62 }, // 3h–4h
  { maxOverMin: 300, points: 54 }, // 4h–5h
  { maxOverMin: 360, points: 46 }, // 5h–6h
  { maxOverMin: 420, points: 38 }, // 6h–7h
];
const FLOOR_POINTS = 30;
const GRACE_SECONDS = 60;
export const MISSING_DATA_PENALTY = 15;

export type StatusMarks = Record<string, number>;

export function normalizeStatus(status: string): string {
  return (status || '').trim().toLowerCase();
}

function efficiencyPoints(input: TicketPointInput): number {
  const hasEst = input.estimateHours > 0;
  const hasTracked = input.trackedSeconds > 0;

  if (!hasEst || !hasTracked) return 100 - MISSING_DATA_PENALTY;

  const overSec = input.trackedSeconds - input.estimateHours * 3600;
  if (overSec <= GRACE_SECONDS) return 100;

  const overMin = overSec / 60;
  for (const step of POINT_STEPS) {
    if (overMin <= step.maxOverMin) return step.points;
  }
  return FLOOR_POINTS;
}

export function ticketPoints(input: TicketPointInput, statusMarks?: StatusMarks): number {
  const base = efficiencyPoints(input);
  const cap = statusMarks ? statusMarks[normalizeStatus(input.status)] ?? 100 : 100;
  return Math.min(base, cap);
}

export function timeTrackingPoints(avgHoursPerDay: number): number {
  const h = avgHoursPerDay;
  if (h >= 6) return 100;
  if (h >= 4.5) return 70;
  if (h >= 3) return 40;
  return 25;
}

export function isLastDayOfMonth(date: Date = new Date()): boolean {
  const d = dayjs(date);
  return d.date() === d.daysInMonth();
}

export function getPeriodBounds(targetDate: Date = new Date()): {
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  rangeLabel: string;
} {
  const d = dayjs(targetDate);
  const start = d.startOf('month');
  const end = d.endOf('month');
  return {
    periodKey: d.format('YYYY-MM'),
    periodStart: start.format('YYYY-MM-DD'),
    periodEnd: end.format('YYYY-MM-DD'),
    periodLabel: d.format('MMMM YYYY'),
    rangeLabel: `${start.format('MMM D')} – ${end.format('MMM D, YYYY')}`,
  };
}

function fmtHM(sec: number): string {
  const total = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function fmtMin(min: number): string {
  if (!min) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
}

const fmtDate = (d: any) => (d ? dayjs(d).format('MMM D, YYYY') : '—');
const fmtDateShort = (d: any) => (d ? dayjs(d).format('MMM D') : '—');
const fmtTime = (d: any) => (d ? dayjs(d).format('h:mm A') : '—');

const scoreColor = (p: number | null) =>
  p === null ? '#64748b' : p >= 90 ? '#10b981' : p >= 75 ? '#f59e0b' : '#dc2626';

function performanceBand(score: number | null): { label: string; color: string } {
  if (score === null) return { label: 'No Data', color: '#64748b' };
  if (score >= 90) return { label: 'Exceptional', color: '#10b981' };
  if (score >= 75) return { label: 'Good', color: '#f59e0b' };
  return { label: 'Needs Attention', color: '#dc2626' };
}

function delayOf(estHours: number, trackedSecs: number) {
  if (!estHours || !trackedSecs) return { text: '—', color: '#94a3b8' };
  const diffSecs = trackedSecs - estHours * 3600;
  if (diffSecs > 60) return { text: `+${fmtHM(diffSecs)}`, color: '#dc2626' };
  if (diffSecs < -60) return { text: `−${fmtHM(-diffSecs)}`, color: '#10b981' };
  return { text: 'On time', color: '#10b981' };
}

const ticketStatusMeta = (status: string) => {
  const s = (status || '').toLowerCase().trim();
  if (['completed', 'done', 'live', 'live (deployed)'].includes(s))
    return { label: 'Done', color: '#10b981', bg: '#ecfdf5' };
  if (['in_progress', 'in_testing', 'started', 'active'].includes(s))
    return { label: 'In progress', color: '#3b82f6', bg: '#eff6ff' };
  if (['blocked', 'on_hold', 'on-hold'].includes(s))
    return { label: 'Blocked', color: '#dc2626', bg: '#fef2f2' };
  return { label: (status || 'not started').replace(/_/g, ' '), color: '#64748b', bg: '#f1f5f9' };
};

// ─── Full Report Model & HTML Generator ───────────────────────────────────────

export interface StageScore {
  key: string;
  label: string;
  score: number | null;
  weight: number;
  enabled: boolean;
}

export interface TicketRow {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  type?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  dueDate?: string | Date | null;
  estimateHours: number;
  trackedSeconds: number;
  sprintName?: string | null;
  points?: number | null;
}

export interface TimeTrackingDetailRow {
  userName?: string;
  date: string | Date;
  weekday: string;
  formattedDuration: string;
  ticketCount?: number | string;
  status: string;
}

export interface DailyUpdateRow {
  id: string;
  userName?: string;
  updateType?: string;
  createdAt: string | Date;
  tasksCount?: number | string;
  totalHoursWorked?: number | string;
  mood?: string;
}

export interface AttendanceRow {
  id: string;
  userName?: string;
  date: string | Date;
  clockIn?: string | Date | null;
  clockOut?: string | Date | null;
  workMinutes?: number;
  lateMinutes?: number;
  status: string;
}

export interface LeaveRow {
  id: string;
  userName?: string;
  leaveTypeName?: string | null;
  fromDate: string | Date;
  toDate: string | Date;
  totalUnits: number;
  lopUnits: number;
  status: string;
}

export interface FullReportModel {
  member: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    workEmail?: string | null;
    position?: string | null;
    department?: string | null;
  };
  range: {
    from: string;
    to: string;
    monthLabel: string;
    rangeLabel: string;
  };
  overall: number | null;
  stages: StageScore[];
  tickets: {
    score: number | null;
    rows: TicketRow[];
  };
  timeTracking: {
    score: number | null;
    avgSeconds: number;
    trackedDays: number;
    summaryTiers: Array<{ label: string; days: number }>;
    detailed: TimeTrackingDetailRow[];
  };
  dailyUpdates: {
    score: number | null;
    expected: number;
    posted: number;
    missed: number;
    rows: DailyUpdateRow[];
  };
  attendance: {
    score: number | null;
    expected: number;
    present: number;
    absent: number;
    avgMins: number;
    rows: AttendanceRow[];
  };
  leaves: {
    score: number | null;
    leaveDays: number;
    paidDays: number;
    lopDays: number;
    rows: LeaveRow[];
  };
}

export function buildPerformanceReportHtml(model: FullReportModel): string {
  const { member, range } = model;
  const overallBand = performanceBand(model.overall);

  let tkOnTime = 0;
  let tkDelayed = 0;
  for (const t of model.tickets.rows) {
    if (t.estimateHours > 0 && t.trackedSeconds > 0) {
      if (t.trackedSeconds - t.estimateHours * 3600 > 60) tkDelayed++;
      else tkOnTime++;
    }
  }
  const tkTotal = model.tickets.rows.length;

  const stageCardsHtml = model.stages
    .map((s) => {
      const band = performanceBand(s.score);
      return `
        <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #ffffff; ${s.enabled ? '' : 'opacity: 0.5;'}">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 12px; font-weight: 700; color: #334155;">${s.label}</span>
            <span style="font-size: 10px; font-weight: 700; color: #94a3b8;">${Number(s.weight)}%</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: flex-end;">
            <div style="display: flex; align-items: baseline; gap: 3px;">
              <span style="font-size: 22px; font-weight: 800; line-height: 1; color: ${scoreColor(s.score)};">${s.score ?? '—'}</span>
              <span style="font-size: 10px; font-weight: 700; color: #94a3b8;">/ 100</span>
            </div>
            <span style="font-size: 10px; font-weight: 700; color: ${band.color};">${s.enabled ? band.label : 'Excluded'}</span>
          </div>
        </div>
      `;
    })
    .join('');

  const ticketRowsHtml =
    model.tickets.rows.length === 0
      ? `<tr><td colspan="9" style="padding: 24px; text-align: center; color: #94a3b8; font-style: italic;">No tickets worked in this window.</td></tr>`
      : model.tickets.rows
          .map((t) => {
            const st = ticketStatusMeta(t.status);
            const del = delayOf(t.estimateHours || 0, t.trackedSeconds || 0);
            const ptsColor = scoreColor(t.points ?? null);
            return `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 12px; vertical-align: middle;">
                  <div style="display: flex; align-items: flex-start; gap: 6px;">
                    <span style="width: 6px; height: 6px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; background: ${st.color};"></span>
                    <div>
                      <div style="font-weight: 700; color: #2563eb; font-size: 11.5px; line-height: 1.2;">
                        ${t.ticketNumber}
                        ${t.sprintName ? `<span style="margin-left: 4px; font-weight: 400; font-size: 9px; color: #94a3b8; background: #f1f5f9; padding: 2px 4px; border-radius: 4px;">${t.sprintName}</span>` : ''}
                      </div>
                      <div style="font-size: 11px; color: #334155; line-height: 1.3; margin-top: 2px;">${t.title}</div>
                    </div>
                  </div>
                </td>
                <td style="padding: 10px 6px; font-size: 10.5px; text-align: center; color: #64748b; border-left: 1px solid #f1f5f9; text-transform: capitalize;">${t.type || '—'}</td>
                <td style="padding: 10px 6px; font-size: 10.5px; text-align: center; color: #64748b; border-left: 1px solid #f1f5f9; white-space: nowrap;">${t.startDate ? fmtDateShort(t.startDate) : '—'}</td>
                <td style="padding: 10px 6px; font-size: 10.5px; text-align: center; color: #64748b; border-left: 1px solid #f1f5f9; white-space: nowrap;">${t.endDate || t.dueDate ? fmtDateShort(t.endDate || t.dueDate) : '—'}</td>
                <td style="padding: 10px 6px; font-size: 10.5px; text-align: center; color: #64748b; border-left: 1px solid #f1f5f9; white-space: nowrap;">${t.estimateHours > 0 ? `${t.estimateHours}h` : '—'}</td>
                <td style="padding: 10px 6px; font-size: 11px; text-align: center; font-weight: 700; color: #0f172a; border-left: 1px solid #f1f5f9; white-space: nowrap;">${t.trackedSeconds > 0 ? fmtHM(t.trackedSeconds) : '—'}</td>
                <td style="padding: 10px 6px; font-size: 11px; text-align: center; font-weight: 700; color: ${del.color}; border-left: 1px solid #f1f5f9; white-space: nowrap;">${del.text}</td>
                <td style="padding: 10px 6px; font-size: 11px; text-align: center; font-weight: 700; color: ${ptsColor}; border-left: 1px solid #f1f5f9; white-space: nowrap;">${t.points !== null && t.points !== undefined ? `${t.points}%` : '—'}</td>
                <td style="padding: 10px 6px; text-align: center; border-left: 1px solid #f1f5f9;">
                  <span style="display: inline-block; font-size: 11px; font-weight: 600; color: ${st.color};">${st.label}</span>
                </td>
              </tr>
            `;
          })
          .join('');

  const timeDetailRowsHtml =
    model.timeTracking.detailed.length === 0
      ? `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #94a3b8; font-style: italic;">No tracking records.</td></tr>`
      : model.timeTracking.detailed
          .map(
            (r) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 12px; font-size: 11px; font-weight: 600; color: #334155;">${r.userName || member.name}</td>
              <td style="padding: 8px 12px; font-size: 11px; color: #64748b;">${dayjs(r.date).format('MMM D')}</td>
              <td style="padding: 8px 12px; font-size: 11px; color: #94a3b8;">${r.weekday}</td>
              <td style="padding: 8px 12px; font-size: 11px; font-weight: 700; text-align: right; color: #334155;">${r.formattedDuration}</td>
              <td style="padding: 8px 12px; font-size: 11px; text-align: right; color: #64748b;">${r.ticketCount ?? '—'}</td>
              <td style="padding: 8px 12px; font-size: 11px; color: #64748b;">${r.status}</td>
            </tr>
          `
          )
          .join('');

  const dailyUpdatesRowsHtml =
    model.dailyUpdates.rows.length === 0
      ? `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #94a3b8; font-style: italic;">No daily updates posted in this window.</td></tr>`
      : model.dailyUpdates.rows
          .map(
            (u) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 12px; font-size: 11px; font-weight: 600; color: #334155;">${u.userName || member.name}</td>
              <td style="padding: 8px 12px; font-size: 11px; color: #64748b;">${u.updateType || 'EOD'}</td>
              <td style="padding: 8px 12px; font-size: 11px; color: #64748b;">${fmtDate(u.createdAt)}</td>
              <td style="padding: 8px 12px; font-size: 11px; text-align: right; color: #64748b;">${u.tasksCount ?? '—'}</td>
              <td style="padding: 8px 12px; font-size: 11px; text-align: right; color: #64748b;">${u.totalHoursWorked ? `${u.totalHoursWorked}h` : '—'}</td>
              <td style="padding: 8px 12px; font-size: 11px; color: #64748b; text-transform: capitalize;">${u.mood || '—'}</td>
            </tr>
          `
          )
          .join('');

  const attendanceRowsHtml =
    model.attendance.rows.length === 0
      ? `<tr><td colspan="7" style="padding: 24px; text-align: center; color: #94a3b8; font-style: italic;">No attendance records in this window.</td></tr>`
      : model.attendance.rows
          .map(
            (r) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 12px; font-size: 11px; font-weight: 600; color: #334155;">${r.userName || member.name}</td>
              <td style="padding: 8px 12px; font-size: 11px; color: #64748b;">${dayjs(r.date).format('MMM D')}</td>
              <td style="padding: 8px 12px; font-size: 11px; color: #64748b;">${fmtTime(r.clockIn)}</td>
              <td style="padding: 8px 12px; font-size: 11px; color: #64748b;">${fmtTime(r.clockOut)}</td>
              <td style="padding: 8px 12px; font-size: 11px; font-weight: 700; text-align: right; color: #334155;">${fmtMin(r.workMinutes ?? 0)}</td>
              <td style="padding: 8px 12px; font-size: 11px; text-align: right; color: ${(r.lateMinutes ?? 0) > 0 ? '#dc2626' : '#94a3b8'};">${(r.lateMinutes ?? 0) > 0 ? fmtMin(r.lateMinutes ?? 0) : '—'}</td>
              <td style="padding: 8px 12px; font-size: 11px; color: #64748b; text-transform: capitalize;">${(r.status || '').replace('-', ' ')}</td>
            </tr>
          `
          )
          .join('');

  const leavesRowsHtml =
    model.leaves.rows.length === 0
      ? `<tr><td colspan="7" style="padding: 24px; text-align: center; color: #94a3b8; font-style: italic;">No leaves in this window.</td></tr>`
      : model.leaves.rows
          .map(
            (l) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 12px; font-size: 11px; font-weight: 600; color: #334155;">${l.userName || member.name}</td>
              <td style="padding: 8px 12px; font-size: 11px; color: #64748b;">${l.leaveTypeName || '—'}</td>
              <td style="padding: 8px 12px; font-size: 11px; color: #64748b;">${dayjs(l.fromDate).format('MMM D')}</td>
              <td style="padding: 8px 12px; font-size: 11px; color: #64748b;">${dayjs(l.toDate).format('MMM D')}</td>
              <td style="padding: 8px 12px; font-size: 11px; font-weight: 700; text-align: right; color: #334155;">${Number((l.totalUnits || 0).toFixed(2))}</td>
              <td style="padding: 8px 12px; font-size: 11px; text-align: right; color: ${l.lopUnits > 0 ? '#dc2626' : '#94a3b8'};">${l.lopUnits > 0 ? Number(l.lopUnits.toFixed(2)) : '—'}</td>
              <td style="padding: 8px 12px; font-size: 11px; color: #64748b; text-transform: capitalize;">${l.status}</td>
            </tr>
          `
          )
          .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Performance Report - ${member.name} - ${range.monthLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background: #f8fafc; color: #0f172a; padding: 28px 32px; font-size: 12px; line-height: 1.4; }
    @page { size: A4; margin: 8mm 6mm; }
    
    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 18px 20px;
      margin-bottom: 16px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
      break-inside: auto !important;
      page-break-inside: auto !important;
    }
    .section-title {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #1e40af;
      margin-bottom: 14px;
    }
    .stat-cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }
    .stat-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .stat-card.points {
      background: #ffffff;
    }
    .stat-val {
      font-size: 20px;
      font-weight: 800;
      line-height: 1;
    }
    .stat-lbl {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-top: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      break-inside: auto !important;
      page-break-inside: auto !important;
    }
    thead tr {
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    th {
      padding: 8px 10px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
    }
    tr {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
  </style>
</head>
<body>

  <div style="border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 16px;">
    <table style="width: 100%; border: none; border-collapse: collapse;">
      <tbody>
        <tr>
          <td style="width: 68px; vertical-align: middle; border: none; padding: 0;">
            <div style="width: 54px; height: 54px; border-radius: 50%; background: #3b82f6; color: #ffffff; font-size: 22px; font-weight: 800; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 54px;">
              ${member.name ? member.name.charAt(0).toUpperCase() : 'Z'}
            </div>
          </td>
          <td style="vertical-align: middle; border: none; padding: 0 12px;">
            <div style="font-size: 20px; font-weight: 800; line-height: 1.2; color: #0f172a;">${member.name}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 3px;">
              ${[member.position, member.department].filter(Boolean).join('  ·  ') || 'Member'}
            </div>
            ${member.workEmail ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${member.workEmail}</div>` : ''}
          </td>
          <td style="vertical-align: middle; text-align: right; white-space: nowrap; border: none; padding: 0;">
            <div style="font-size: 16px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em;">
              Performance Report
            </div>
            <div style="font-size: 13px; font-weight: 700; color: #64748b; margin-top: 3px;">${range.monthLabel}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${range.rangeLabel}</div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <section class="card">
    <div class="section-title">Overview</div>
    
    <div style="border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; padding: 18px 24px; display: flex; align-items: center; gap: 24px; margin-bottom: 14px;">
      <div style="display: flex; align-items: baseline; gap: 4px;">
        <span style="font-size: 42px; font-weight: 800; line-height: 1; color: ${scoreColor(model.overall)};">${model.overall ?? '—'}</span>
        <span style="font-size: 15px; font-weight: 600; color: #94a3b8;">/ 100</span>
      </div>
      <div style="width: 1px; height: 42px; background: #cbd5e1;"></div>
      <div>
        <div style="font-size: 16px; font-weight: 800; color: ${overallBand.color};">${overallBand.label}</div>
        <div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">Overall performance · weighted across stages</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
      ${stageCardsHtml}
    </div>
  </section>

  <section class="card">
    <div class="section-title">Tickets</div>
    <div class="stat-cards-grid">
      <div class="stat-card points">
        <div class="stat-val" style="color: ${scoreColor(model.tickets.score)};">${model.tickets.score ?? '—'}<span style="font-size: 11px; font-weight: 600; color: #94a3b8;"> / 100</span></div>
        <div class="stat-lbl">Avg points</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${tkTotal}</div>
        <div class="stat-lbl">Total</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #16a34a;">${tkOnTime}</div>
        <div class="stat-lbl">On-time</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #dc2626;">${tkDelayed}</div>
        <div class="stat-lbl">Delayed</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 27%; text-align: left;">Ticket</th>
          <th style="width: 12%; text-align: center;">Type</th>
          <th style="width: 8%; text-align: center;">Start</th>
          <th style="width: 8%; text-align: center;">End</th>
          <th style="width: 6%; text-align: center;">Est</th>
          <th style="width: 10%; text-align: center;">Tracked</th>
          <th style="width: 11%; text-align: center;">Delay</th>
          <th style="width: 8%; text-align: center;">Points</th>
          <th style="width: 10%; text-align: center;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${ticketRowsHtml}
      </tbody>
    </table>
  </section>

  <section class="card">
    <div class="section-title">Time Tracking</div>
    <div class="stat-cards-grid">
      <div class="stat-card points">
        <div class="stat-val" style="color: ${scoreColor(model.timeTracking.score)};">${model.timeTracking.score ?? '—'}<span style="font-size: 11px; font-weight: 600; color: #94a3b8;"> / 100</span></div>
        <div class="stat-lbl">Avg points</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${fmtHM(model.timeTracking.avgSeconds)}</div>
        <div class="stat-lbl">Avg hours / day</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${model.timeTracking.trackedDays}</div>
        <div class="stat-lbl">Tracked days</div>
      </div>
    </div>

    ${
      model.timeTracking.summaryTiers.length > 0
        ? `
      <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin: 12px 0 8px 0;">Performance Summary</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
        ${model.timeTracking.summaryTiers
          .map(
            (tr) => `
          <div style="display: flex; justify-content: space-between; align-items: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; background: #f8fafc;">
            <span style="font-size: 11.5px; font-weight: 600; color: #334155;">${tr.label}</span>
            <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${tr.days} days</span>
          </div>
        `
          )
          .join('')}
      </div>
    `
        : ''
    }

    <table>
      <thead>
        <tr>
          <th style="text-align: left;">Member</th>
          <th style="text-align: left;">Date</th>
          <th style="text-align: left;">Weekday</th>
          <th style="text-align: right;">Hours</th>
          <th style="text-align: right;">Tickets</th>
          <th style="text-align: left;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${timeDetailRowsHtml}
      </tbody>
    </table>
  </section>

  <section class="card">
    <div class="section-title">Daily Updates</div>
    <div class="stat-cards-grid">
      <div class="stat-card points">
        <div class="stat-val" style="color: ${scoreColor(model.dailyUpdates.score)};">${model.dailyUpdates.score ?? '—'}<span style="font-size: 11px; font-weight: 600; color: #94a3b8;"> / 100</span></div>
        <div class="stat-lbl">Avg points</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${model.dailyUpdates.expected}</div>
        <div class="stat-lbl">Expected days</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #16a34a;">${model.dailyUpdates.posted}</div>
        <div class="stat-lbl">Posted</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #dc2626;">${model.dailyUpdates.missed}</div>
        <div class="stat-lbl">Missed</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align: left;">Member</th>
          <th style="text-align: left;">Type</th>
          <th style="text-align: left;">Posted On</th>
          <th style="text-align: right;">Tasks</th>
          <th style="text-align: right;">Hours</th>
          <th style="text-align: left;">Mood</th>
        </tr>
      </thead>
      <tbody>
        ${dailyUpdatesRowsHtml}
      </tbody>
    </table>
  </section>

  <section class="card">
    <div class="section-title">Attendance</div>
    <div class="stat-cards-grid">
      <div class="stat-card points">
        <div class="stat-val" style="color: ${scoreColor(model.attendance.score)};">${model.attendance.score ?? '—'}<span style="font-size: 11px; font-weight: 600; color: #94a3b8;"> / 100</span></div>
        <div class="stat-lbl">Avg points</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #16a34a;">${model.attendance.present}</div>
        <div class="stat-lbl">Present</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #dc2626;">${model.attendance.absent}</div>
        <div class="stat-lbl">Absent</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${fmtMin(model.attendance.avgMins)}</div>
        <div class="stat-lbl">Avg hours / day</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align: left;">Member</th>
          <th style="text-align: left;">Date</th>
          <th style="text-align: left;">Clock In</th>
          <th style="text-align: left;">Clock Out</th>
          <th style="text-align: right;">Hours</th>
          <th style="text-align: right;">Late</th>
          <th style="text-align: left;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${attendanceRowsHtml}
      </tbody>
    </table>
  </section>

  <section class="card">
    <div class="section-title">Leaves</div>
    <div class="stat-cards-grid">
      <div class="stat-card points">
        <div class="stat-val" style="color: ${scoreColor(model.leaves.score)};">${model.leaves.score ?? '—'}<span style="font-size: 11px; font-weight: 600; color: #94a3b8;"> / 100</span></div>
        <div class="stat-lbl">Avg points</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${Number(model.leaves.leaveDays.toFixed(2))}</div>
        <div class="stat-lbl">Leave days</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #16a34a;">${Number(model.leaves.paidDays.toFixed(2))}</div>
        <div class="stat-lbl">Paid</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #dc2626;">${Number(model.leaves.lopDays.toFixed(2))}</div>
        <div class="stat-lbl">LOP</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${model.leaves.rows.length}</div>
        <div class="stat-lbl">Requests</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align: left;">Member</th>
          <th style="text-align: left;">Leave Type</th>
          <th style="text-align: left;">From</th>
          <th style="text-align: left;">To</th>
          <th style="text-align: right;">Days</th>
          <th style="text-align: right;">LOP</th>
          <th style="text-align: left;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${leavesRowsHtml}
      </tbody>
    </table>
  </section>

  <div style="padding-top: 16px; padding-bottom: 24px; text-align: center; font-size: 12px; font-weight: 600; color: #94a3b8;">
    Generated from <span style="color: #3b82f6;">Zukvo</span>
  </div>

</body>
</html>`;
}

// ─── Core Data Aggregation & PDF Export ───────────────────────────────────────

async function computeMemberReportData(
  client: TenantClient,
  member: { id: string; name: string; workEmail?: string | null; position?: string | null; department?: string | null },
  bounds: { periodKey: string; periodStart: string; periodEnd: string; periodLabel: string; rangeLabel: string },
  moduleSettings: ModuleSetting[]
): Promise<{
  scores: {
    overall: number | null;
    tickets: number | null;
    timeTracking: number | null;
    dailyUpdates: number | null;
    attendance: number | null;
    leaves: number | null;
  };
  summary: Record<string, any>;
  reportModel: FullReportModel;
}> {
  const settingsByKey = new Map(moduleSettings.map((s) => [s.moduleKey, s]));
  const ticketsSetting = settingsByKey.get('tickets');
  const statusMarks = (ticketsSetting?.config as any)?.statusMarks as StatusMarks | undefined;

  // 1. Tickets
  let ticketsScore: number | null = null;
  let workedTickets: TicketReportRow[] = [];
  const ticketRows: TicketRow[] = [];
  if (ticketsSetting?.isEnabled !== false) {
    try {
      workedTickets = await findWorkedTickets(client, {
        from: bounds.periodStart,
        to: bounds.periodEnd,
        memberId: member.id,
      });
      if (workedTickets.length > 0) {
        const byId = new Map<string, any>();
        for (const t of workedTickets) {
          const cur = byId.get(t.id);
          if (cur) cur.trackedSeconds += t.trackedSeconds || 0;
          else {
            byId.set(t.id, {
              id: t.id,
              ticketNumber: t.ticketNumber,
              title: t.title,
              status: t.status,
              type: t.type,
              startDate: t.startDate,
              endDate: t.endDate,
              dueDate: t.dueDate,
              sprintName: t.sprintName,
              estimateHours: t.estimateHours || 0,
              trackedSeconds: t.trackedSeconds || 0,
            });
          }
        }
        const points: number[] = [];
        byId.forEach((v) => {
          const p = ticketPoints(v, statusMarks);
          points.push(p);
          ticketRows.push({
            ...v,
            points: p,
          });
        });
        ticketsScore = points.length ? Math.round(points.reduce((a, b) => a + b, 0) / points.length) : null;
      }
    } catch (err) {
      console.error(`[perf-auto-gen] failed to compute tickets for ${member.id}:`, err);
    }
  }

  // 2. Time Tracking
  let timeTrackingScore: number | null = null;
  let totalTrackedSeconds = 0;
  let trackedDaysCount = 0;
  let avgSeconds = 0;
  const timeDetailRows: TimeTrackingDetailRow[] = [];
  const tierCounts = { expected: 0, moderate: 0, low: 0, minimal: 0 };
  const timeSetting = settingsByKey.get('time_tracking');
  if (timeSetting?.isEnabled !== false) {
    try {
      const { rows: timeRows } = await client.query(
        `SELECT
            DATE(start_time) AS work_date,
            SUM(duration) AS day_seconds,
            COUNT(DISTINCT ticket_id) AS ticket_count
           FROM time_tracking_entries
          WHERE tenant_id = $1
            AND user_id = $2
            AND start_time >= $3::date
            AND start_time < ($4::date + interval '1 day')
          GROUP BY DATE(start_time)
          ORDER BY work_date ASC`,
        [client.tenantId, member.id, bounds.periodStart, bounds.periodEnd]
      );
      trackedDaysCount = timeRows.length;
      for (const r of timeRows) {
        const sec = parseInt(r.day_seconds, 10) || 0;
        totalTrackedSeconds += sec;
        const hrs = sec / 3600;
        if (hrs >= 6) tierCounts.expected++;
        else if (hrs >= 4.5) tierCounts.moderate++;
        else if (hrs >= 3) tierCounts.low++;
        else tierCounts.minimal++;

        timeDetailRows.push({
          userName: member.name,
          date: r.work_date,
          weekday: dayjs(r.work_date).format('dddd'),
          formattedDuration: fmtHM(sec),
          ticketCount: parseInt(r.ticket_count, 10) || 0,
          status: hrs >= 6 ? 'Normal' : hrs >= 4.5 ? 'Moderate' : 'Low',
        });
      }
      avgSeconds = trackedDaysCount > 0 ? Math.round(totalTrackedSeconds / trackedDaysCount) : 0;
      const avgHours = avgSeconds / 3600;
      timeTrackingScore = trackedDaysCount > 0 ? timeTrackingPoints(avgHours) : null;
    } catch (err) {
      console.error(`[perf-auto-gen] failed to compute time tracking for ${member.id}:`, err);
    }
  }

  // 3. Attendance
  let attendanceScore: number | null = null;
  let presentDays = 0;
  let absentDays = 0;
  let totalAttMins = 0;
  const attendanceDetailRows: AttendanceRow[] = [];
  const attSetting = settingsByKey.get('attendance');
  if (attSetting?.isEnabled !== false) {
    try {
      const { rows: attRows } = await client.query(
        `SELECT id, date, clock_in, clock_out, status, effective_work_minutes, total_work_minutes, late_minutes
           FROM attendance
          WHERE tenant_id = $1
            AND user_id = $2
            AND date >= $3::date
            AND date <= $4::date
          ORDER BY date ASC`,
        [client.tenantId, member.id, bounds.periodStart, bounds.periodEnd]
      );
      for (const r of attRows) {
        if (r.status === 'absent') absentDays += 1;
        else presentDays += 1;

        const mins = r.effective_work_minutes ?? r.total_work_minutes ?? 0;
        if (r.status !== 'absent') totalAttMins += mins;

        attendanceDetailRows.push({
          id: r.id,
          userName: member.name,
          date: r.date,
          clockIn: r.clock_in,
          clockOut: r.clock_out,
          workMinutes: mins,
          lateMinutes: r.late_minutes ?? 0,
          status: r.status,
        });
      }
      const totalRecorded = presentDays + absentDays;
      if (totalRecorded > 0) {
        let sumPoints = 0;
        for (const r of attendanceDetailRows) {
          if (r.status === 'absent') continue;
          const hrs = (r.workMinutes ?? 0) / 60;
          sumPoints += Math.min(100, Math.round((hrs / 7) * 100));
        }
        attendanceScore = Math.round(sumPoints / totalRecorded);
      }
    } catch (err) {
      console.error(`[perf-auto-gen] failed to compute attendance for ${member.id}:`, err);
    }
  }

  // 4. Daily Updates
  let dailyUpdatesScore: number | null = null;
  let postedUpdates = 0;
  let expectedUpdates = 0;
  const dailyUpdateDetailRows: DailyUpdateRow[] = [];
  const duSetting = settingsByKey.get('daily_updates');
  if (duSetting?.isEnabled !== false) {
    try {
      const bodEnabled = (duSetting?.config as any)?.bod !== false;
      const eodEnabled = (duSetting?.config as any)?.eod !== false;
      const { rows: duRows } = await client.query(
        `SELECT id, "updateType" AS update_type, is_missed, created_at, total_hours_worked, mood
           FROM status_updates
          WHERE tenant_id = $1
            AND user_id = $2
            AND created_at >= $3::date
            AND created_at < ($4::date + interval '1 day')
          ORDER BY created_at DESC`,
        [client.tenantId, member.id, bounds.periodStart, bounds.periodEnd]
      );
      const validUpdates = duRows.filter((u: any) => {
        if (u.is_missed) return false;
        const t = u.update_type || 'EOD';
        if (t === 'BOD') return bodEnabled;
        if (t === 'EOD') return eodEnabled;
        return true;
      });
      postedUpdates = validUpdates.length;
      expectedUpdates = Math.max(postedUpdates, presentDays > 0 ? presentDays * ((bodEnabled ? 1 : 0) + (eodEnabled ? 1 : 0)) : 20);
      dailyUpdatesScore = expectedUpdates > 0 ? Math.min(100, Math.round((postedUpdates / expectedUpdates) * 100)) : null;

      for (const u of duRows) {
        dailyUpdateDetailRows.push({
          id: u.id,
          userName: member.name,
          updateType: u.update_type || 'EOD',
          createdAt: u.created_at,
          totalHoursWorked: u.total_hours_worked,
          mood: u.mood,
        });
      }
    } catch (err) {
      console.error(`[perf-auto-gen] failed to compute daily updates for ${member.id}:`, err);
    }
  }

  // 5. Leaves
  let leavesScore: number | null = null;
  let leaveDays = 0;
  let paidDays = 0;
  let lopDays = 0;
  const leaveDetailRows: LeaveRow[] = [];
  const leavesSetting = settingsByKey.get('leaves');
  if (leavesSetting?.isEnabled !== false) {
    try {
      const leaveRows = await findLeaveRequests(client, {
        from: bounds.periodStart,
        to: bounds.periodEnd,
        memberId: member.id,
      });
      for (const lv of leaveRows) {
        if (lv.status === 'approved') {
          leaveDays += lv.totalUnits || 0;
          paidDays += lv.paidUnits || 0;
          lopDays += lv.lopUnits || 0;
        }
        leaveDetailRows.push({
          id: lv.id,
          userName: member.name,
          leaveTypeName: lv.leaveTypeName,
          fromDate: lv.fromDate,
          toDate: lv.toDate,
          totalUnits: lv.totalUnits || 0,
          lopUnits: lv.lopUnits || 0,
          status: lv.status,
        });
      }
      leavesScore = Math.max(40, 100 - lopDays * 15);
    } catch (err) {
      console.error(`[perf-auto-gen] failed to compute leaves for ${member.id}:`, err);
    }
  }

  // Weighted overall calculation
  const stageDefinitions = [
    { key: 'tickets', label: 'Tickets', score: ticketsScore, setting: ticketsSetting },
    { key: 'time_tracking', label: 'Time Tracking', score: timeTrackingScore, setting: timeSetting },
    { key: 'daily_updates', label: 'Daily Updates', score: dailyUpdatesScore, setting: duSetting },
    { key: 'attendance', label: 'Attendance', score: attendanceScore, setting: attSetting },
    { key: 'leaves', label: 'Leaves', score: leavesScore, setting: leavesSetting },
  ];

  let weightedSum = 0;
  let totalActiveWeight = 0;
  const stages = stageDefinitions.map((s) => {
    const isEnabled = s.setting?.isEnabled !== false;
    const weight = s.setting?.weight != null ? parseFloat(String(s.setting.weight)) : 20;
    if (isEnabled && s.score !== null) {
      weightedSum += s.score * (weight / 100);
      totalActiveWeight += weight;
    }
    return {
      key: s.key,
      label: s.label,
      score: s.score,
      weight,
      enabled: isEnabled,
    };
  });

  const overallScore = totalActiveWeight > 0 ? Math.round(weightedSum / (totalActiveWeight / 100)) : null;

  const summaryTiers: Array<{ label: string; days: number }> = [
    { label: 'Expected Hours (6h+)', days: tierCounts.expected },
    { label: 'Moderate Activity (4.5h – 6h)', days: tierCounts.moderate },
    { label: 'Low Activity (3h – 4.5h)', days: tierCounts.low },
    { label: 'Minimal Activity (< 3h)', days: tierCounts.minimal },
  ].filter((t) => t.days > 0);

  const reportModel: FullReportModel = {
    member: {
      id: member.id,
      name: member.name,
      workEmail: member.workEmail,
      position: member.position,
      department: member.department,
    },
    range: {
      from: bounds.periodStart,
      to: bounds.periodEnd,
      monthLabel: bounds.periodLabel,
      rangeLabel: bounds.rangeLabel,
    },
    overall: overallScore,
    stages,
    tickets: {
      score: ticketsScore,
      rows: ticketRows,
    },
    timeTracking: {
      score: timeTrackingScore,
      avgSeconds,
      trackedDays: trackedDaysCount,
      summaryTiers,
      detailed: timeDetailRows,
    },
    dailyUpdates: {
      score: dailyUpdatesScore,
      expected: expectedUpdates,
      posted: postedUpdates,
      missed: Math.max(0, expectedUpdates - postedUpdates),
      rows: dailyUpdateDetailRows,
    },
    attendance: {
      score: attendanceScore,
      expected: presentDays + absentDays,
      present: presentDays,
      absent: absentDays,
      avgMins: presentDays > 0 ? Math.round(totalAttMins / presentDays) : 0,
      rows: attendanceDetailRows,
    },
    leaves: {
      score: leavesScore,
      leaveDays,
      paidDays,
      lopDays,
      rows: leaveDetailRows,
    },
  };

  return {
    scores: {
      overall: overallScore,
      tickets: ticketsScore,
      timeTracking: timeTrackingScore,
      dailyUpdates: dailyUpdatesScore,
      attendance: attendanceScore,
      leaves: leavesScore,
    },
    summary: { stages },
    reportModel,
  };
}

async function renderHtmlToPdfBuffer(browser: Browser, html: string): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluateHandle('document.fonts.ready').catch(() => {});
    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '8mm', right: '6mm', bottom: '8mm', left: '6mm' },
    });
    return Buffer.from(pdfBytes);
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Executes an auto-generation sweep across tenants.
 * If targetPeriodDate is given, generates for that month; otherwise defaults to current month.
 */
export async function runAutoGenerateSweep(opts?: {
  targetPeriodDate?: Date;
  forceTenantId?: string;
}): Promise<SweepResult> {
  const targetDate = opts?.targetPeriodDate || new Date();
  const bounds = getPeriodBounds(targetDate);
  const isMonthEnd = isLastDayOfMonth(targetDate);

  const result: SweepResult = {
    scannedTenants: 0,
    generatedCount: 0,
    failedCount: 0,
    errors: [],
  };

  let tenantQuery = `SELECT tenant_id, auto_generate_enabled, generation_day, generation_time FROM prr_settings`;
  const params: any[] = [];
  if (opts?.forceTenantId) {
    tenantQuery += ` WHERE tenant_id = $1`;
    params.push(opts.forceTenantId);
  } else {
    tenantQuery += ` WHERE auto_generate_enabled = true`;
  }

  const { rows: settingsRows } = await perfReportPool.query(tenantQuery, params);
  result.scannedTenants = settingsRows.length;

  if (settingsRows.length === 0) {
    return result;
  }

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (err: any) {
    console.error('[perf-auto-gen] could not launch Puppeteer browser:', err.message);
  }

  try {
    for (const st of settingsRows) {
      const tenantId = st.tenant_id;

      if (!opts?.forceTenantId && st.generation_day === 'last_day' && !isMonthEnd) {
        continue;
      }

      let moduleSettings: any;
      let memberRows: any[] = [];
      let existingUserIds = new Set<string>();

      try {
        await withTenant(tenantId, async (client) => {
          moduleSettings = await settingsRepo.findModules(client);

          const { rows: members } = await client.query(
            `SELECT
                u.id,
                u.name,
                u.work_email AS "workEmail",
                p.title AS "position",
                d.name AS "department"
               FROM users u
               LEFT JOIN positions p ON p.id = u.position_id
               LEFT JOIN departments d ON d.id = p.department_id
              WHERE u.tenant_id = $1
                AND u.is_active = true
              ORDER BY u.name ASC`,
            [tenantId]
          );
          memberRows = members;

          const { rows: existingRows } = await client.query(
            `SELECT user_id FROM prr_generated_reports WHERE tenant_id = $1 AND period_key = $2`,
            [tenantId, bounds.periodKey]
          );
          existingUserIds = new Set(existingRows.map((r: any) => r.user_id));
        });
      } catch (tenantErr: any) {
        result.errors.push({
          tenantId,
          error: tenantErr?.message || String(tenantErr),
        });
        console.error(`[perf-auto-gen] error processing tenant ${tenantId}:`, tenantErr);
        continue;
      }

      console.log(
        `[perf-auto-gen] [tenant:${tenantId}] Total active members: ${memberRows.length}, already generated: ${existingUserIds.size}`
      );

      for (const member of memberRows) {
        if (existingUserIds.has(member.id)) {
          continue;
        }

        const t0 = Date.now();
        console.log(`[perf-auto-gen] [tenant:${tenantId}] Generating report for member: ${member.name} (${member.id})`);

        try {
          // 1. Fetch and compute report data
          const data = await withTenant(tenantId, async (client) => {
            return computeMemberReportData(client, member, bounds, moduleSettings);
          });

          // 2. Render PDF buffer via Puppeteer outside of DB transaction
          let pdfBase64 = '';
          if (browser) {
            const html = buildPerformanceReportHtml(data.reportModel);
            const pdfBuffer = await renderHtmlToPdfBuffer(browser, html);
            pdfBase64 = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
          } else {
            pdfBase64 = `data:text/html;base64,${Buffer.from(buildPerformanceReportHtml(data.reportModel)).toString('base64')}`;
          }

          // 3. Upload to Cloudflare R2 / S3
          const { url, key } = await uploadGeneratedReportToR2(
            pdfBase64,
            tenantId,
            member.id,
            bounds.periodKey
          );

          // 4. Save generated report in an isolated transaction
          await withTenant(tenantId, async (client) => {
            await generatedRepo.upsert(client, {
              userId: member.id,
              periodKey: bounds.periodKey,
              periodStart: bounds.periodStart,
              periodEnd: bounds.periodEnd,
              overall: data.scores.overall,
              tickets: data.scores.tickets,
              timeTracking: data.scores.timeTracking,
              dailyUpdates: data.scores.dailyUpdates,
              attendance: data.scores.attendance,
              leaves: data.scores.leaves,
              summary: data.summary,
              fileUrl: url,
              fileKey: key,
              generatedBy: 'system_auto_generate',
            });
          });

          result.generatedCount += 1;
          console.log(
            `[perf-auto-gen] [tenant:${tenantId}] Successfully created report for ${member.name} in ${Date.now() - t0}ms`
          );
        } catch (memberErr: any) {
          result.failedCount += 1;
          result.errors.push({
            tenantId,
            userId: member.id,
            error: memberErr?.message || String(memberErr),
          });
          console.error(`[perf-auto-gen] error generating report for user ${member.id}:`, memberErr);
        }
      }
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return result;
}
