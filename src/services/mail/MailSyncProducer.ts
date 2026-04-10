import { rabbitMQService } from '@/utils/RabbitMQService';
import { MAIL_SYNC_EXCHANGE, MAIL_SYNC_ROUTING_KEY } from '@/config/rabbitmq';
import { syncLogger } from '@/utils/logger';

export interface MailSyncJobPayload {
    userId: string;
    tenantId: string;
    email: string;
}

export class MailSyncProducer {
    static async enqueueSync(payload: MailSyncJobPayload) {
        try {
            const channel = await rabbitMQService.getChannel();
            const message = JSON.stringify({
                ...payload,
                timestamp: new Date().toISOString()
            });

            const success = channel.publish(
                MAIL_SYNC_EXCHANGE,
                MAIL_SYNC_ROUTING_KEY,
                Buffer.from(message),
                { 
                    persistent: true,
                    headers: { 'x-tenant-id': payload.tenantId }
                }
            );

            if (success) {
                syncLogger.info('Mail sync job enqueued to RabbitMQ', { 
                    email: payload.email, 
                    tenantId: payload.tenantId 
                });
            } else {
                syncLogger.warn('RabbitMQ publish buffer full for mail sync, job may be delayed');
            }
        } catch (error: any) {
            syncLogger.error('Failed to enqueue mail sync to RabbitMQ', { 
                email: payload.email, 
                error: error.message 
            });
            throw error;
        }
    }
}
