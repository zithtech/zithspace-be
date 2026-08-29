import { redisService } from '@/utils/redis';
import { syncLogger } from '@/utils/logger';
import { SUBSCRIPTION_CONSTANTS } from './subscription.constants';
import { CachedTenantSubscription, TenantSubscriptionPayload } from './subscription.types';

export class SubscriptionCacheService {
  /**
   * Get the subscription from Redis cache
   */
  async get(tenantId: string, productCode?: string): Promise<CachedTenantSubscription | null> {
    try {
      const client = await redisService.getClient();
      const key = SUBSCRIPTION_CONSTANTS.getCacheKey(tenantId, productCode);
      
      const cached = await client.get(key);
      if (!cached) {
        syncLogger.debug(`[SubscriptionCache] Cache Miss for tenant ${tenantId}`);
        return null;
      }

      syncLogger.debug(`[SubscriptionCache] Cache Hit for tenant ${tenantId}`);
      return JSON.parse(cached) as CachedTenantSubscription;
    } catch (error) {
      syncLogger.error(`[SubscriptionCache] Error reading cache for tenant ${tenantId}:`, error);
      return null;
    }
  }

  /**
   * Write the full subscription response to Redis cache
   */
  async set(tenantId: string, data: TenantSubscriptionPayload, productCode?: string): Promise<void> {
    try {
      const client = await redisService.getClient();
      const key = SUBSCRIPTION_CONSTANTS.getCacheKey(tenantId, productCode);
      
      const cacheData: CachedTenantSubscription = {
        ...data,
        cachedAt: new Date().toISOString(),
      };

      // Set key with EXPIRE
      await client.set(key, JSON.stringify(cacheData), {
        EX: SUBSCRIPTION_CONSTANTS.CACHE_TTL
      });
      syncLogger.debug(`[SubscriptionCache] Cache Updated for tenant ${tenantId}`);
    } catch (error) {
      syncLogger.error(`[SubscriptionCache] Error writing cache for tenant ${tenantId}:`, error);
    }
  }

  /**
   * Delete subscription cache manually (e.g. on webhook invalidation)
   * We must delete all product variations, otherwise a TESTIEZ cache might be left behind.
   */
  async del(tenantId: string): Promise<void> {
    try {
      const client = await redisService.getClient();
      const pattern = `subscription:tenant:${tenantId}*`;
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
        syncLogger.info(`[SubscriptionCache] Cache Deleted ${keys.length} keys for tenant ${tenantId}`);
      }
    } catch (error) {
      syncLogger.error(`[SubscriptionCache] Error deleting cache for tenant ${tenantId}:`, error);
    }
  }
}

export const subscriptionCacheService = new SubscriptionCacheService();
