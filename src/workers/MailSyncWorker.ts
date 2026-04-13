import { rabbitMQService } from '../utils/RabbitMQService';
import { 
    MAIL_SYNC_QUEUE, 
    MAIL_SYNC_EXCHANGE,
    MAIL_SYNC_RETRY_EXCHANGE,
    MAIL_SYNC_RETRY_RK_1M,
    MAIL_SYNC_RETRY_RK_5M,
    MAIL_SYNC_RETRY_RK_15M 
} from '../config/rabbitmq';
import { MailService } from '../services/mail/MailService';
import { syncLogger } from '../utils/logger';
import { redisService } from '../utils/redis';

export interface MailSyncPayload {
    userId: string;
    tenantId: string;
    email: string;
}

export class MailSyncWorker {
    private static readonly MAX_RETRIES = 3;

    static async start() {
        try {
            const channel = await rabbitMQService.getChannel();

            // Set prefetch to 1 for production-grade rate limiting and SaaS predictability
            await channel.prefetch(1);

            syncLogger.info('Mail Sync Worker started', { queue: MAIL_SYNC_QUEUE });

            await channel.consume(MAIL_SYNC_QUEUE, async (msg) => {
                if (!msg) return;

                const payload: MailSyncPayload = JSON.parse(msg.content.toString());
                const { userId, tenantId, email } = payload;
                
                // Track retry count from headers
                const headers = msg.properties.headers || {};
                const retryCount = (headers['x-retry-count'] || 0) as number;

                syncLogger.info(`Processing mail sync job (Attempt ${retryCount + 1})`, { 
                    email, 
                    tenantId, 
                    userId 
                });

                // Acquire Redis Lock to prevent concurrent syncs for the same account
                const lockKey = `mail:sync:${tenantId}:${email}`;
                const lockAcquired = await redisService.acquireLock(lockKey, 600); // 10 minute timeout

                if (!lockAcquired) {
                    syncLogger.warn(`Sync already in progress for ${email}. Delaying retry by 1m (Attempt ${retryCount + 1})...`);
                    
                    // Route to 1m delay queue instead of immediate requeue
                    channel.publish(
                        MAIL_SYNC_RETRY_EXCHANGE,
                        MAIL_SYNC_RETRY_RK_1M,
                        msg.content,
                        {
                            ...msg.properties,
                            headers: headers // Preserve current retry count
                        }
                    );

                    channel.ack(msg);
                    return;
                }

                try {
                    // Perform the actual sync
                    await MailService.syncMail(userId, tenantId, email);
                    
                    syncLogger.info('Mail sync completed successfully', { email, tenantId });
                    channel.ack(msg);
                } catch (error: any) {
                    const isFatal = this.isErrorFatal(error);
                    
                    if (isFatal) {
                        syncLogger.error('FATAL mail sync error (No Retry)', { 
                            email, 
                            tenantId, 
                            error: error.message 
                        });
                        // Move to DLQ immediately (nack with requeue=false)
                        channel.nack(msg, false, false);
                    } else if (retryCount < this.MAX_RETRIES) {
                        // TRANSIENT error - Route to exponential backoff
                        const nextRetryCount = retryCount + 1;
                        const retryRK = this.getRetryRoutingKey(nextRetryCount);
                        
                        syncLogger.warn(`TRANSIENT mail sync error. Retrying... (Next attempt: ${nextRetryCount + 1})`, { 
                            email, 
                            error: error.message,
                            delayKey: retryRK
                        });

                        // Publish to the retry exchange with incremented count
                        channel.publish(
                            MAIL_SYNC_RETRY_EXCHANGE,
                            retryRK,
                            msg.content,
                            {
                                ...msg.properties,
                                headers: { ...headers, 'x-retry-count': nextRetryCount }
                            }
                        );

                        channel.ack(msg);
                    } else {
                        syncLogger.error('Max retries reached for mail sync. Moving to DLQ.', { 
                            email, 
                            tenantId,
                            retries: retryCount
                        });
                        channel.nack(msg, false, false);
                    }
                } finally {
                    // Release the Redis Lock
                    await redisService.releaseLock(lockKey);
                }
            }, {
                noAck: false
            });

        } catch (error: any) {
            syncLogger.error('Failed to start Mail Sync Worker', { error: error.message });
            setTimeout(() => this.start(), 10000);
        }
    }

    private static isErrorFatal(error: any): boolean {
        const msg = error.message?.toLowerCase() || '';
        const status = error.response?.status || error.status;

        // AUTH or NOT FOUND errors are fatal (no point retrying if token is dead)
        if (status === 401 || status === 403 || status === 404) return true;
        if (msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('not found')) return true;
        if (msg.includes('invalid_grant')) return true; 

        return false;
    }

    private static getRetryRoutingKey(count: number): string {
        if (count === 1) return MAIL_SYNC_RETRY_RK_1M;
        if (count === 2) return MAIL_SYNC_RETRY_RK_5M;
        return MAIL_SYNC_RETRY_RK_15M;
    }
}
