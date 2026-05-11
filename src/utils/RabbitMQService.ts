import * as amqp from 'amqplib';
import { syncLogger } from '@/utils/logger';
import { 
    CALENDAR_SYNC_EXCHANGE, 
    CALENDAR_SYNC_QUEUE, 
    CALENDAR_SYNC_ROUTING_KEY, 
    CALENDAR_SYNC_DLX, 
    CALENDAR_SYNC_DLQ, 
    CALENDAR_SYNC_DL_ROUTING_KEY,
    CALENDAR_SYNC_RETRY_EXCHANGE,
    CALENDAR_SYNC_RETRY_QUEUE_1M,
    CALENDAR_SYNC_RETRY_QUEUE_5M,
    CALENDAR_SYNC_RETRY_QUEUE_15M,
    CALENDAR_SYNC_RETRY_RK_1M,
    CALENDAR_SYNC_RETRY_RK_5M,
    CALENDAR_SYNC_RETRY_RK_15M,
    MAIL_SYNC_EXCHANGE,
    MAIL_SYNC_QUEUE,
    MAIL_SYNC_ROUTING_KEY,
    MAIL_SYNC_DLX,
    MAIL_SYNC_DLQ,
    MAIL_SYNC_DL_ROUTING_KEY,
    MAIL_SYNC_RETRY_EXCHANGE,
    MAIL_SYNC_RETRY_QUEUE_1M,
    MAIL_SYNC_RETRY_QUEUE_5M,
    MAIL_SYNC_RETRY_QUEUE_15M,
    MAIL_SYNC_RETRY_RK_1M,
    MAIL_SYNC_RETRY_RK_5M,
    MAIL_SYNC_RETRY_RK_15M
} from '@/config/rabbitmq';

class RabbitMQService {
    private connection: amqp.Connection | null = null;
    private channel: amqp.Channel | null = null;
    private isConnecting = false;

    async connect() {
        if (this.connection || this.isConnecting) return;
        this.isConnecting = true;

        try {
            const url = process.env.RABBITMQ_URL || 'amqp://localhost';
            const conn = await amqp.connect(url);
            this.connection = conn as any;
            this.channel = await (this.connection as any).createChannel();

            // Set up topological structure (SaaS-friendly DLQ pattern)
            await this.setupTopology();

            syncLogger.info('Connected to RabbitMQ successfully');

            (this.connection as any).on('error', (err: any) => {
                syncLogger.error('RabbitMQ connection error', { error: err.message });
                this.handleDisconnect();
            });

            (this.connection as any).on('close', () => {
                syncLogger.warn('RabbitMQ connection closed');
                this.handleDisconnect();
            });

        } catch (error: any) {
            syncLogger.error('Failed to connect to RabbitMQ', { error: error.message });
            this.handleDisconnect();
        } finally {
            this.isConnecting = false;
        }
    }

