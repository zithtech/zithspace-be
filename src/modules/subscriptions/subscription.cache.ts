import { redisService } from '@/utils/redis';
import { syncLogger } from '@/utils/logger';
import { SUBSCRIPTION_CONSTANTS } from './subscription.constants';
import { CachedTenantSubscription, TenantSubscriptionPayload } from './subscription.types';

export class SubscriptionCacheService {
  /**
   * Get the subscription from Redis cache
   */
  async get(tenantId: string): Promise<CachedTenantSubscription | null> {
    try {
      const client = await redisService.getClient();
      const key = SUBSCRIPTION_CONSTANTS.getCacheKey(tenantId);
      
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
  async set(tenantId: string, data: TenantSubscriptionPayload): Promise<void> {
    try {
      const client = await redisService.getClient();
      const key = SUBSCRIPTION_CONSTANTS.getCacheKey(tenantId);
      
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
   */
  async del(tenantId: string): Promise<void> {
    try {
      const client = await redisService.getClient();
      const key = SUBSCRIPTION_CONSTANTS.getCacheKey(tenantId);
      
      await client.del(key);
      syncLogger.info(`[SubscriptionCache] Cache Deleted for tenant ${tenantId}`);
    } catch (error) {
      syncLogger.error(`[SubscriptionCache] Error deleting cache for tenant ${tenantId}:`, error);
    }
  }
}

export const subscriptionCacheService = new SubscriptionCacheService();
