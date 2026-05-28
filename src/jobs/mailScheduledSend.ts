import cron from 'node-cron';
import { MailService } from '../services/mail/MailService';
import { syncLogger } from '../utils/logger';

/**
 * Start the scheduled email sender cron job
 */
export function startMailScheduledSendJob() {
  console.log('[Mail-Scheduled-Send] Initializing cron job...');

  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      syncLogger.debug('[Mail-Scheduled-Send] Checking for scheduled emails...');
      await MailService.processScheduledEmails();
    } catch (error) {
      console.error('[Mail-Scheduled-Send] Unhandled error in cron job:', error);
      syncLogger.error('[Mail-Scheduled-Send] Unhandled error in cron job', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  console.log('[Mail-Scheduled-Send] Cron job scheduled to run every minute');
}
