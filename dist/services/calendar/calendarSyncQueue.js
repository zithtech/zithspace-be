"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calendarSyncQueue = void 0;
exports.enqueueSync = enqueueSync;
const bullmq_1 = require("bullmq");
const logger_1 = require("@/utils/logger");
const QUEUE_NAME = 'calendar-sync';
exports.calendarSyncQueue = new bullmq_1.Queue(QUEUE_NAME, {
    connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
    },
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 60000, // Start at 1 minute, doubles each retry
        },
        removeOnComplete: { age: 3600, count: 100 }, // Keep completed jobs for 1h
        removeOnFail: { age: 86400, count: 500 }, // Keep failed jobs for 24h
    },
});
/**
 * Enqueue an incremental sync for one integration.
 * Uses integrationId as jobId to prevent duplicate jobs in the queue.
 */
async function enqueueSync(integrationId) {
    try {
        await exports.calendarSyncQueue.add('incremental-sync', { integrationId }, {
            jobId: integrationId, // Deduplication: only one job per integration at a time
        });
        logger_1.syncLogger.info('Sync enqueued', { integrationId });
    }
    catch (err) {
        logger_1.syncLogger.error('Failed to enqueue sync', { integrationId, error: err.message });
    }
}
//# sourceMappingURL=calendarSyncQueue.js.map