    private async setupTopology() {
        if (!this.channel) return;

        // 1. Establish Dead Letter Exchange and Queue
        await this.channel.assertExchange(CALENDAR_SYNC_DLX, 'direct', { durable: true });
        await this.channel.assertQueue(CALENDAR_SYNC_DLQ, { durable: true });
        await this.channel.bindQueue(CALENDAR_SYNC_DLQ, CALENDAR_SYNC_DLX, CALENDAR_SYNC_DL_ROUTING_KEY);

        // 2. Establish Primary Exchange
        await this.channel.assertExchange(CALENDAR_SYNC_EXCHANGE, 'topic', { durable: true });

        // 3. Establish Primary Queue including DLX fallback
        await this.channel.assertQueue(CALENDAR_SYNC_QUEUE, { 
            durable: true,
            arguments: {
                'x-dead-letter-exchange': CALENDAR_SYNC_DLX,
                'x-dead-letter-routing-key': CALENDAR_SYNC_DL_ROUTING_KEY
            }
        });

        // 4. Establish Retry Topology (Dead Letter TTL Pattern)
        await this.channel.assertExchange(CALENDAR_SYNC_RETRY_EXCHANGE, 'direct', { durable: true });
        
        // Retry Queue 1 (1 minute)
        await this.channel.assertQueue(CALENDAR_SYNC_RETRY_QUEUE_1M, {
            durable: true,
            arguments: {
                'x-message-ttl': 60000,
                'x-dead-letter-exchange': CALENDAR_SYNC_EXCHANGE,
                'x-dead-letter-routing-key': CALENDAR_SYNC_ROUTING_KEY
            }
        });
        await this.channel.bindQueue(CALENDAR_SYNC_RETRY_QUEUE_1M, CALENDAR_SYNC_RETRY_EXCHANGE, CALENDAR_SYNC_RETRY_RK_1M);

        // Retry Queue 2 (5 minutes)
        await this.channel.assertQueue(CALENDAR_SYNC_RETRY_QUEUE_5M, {
            durable: true,
            arguments: {
                'x-message-ttl': 300000,
                'x-dead-letter-exchange': CALENDAR_SYNC_EXCHANGE,
                'x-dead-letter-routing-key': CALENDAR_SYNC_ROUTING_KEY
            }
        });
        await this.channel.bindQueue(CALENDAR_SYNC_RETRY_QUEUE_5M, CALENDAR_SYNC_RETRY_EXCHANGE, CALENDAR_SYNC_RETRY_RK_5M);

        // Retry Queue 3 (15 minutes)
        await this.channel.assertQueue(CALENDAR_SYNC_RETRY_QUEUE_15M, {
            durable: true,
            arguments: {
                'x-message-ttl': 900000,
                'x-dead-letter-exchange': CALENDAR_SYNC_EXCHANGE,
                'x-dead-letter-routing-key': CALENDAR_SYNC_ROUTING_KEY
            }
        });
        await this.channel.bindQueue(CALENDAR_SYNC_RETRY_QUEUE_15M, CALENDAR_SYNC_RETRY_EXCHANGE, CALENDAR_SYNC_RETRY_RK_15M);

        // 5. Finalize Main Queue Binding
        await this.channel.bindQueue(CALENDAR_SYNC_QUEUE, CALENDAR_SYNC_EXCHANGE, CALENDAR_SYNC_ROUTING_KEY);

        // --- MAIL_SYNC TOPOLOGY ---

        // 1. Establish Dead Letter Exchange and Queue for Mail
        await this.channel.assertExchange(MAIL_SYNC_DLX, 'direct', { durable: true });
        await this.channel.assertQueue(MAIL_SYNC_DLQ, { durable: true });
        await this.channel.bindQueue(MAIL_SYNC_DLQ, MAIL_SYNC_DLX, MAIL_SYNC_DL_ROUTING_KEY);

        // 2. Establish Primary Exchange for Mail
        await this.channel.assertExchange(MAIL_SYNC_EXCHANGE, 'topic', { durable: true });

        // 3. Establish Primary Queue for Mail including DLX fallback
        await this.channel.assertQueue(MAIL_SYNC_QUEUE, { 
            durable: true,
            arguments: {
                'x-dead-letter-exchange': MAIL_SYNC_DLX,
                'x-dead-letter-routing-key': MAIL_SYNC_DL_ROUTING_KEY
            }
        });

        // 4. Establish Retry Topology for Mail (Dead Letter TTL Pattern)
        await this.channel.assertExchange(MAIL_SYNC_RETRY_EXCHANGE, 'direct', { durable: true });
        
        // Mail Retry Queue 1 (1 minute)
        await this.channel.assertQueue(MAIL_SYNC_RETRY_QUEUE_1M, {
            durable: true,
            arguments: {
                'x-message-ttl': 60000,
                'x-dead-letter-exchange': MAIL_SYNC_EXCHANGE,
                'x-dead-letter-routing-key': MAIL_SYNC_ROUTING_KEY
            }
        });
        await this.channel.bindQueue(MAIL_SYNC_RETRY_QUEUE_1M, MAIL_SYNC_RETRY_EXCHANGE, MAIL_SYNC_RETRY_RK_1M);

        // Mail Retry Queue 2 (5 minutes)
        await this.channel.assertQueue(MAIL_SYNC_RETRY_QUEUE_5M, {
            durable: true,
            arguments: {
                'x-message-ttl': 300000,
                'x-dead-letter-exchange': MAIL_SYNC_EXCHANGE,
                'x-dead-letter-routing-key': MAIL_SYNC_ROUTING_KEY
            }
        });
        await this.channel.bindQueue(MAIL_SYNC_RETRY_QUEUE_5M, MAIL_SYNC_RETRY_EXCHANGE, MAIL_SYNC_RETRY_RK_5M);

        // Mail Retry Queue 3 (15 minutes)
        await this.channel.assertQueue(MAIL_SYNC_RETRY_QUEUE_15M, {
            durable: true,
            arguments: {
                'x-message-ttl': 900000,
                'x-dead-letter-exchange': MAIL_SYNC_EXCHANGE,
                'x-dead-letter-routing-key': MAIL_SYNC_ROUTING_KEY
            }
        });
        await this.channel.bindQueue(MAIL_SYNC_RETRY_QUEUE_15M, MAIL_SYNC_RETRY_EXCHANGE, MAIL_SYNC_RETRY_RK_15M);

        // 5. Finalize Main Queue Binding for Mail
        await this.channel.bindQueue(MAIL_SYNC_QUEUE, MAIL_SYNC_EXCHANGE, MAIL_SYNC_ROUTING_KEY);
    }

    private async handleDisconnect() {
        this.connection = null;
        this.channel = null;
        // Exponential backoff or simple retry
        setTimeout(() => this.connect(), 5000);
    }

    async getChannel(): Promise<amqp.Channel> {
        if (!this.channel) {
            await this.connect();
        }
        if (!this.channel) throw new Error('RabbitMQ channel not available');
        return this.channel;
    }

    async close() {
        if (this.connection) {
            await (this.connection as any).close();
            this.connection = null;
            this.channel = null;
        }
    }
}

export const rabbitMQService = new RabbitMQService();
