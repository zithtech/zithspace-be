// src/modules/opening-management/jobs/postingAutoMove.ts
//
// Phase 4 automation: move openings off the internal job board once their
// window has elapsed.
//
//   internal posting (N days) ──▶ [this job] ──▶ external posting
//
// Plain node-cron, matching the platform's other schedulers (trashAutoPurge,
// timerAutoPause, mailScheduledSend). No Redis: the sweep is a short indexed
// scan, so a queue would be more moving parts than the work justifies.
//
// Hourly rather than daily so a window that closes at 09:00 does not sit until
// 02:00 the next morning. The sweep is idempotent, so a missed tick costs
// nothing but a little latency.
//
// Disable globally with OPENING_AUTO_MOVE_ENABLED=false. Per tenant, turn off
// `autoMoveToExternal` in posting settings; per opening, pass
// `autoMove: false` when posting internally.

import cron from 'node-cron';
import { runAutoMoveSweep } from '../services/posting.service';

const SCHEDULE = process.env.OPENING_AUTO_MOVE_CRON || '0 * * * *'; // top of every hour

// node-cron's ScheduledTask type is not exported as a namespace here, so the
// handle is kept loosely typed — it is only ever start/stopped.
let task: { stop: () => void } | null = null;
/** Guards against a slow sweep overlapping the next tick. */
let running = false;

export async function runOnce(): Promise<void> {
  if (running) {
    console.log('[opening-auto-move] previous sweep still running — skipping this tick');
    return;
  }
  running = true;
  const startedAt = Date.now();
  try {
    const result = await runAutoMoveSweep();
    if (result.scanned > 0 || result.failed.length > 0) {
      console.log(
        `[opening-auto-move] scanned ${result.scanned}, moved ${result.moved}, ` +
          `failed ${result.failed.length} in ${Date.now() - startedAt}ms`
      );
      for (const f of result.failed) {
        console.error(`[opening-auto-move] opening ${f.openingId}: ${f.error}`);
      }
    }
  } catch (err: any) {
    // Never let a sweep failure take the process down — the next tick retries.
    console.error('[opening-auto-move] sweep failed:', err?.message ?? err);
  } finally {
    running = false;
  }
}

export function startPostingAutoMoveJob(): void {
  if (process.env.OPENING_AUTO_MOVE_ENABLED === 'false') {
    console.log('[opening-auto-move] disabled (OPENING_AUTO_MOVE_ENABLED=false)');
    return;
  }
  if (task) return;

  if (!cron.validate(SCHEDULE)) {
    console.error(`[opening-auto-move] invalid cron expression "${SCHEDULE}" — job not started`);
    return;
  }

  task = cron.schedule(SCHEDULE, () => {
    void runOnce();
  });
  console.log(`[opening-auto-move] scheduled (${SCHEDULE})`);
}

export function stopPostingAutoMoveJob(): void {
  task?.stop();
  task = null;
}
