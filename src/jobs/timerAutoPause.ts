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
        logs: { orderBy: { createdAt: 'desc' } },
        user: { select: { name: true } }
      }
    });

    console.log(`[Timer Auto-Pause] Checking ${runningEntries.length} active timers...`);

    let pausedCount = 0;

    for (const entry of runningEntries) {
      // Find the latest log that started or resumed the timer to measure continuous runtime
      const lastStartLog = entry.logs.find(log => log.action === 'STARTED' || log.action === 'RESUMED');
      const lastActiveTime = lastStartLog ? lastStartLog.createdAt : entry.startTime;
      
      const currentSessionDuration = Math.floor((now.getTime() - lastActiveTime.getTime()) / 1000);

      if (currentSessionDuration > SIX_HOURS_IN_SECONDS) {
        console.log(`[Timer Auto-Pause] !!! THRESHOLD EXCEEDED (${currentSessionDuration}s > ${SIX_HOURS_IN_SECONDS}s). Pausing entry ${entry.id.slice(0, 8)} for ${entry.user?.name}...`);

        const totalDuration = (entry.duration || 0) + currentSessionDuration;

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
          },
          include: {
            project: { select: { id: true, name: true, code: true } },
            ticket: { select: { id: true, title: true, ticketNumber: true, estimateHours: true } },
            user: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
            logs: { orderBy: { createdAt: 'desc' } }
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
  console.log('[Timer Auto-Pause] Service started. Frequency: Every 7 minutes');

  // Schedule to run every 7 minutes
  cron.schedule('*/7 * * * *', async () => {
    try {
      await runTimerAutoPauseJob();
    } catch (error) {
      console.error('[Timer Auto-Pause] Unhandled error in cron job:', error);
    }
  });

  console.log('[Timer Auto-Pause] Cron job scheduled successfully');
}
