import cron from 'node-cron';
import { prisma } from '../config/database';
import { socketService } from '../services/socketService';

/**
 * Timer Auto-Pause Job
 * 
 * Automatically pauses any running timers that have exceeded 6 hours of continuous runtime.
 * Runs every 30 minutes to check for long-running timers.
 */

async function runTimerAutoPauseJob() {
  const now = new Date();
  const SIX_HOURS_IN_SECONDS = 6 * 60 * 60; // 6 hours threshold

  console.log(`[Timer Auto-Pause] Job triggered at ${now.toLocaleString()}`);

  try {
    const runningEntries = await prisma.timeTrackingEntry.findMany({
      where: { status: 'RUNNING' },
      include: {
        logs: { orderBy: { createdAt: 'desc' }, take: 1 },
        user: { select: { name: true } }
      }
    });

    console.log(`[Timer Auto-Pause] Checking ${runningEntries.length} active timers...`);

    let pausedCount = 0;

    for (const entry of runningEntries) {
      const lastLog = entry.logs[0];
      const lastActiveTime = lastLog ? lastLog.createdAt : entry.startTime;
      
      const currentSessionDuration = Math.floor((now.getTime() - lastActiveTime.getTime()) / 1000);
      const totalDuration = (entry.duration || 0) + currentSessionDuration;

      if (totalDuration > SIX_HOURS_IN_SECONDS) {
        console.log(`[Timer Auto-Pause] !!! THRESHOLD EXCEEDED (${totalDuration}s > ${SIX_HOURS_IN_SECONDS}s). Pausing entry ${entry.id.slice(0, 8)} for ${entry.user?.name}...`);
        
        const updatedEntry = await prisma.timeTrackingEntry.update({
          where: { id: entry.id },
          data: {
            status: 'PAUSED',
            duration: totalDuration,
            logs: {
              create: {
                action: 'PAUSED',
                tenantId: entry.tenantId,
                createdAt: now
              }
            }
          }
        });

        // Emit socket event for real-time UI update
        socketService.emitToTenant(entry.tenantId, 'TIMER_AUTO_PAUSED', {
          userId: entry.userId,
          entryId: entry.id,
          entry: updatedEntry
        });

        pausedCount++;
      }
    }

    if (pausedCount > 0) {
      console.log(`[Timer Auto-Pause] Successfully paused ${pausedCount} timers.`);
    }
  } catch (error) {
    console.error('[Timer Auto-Pause] CRITICAL ERROR:', error);
  }
}

/**
 * Start the cron job
 */
export function startTimerAutoPauseJob(): void {
  console.log('[Timer Auto-Pause] Service started. Frequency: Every 30 minutes');

  // Schedule to run every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      await runTimerAutoPauseJob();
    } catch (error) {
      console.error('[Timer Auto-Pause] Unhandled error in cron job:', error);
    }
  });

  console.log('[Timer Auto-Pause] Cron job scheduled successfully');
}
