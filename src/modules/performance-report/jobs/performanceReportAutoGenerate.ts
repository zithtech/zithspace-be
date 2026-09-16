// src/modules/performance-report/jobs/performanceReportAutoGenerate.ts
//
// Background cron job for automated monthly performance report generation.
// Scans tenants with `auto_generate_enabled = true` and generates reports for active members.

import cron from 'node-cron';
import { runAutoGenerateSweep } from '../services/autoGenerate.service';

const SCHEDULE = process.env.PERF_REPORT_AUTO_GENERATE_CRON || '0 * * * *'; // Top of every hour

let task: { stop: () => void } | null = null;
let running = false;

export async function runPerformanceReportAutoGenerateSweep(): Promise<void> {
  if (running) {
    console.log('[perf-report-auto-gen] previous sweep still running — skipping this tick');
    return;
  }
  running = true;
  const startedAt = Date.now();
  try {
    const result = await runAutoGenerateSweep();
    if (result.generatedCount > 0 || result.failedCount > 0) {
      console.log(
        `[perf-report-auto-gen] scanned ${result.scannedTenants} tenants, generated ${result.generatedCount} reports, ` +
          `failed ${result.failedCount} in ${Date.now() - startedAt}ms`
      );
    }
  } catch (err: any) {
    console.error('[perf-report-auto-gen] sweep failed:', err?.message ?? err);
  } finally {
    running = false;
  }
}

export function startPerformanceReportAutoGenerateJob(): void {
  if (process.env.PERF_REPORT_AUTO_GENERATE_ENABLED === 'false') {
    console.log('[perf-report-auto-gen] disabled (PERF_REPORT_AUTO_GENERATE_ENABLED=false)');
    return;
  }
  if (task) return;

  if (!cron.validate(SCHEDULE)) {
    console.error(`[perf-report-auto-gen] invalid cron expression "${SCHEDULE}" — job not started`);
    return;
  }

  task = cron.schedule(SCHEDULE, () => {
    void runPerformanceReportAutoGenerateSweep();
  });
  console.log(`[perf-report-auto-gen] scheduled (${SCHEDULE})`);
}

export function stopPerformanceReportAutoGenerateJob(): void {
  task?.stop();
  task = null;
}
