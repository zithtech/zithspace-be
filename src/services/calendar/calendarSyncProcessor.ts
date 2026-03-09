import { Worker, Job } from 'bullmq';
import { CalendarService } from './CalendarService';
import { syncLogger } from '@/utils/logger';

const QUEUE_NAME = 'calendar-sync';

let worker: Worker | null = null;

export function startSyncProcessor() {
    if (worker) return; // Already started

    worker = new Worker(
        QUEUE_NAME,
        async (job: Job) => {
            const { integrationId } = job.data;
            syncLogger.info('Processing sync job', { integrationId, jobId: job.id });

            await CalendarService.processIncrementalSync(integrationId);

            syncLogger.info('Sync job completed', { integrationId, jobId: job.id });
        },
        {
            connection: {
                host: process.env.REDIS_HOST || '127.0.0.1',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD || undefined,
            },
            concurrency: 5,  // Up to 5 parallel sync jobs
        }
    );

    worker.on('failed', (job, err) => {
        syncLogger.error('Sync job failed', {
            integrationId: job?.data?.integrationId,
            jobId: job?.id,
            attempt: job?.attemptsMade,
            error: err.message,
        });
    });

    worker.on('error', (err) => {
        syncLogger.error('BullMQ worker error', { error: err.message });
    });

    syncLogger.info('Calendar sync processor started');
}

export async function stopSyncProcessor() {
    if (worker) {
        await worker.close();
        worker = null;
        syncLogger.info('Calendar sync processor stopped');
    }
}
