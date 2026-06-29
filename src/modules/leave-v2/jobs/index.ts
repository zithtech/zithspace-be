// src/modules/leave-v2/jobs/index.ts
//
// One-call bootstrap for the leave accrual background system. Enable by setting
// LEAVE_ACCRUAL_ENABLED=true (requires Redis). Manual accrual via the
// POST /api/v2/leave/accrual/run endpoint works regardless of this.

import { initAccrualScheduler } from './accrualQueue';
import { startAccrualWorker } from './accrualWorker';

export async function initLeaveAccrual(): Promise<void> {
  if (process.env.LEAVE_ACCRUAL_ENABLED !== 'true') {
    console.log('[leave-accrual] disabled (set LEAVE_ACCRUAL_ENABLED=true to enable)');
    return;
  }
  try {
    startAccrualWorker();
    await initAccrualScheduler();
    console.log('[leave-accrual] scheduler + worker started');
  } catch (err: any) {
    console.error('[leave-accrual] failed to start:', err?.message);
  }
}

export { runAccrualForTenant } from '../services/accrual.service';
