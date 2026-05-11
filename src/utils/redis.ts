import { createClient } from 'redis';
import { syncLogger } from './logger';

class RedisService {
    private client;
    private isConnected = false;

    constructor() {
        this.client = createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379'
        });

        this.client.on('error', (err) => syncLogger.error('Redis Client Error', err));
        this.client.on('connect', () => {
            this.isConnected = true;
            syncLogger.info('Redis Client Connected');
        });
    }

    async connect() {
        if (!this.isConnected) {
            await this.client.connect();
        }
    }

    /**
     * Acquire a lock for a specific key
     * @param key Lock key
     * @param ttl TTL in seconds
     * @returns Boolean indicating if lock was acquired
     */
    async acquireLock(key: string, ttl: number = 300): Promise<boolean> {
        try {
            await this.connect();
            // NX: Only set if not exists, EX: Set expiry
            const result = await this.client.set(`lock:${key}`, 'locked', {
                NX: true,
                EX: ttl
            });
            return result === 'OK';
        } catch (error) {
            syncLogger.error(`Redis acquireLock error for ${key}:`, error);
            return false;
        }
    }

    /**
     * Release a lock for a specific key
     */
    async releaseLock(key: string): Promise<void> {
        try {
            await this.connect();
            await this.client.del(`lock:${key}`);
        } catch (error) {
            syncLogger.error(`Redis releaseLock error for ${key}:`, error);
        }
    }

    async getClient() {
        await this.connect();
        return this.client;
    }
}

export const redisService = new RedisService();
