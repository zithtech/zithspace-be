import { rabbitMQService } from '@/utils/RabbitMQService';
import { CALENDAR_SYNC_EXCHANGE, CALENDAR_SYNC_ROUTING_KEY } from '@/config/rabbitmq';
import { syncLogger } from '@/utils/logger';

export interface SyncJobPayload {
    integrationId: string;
    userId: string;
    tenantId: string;
    provider: string;
    forceSync?: boolean;
}

export class CalendarSyncProducer {
    static async enqueueSync(payload: SyncJobPayload) {
        try {
            const channel = await rabbitMQService.getChannel();
            const message = JSON.stringify({
                ...payload,
                timestamp: new Date().toISOString()
            });

            const success = channel.publish(
                CALENDAR_SYNC_EXCHANGE,
                CALENDAR_SYNC_ROUTING_KEY,
                Buffer.from(message),
                { 
                    persistent: true,
                    headers: { 'x-tenant-id': payload.tenantId }
                }
            );

            if (success) {
                syncLogger.info('Sync job enqueued to RabbitMQ', { 
                    integrationId: payload.integrationId, 
                    tenantId: payload.tenantId 
                });
            } else {
                syncLogger.warn('RabbitMQ publish buffer full, job may be delayed');
            }
        } catch (error: any) {
            syncLogger.error('Failed to enqueue sync to RabbitMQ', { 
                integrationId: payload.integrationId, 
                error: error.message 
            });
            // FALLBACK: Could logically fallback to synchronous sync or another queue if needed.
            throw error;
        }
    }
}
