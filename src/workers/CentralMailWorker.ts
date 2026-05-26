/*
import { rabbitMQService } from '../utils/RabbitMQService';
import { 
    CENTRAL_MAIL_QUEUE, 
    CENTRAL_MAIL_EXCHANGE,
    CENTRAL_MAIL_RETRY_EXCHANGE,
    CENTRAL_MAIL_RETRY_RK_1M,
    CENTRAL_MAIL_RETRY_RK_5M,
    CENTRAL_MAIL_RETRY_RK_15M 
} from '../config/rabbitmq';
import { emailService } from '../utils/emailService';
import { syncLogger } from '../utils/logger';

export interface CentralMailPayload {
    tenantId: string;
    to: string;
    subject: string;
    templateType: 'welcome' | 'custom';
    templateData: {
        name: string;
        email: string;
        password?: string;
        [key: string]: any;
    };
}

export class CentralMailWorker {
    private static readonly MAX_RETRIES = 3;

    static async start() {
        try {
            const channel = await rabbitMQService.getChannel();

            // Set prefetch to 1 for SaaS predictability
            await channel.prefetch(1);

            syncLogger.info('Central Outbound Mail Worker started', { queue: CENTRAL_MAIL_QUEUE });

            await channel.consume(CENTRAL_MAIL_QUEUE, async (msg) => {
                if (!msg) return;

                const payload: CentralMailPayload = JSON.parse(msg.content.toString());
                const { tenantId, to, subject, templateType, templateData } = payload;
                
                const headers = msg.properties.headers || {};
                const retryCount = (headers['x-retry-count'] || 0) as number;

                syncLogger.info(`Processing central mail job (Attempt ${retryCount + 1})`, { 
                    to, 
                    tenantId, 
                    templateType 
                });

                try {
                    if (templateType === 'welcome') {
                        // Call welcome email function directly (we'll implement this on emailService)
                        await emailService.sendNewMemberWelcomeEmail(
                            {
                                to,
                                name: templateData.name,
                                email: templateData.email,
                                password: templateData.password || '',
                            },
                            tenantId
                        );
                    } else {
                        // Custom email logic
                        await emailService.sendCentralizedMail({
                            tenantId,
                            to,
                            subject,
                            html: templateData.html || '',
                            text: templateData.text || '',
                        });
                    }
                    
                    syncLogger.info('Central email sent successfully', { to, tenantId });
                    channel.ack(msg);
                } catch (error: any) {
                    const isFatal = this.isErrorFatal(error);
                    
                    if (isFatal) {
                        syncLogger.error('FATAL central mail error (No Retry)', { 
                            to, 
                            tenantId, 
                            error: error.message 
                        });
                        channel.nack(msg, false, false);
                    } else if (retryCount < this.MAX_RETRIES) {
                        const nextRetryCount = retryCount + 1;
                        const retryRK = this.getRetryRoutingKey(nextRetryCount);
                        
                        syncLogger.warn(`TRANSIENT central mail error. Retrying... (Next attempt: ${nextRetryCount + 1})`, { 
                            to, 
                            error: error.message,
                            delayKey: retryRK
                        });

                        channel.publish(
                            CENTRAL_MAIL_RETRY_EXCHANGE,
                            retryRK,
                            msg.content,
                            {
                                ...msg.properties,
                                headers: { ...headers, 'x-retry-count': nextRetryCount }
                            }
                        );

                        channel.ack(msg);
                    } else {
                        syncLogger.error('Max retries reached for central mail. Moving to DLQ.', { 
                            to, 
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
            syncLogger.error('Failed to start Central Mail Worker', { error: error.message });
            setTimeout(() => this.start(), 10000);
        }
    }

    private static isErrorFatal(error: any): boolean {
        const msg = error.message?.toLowerCase() || '';
        if (msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('invalid_grant')) return true;
        return false;
    }

    private static getRetryRoutingKey(count: number): string {
        if (count === 1) return CENTRAL_MAIL_RETRY_RK_1M;
        if (count === 2) return CENTRAL_MAIL_RETRY_RK_5M;
        return CENTRAL_MAIL_RETRY_RK_15M;
    }
}
*/
