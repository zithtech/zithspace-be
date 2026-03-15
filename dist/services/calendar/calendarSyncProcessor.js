"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSyncProcessor = startSyncProcessor;
exports.stopSyncProcessor = stopSyncProcessor;
const bullmq_1 = require("bullmq");
const CalendarService_1 = require("./CalendarService");
const logger_1 = require("@/utils/logger");
const QUEUE_NAME = 'calendar-sync';
let worker = null;
function startSyncProcessor() {
    if (worker)
        return; // Already started
    worker = new bullmq_1.Worker(QUEUE_NAME, async (job) => {
        const { integrationId } = job.data;
        logger_1.syncLogger.info('Processing sync job', { integrationId, jobId: job.id });
        await CalendarService_1.CalendarService.processIncrementalSync(integrationId);
        logger_1.syncLogger.info('Sync job completed', { integrationId, jobId: job.id });
    }, {
        connection: {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
        },
        concurrency: 5, // Up to 5 parallel sync jobs
    });
    worker.on('failed', (job, err) => {
        logger_1.syncLogger.error('Sync job failed', {
            integrationId: job?.data?.integrationId,
            jobId: job?.id,
            attempt: job?.attemptsMade,
            error: err.message,
        });
    });
    worker.on('error', (err) => {
        logger_1.syncLogger.error('BullMQ worker error', { error: err.message });
    });
    logger_1.syncLogger.info('Calendar sync processor started');
}
async function stopSyncProcessor() {
    if (worker) {
        await worker.close();
        worker = null;
        logger_1.syncLogger.info('Calendar sync processor stopped');
    }
}
//# sourceMappingURL=calendarSyncProcessor.js.map