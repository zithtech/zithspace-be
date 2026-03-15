import nodeCron from "node-cron";
import { prisma } from "@/config/database";
import { enqueueSync } from "./calendarSyncQueue";
import { syncLogger } from "@/utils/logger";

export class SyncWorker {
    private static isRunning = false;

    static start() {
        nodeCron.schedule("*/5 * * * *", () => {
            // this.pollAndEnqueue().catch(err => {
            //     syncLogger.error('Critical error during polling', { error: err.message });
            // });
            console.log("Bellooo")
        });
        syncLogger.info('Calendar sync scheduler started');
    }

    private static async pollAndEnqueue() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            const now = new Date();

            const integrationsToSync = await prisma.calendarIntegration.findMany({
                where: {
                    nextSyncDueAt: { lte: now },
                    isSyncing: false,
                    syncErrorCount: { lt: 10 },
                } as any,
                take: 20,
                select: { id: true, userId: true, provider: true }
            });

            if (integrationsToSync.length > 0) {
                syncLogger.info(`Found ${integrationsToSync.length} integrations to enqueue`);

                await Promise.allSettled(
                    integrationsToSync.map(async (integration) => {
                        await enqueueSync(integration.id);
                    })
                );
            }
        } finally {
            this.isRunning = false;
        }
    }
}
