import { Queue } from 'bullmq';
import { syncLogger } from '@/utils/logger';

const QUEUE_NAME = 'calendar-sync';

export const calendarSyncQueue = new Queue(QUEUE_NAME, {
    connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
    },
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 60_000, // Start at 1 minute, doubles each retry
        },
        removeOnComplete: { age: 3600, count: 100 },  // Keep completed jobs for 1h
        removeOnFail: { age: 86400, count: 500 },  // Keep failed jobs for 24h
    },
});

/**
 * Enqueue an incremental sync for one integration.
 * Uses integrationId as jobId to prevent duplicate jobs in the queue.
 */
export async function enqueueSync(integrationId: string): Promise<void> {
    try {
        await calendarSyncQueue.add(
            'incremental-sync',
            { integrationId },
            {
                jobId: integrationId, // Deduplication: only one job per integration at a time
            }
        );
        syncLogger.info('Sync enqueued', { integrationId });
    } catch (err: any) {
        syncLogger.error('Failed to enqueue sync', { integrationId, error: err.message });
    }
}
