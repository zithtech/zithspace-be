"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncWorker = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const database_1 = require("@/config/database");
const calendarSyncQueue_1 = require("./calendarSyncQueue");
const logger_1 = require("@/utils/logger");
class SyncWorker {
    /**
     * Start the sync scheduler. Polls every 5 minutes for integrations due for sync
     * and enqueues them into the BullMQ queue instead of calling directly.
     */
    static start() {
        node_cron_1.default.schedule("*/5 * * * *", () => {
            // this.pollAndEnqueue().catch(err => {
            //     syncLogger.error('Critical error during polling', { error: err.message });
            // });
            console.log("Bellooo");
        });
        logger_1.syncLogger.info('Calendar sync scheduler started');
    }
    static async pollAndEnqueue() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        try {
            const now = new Date();
            const integrationsToSync = await database_1.prisma.calendarIntegration.findMany({
                where: {
                    nextSyncDueAt: { lte: now },
                    isSyncing: false,
                    syncErrorCount: { lt: 10 },
                },
                take: 20,
                select: { id: true, userId: true, provider: true }
            });
            if (integrationsToSync.length > 0) {
                logger_1.syncLogger.info(`Found ${integrationsToSync.length} integrations to enqueue`);
                await Promise.allSettled(integrationsToSync.map(async (integration) => {
                    await (0, calendarSyncQueue_1.enqueueSync)(integration.id);
                }));
            }
        }
        finally {
            this.isRunning = false;
        }
    }
}
exports.SyncWorker = SyncWorker;
SyncWorker.isRunning = false;
//# sourceMappingURL=SyncWorker.js.map