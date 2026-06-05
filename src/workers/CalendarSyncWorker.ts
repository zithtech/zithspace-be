import { rabbitMQService } from '@/utils/RabbitMQService';
import { 
    CALENDAR_SYNC_QUEUE, 
    CALENDAR_SYNC_EXCHANGE,
    CALENDAR_SYNC_RETRY_EXCHANGE,
    CALENDAR_SYNC_RETRY_RK_1M,
    CALENDAR_SYNC_RETRY_RK_5M,
    CALENDAR_SYNC_RETRY_RK_15M 
} from '@/config/rabbitmq';
import { CalendarService } from '@/services/calendar/CalendarService';
import { syncLogger } from '@/utils/logger';
import { SyncJobPayload } from '@/services/calendar/CalendarSyncProducer';

export class CalendarSyncWorker {
    private static readonly MAX_RETRIES = 3;

    static async start() {
        try {
            const channel = await rabbitMQService.getChannel();

            // Set prefetch to 10 for production-grade rate limiting and SaaS predictability
            await channel.prefetch(10);

            syncLogger.info('Calendar Sync Worker (PRO) started', { queue: CALENDAR_SYNC_QUEUE });

            await channel.consume(CALENDAR_SYNC_QUEUE, async (msg) => {
                if (!msg) return;

                const payload: SyncJobPayload = JSON.parse(msg.content.toString());
                const { integrationId, tenantId, userId, provider } = payload;
                
                // Track retry count from headers
                const headers = msg.properties.headers || {};
                const retryCount = (headers['x-retry-count'] || 0) as number;

                syncLogger.info(`Processing sync job (Attempt ${retryCount + 1})`, { 
                    integrationId, 
                    tenantId, 
                    provider 
                });

                try {
                    await CalendarService.processIncrementalSync(integrationId);
                    
                    syncLogger.info('Sync job completed successfully', { integrationId, tenantId });
                    channel.ack(msg);
                } catch (error: any) {
                    const isFatal = this.isErrorFatal(error);
                    
                    if (isFatal) {
                        syncLogger.error('FATAL sync error (No Retry)', { 
                            integrationId, 
                            tenantId, 
                            error: error.message 
                        });
                        // Move to DLQ immediately (nack with requeue=false)
                        channel.nack(msg, false, false);
                    } else if (retryCount < this.MAX_RETRIES) {
                        // TRANSIENT error - Route to exponential backoff
                        const nextRetryCount = retryCount + 1;
                        const retryRK = this.getRetryRoutingKey(nextRetryCount);
                        
                        syncLogger.warn(`TRANSIENT sync error. Retrying in background... (Next attempt: ${nextRetryCount + 1})`, { 
                            integrationId, 
                            error: error.message,
                            delayKey: retryRK
                        });

                        // Publish to the retry exchange with incremented count
                        channel.publish(
                            CALENDAR_SYNC_RETRY_EXCHANGE,
                            retryRK,
                            msg.content,
                            {
                                ...msg.properties,
                                headers: { ...headers, 'x-retry-count': nextRetryCount }
                            }
                        );

                        // Acknowledge the current message so it's removed from main queue (it's now in the retry queue)
                        channel.ack(msg);
                    } else {
                        syncLogger.error('Max retries reached. Moving to DLQ.', { 
                            integrationId, 
                            tenantId,
                            retries: retryCount
                        });
                        channel.nack(msg, false, false);
                    }
                }
            }, {
                noAck: false
            });

        } catch (error: any) {
            syncLogger.error('Failed to start Calendar Sync Worker', { error: error.message });
            setTimeout(() => this.start(), 10000);
        }
    }

    private static isErrorFatal(error: any): boolean {
        const msg = error.message?.toLowerCase() || '';
        const status = error.response?.status || error.status;

        // AUTH or NOT FOUND errors are fatal
        if (status === 401 || status === 403 || status === 404) return true;
        if (msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('not found')) return true;
        if (msg.includes('invalid_grant')) return true; // Common OAuth refresh failure

        return false;
    }

    private static getRetryRoutingKey(count: number): string {
        if (count === 1) return CALENDAR_SYNC_RETRY_RK_1M;
        if (count === 2) return CALENDAR_SYNC_RETRY_RK_5M;
        return CALENDAR_SYNC_RETRY_RK_15M;
    }
}
