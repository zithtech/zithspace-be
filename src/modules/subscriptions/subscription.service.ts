import { subscriptionClient } from './subscription.client';
import { subscriptionCacheService } from './subscription.cache';
import { CachedTenantSubscription, TenantSubscriptionPayload } from './subscription.types';
import { syncLogger } from '@/utils/logger';

export class SubscriptionService {
  /**
   * Orchestrates fetching the subscription.
   * Prioritizes Redis Cache, falls back to Admin API on Miss.
   */
  async getTenantSubscription(tenantId: string, productCode?: string): Promise<CachedTenantSubscription | TenantSubscriptionPayload> {
    try {
      // 1. Check Cache
      const cached = await subscriptionCacheService.get(tenantId, productCode);
      if (cached) {
        return cached;
      }

      // 2. Fetch from Admin API
      const apiResponse = await subscriptionClient.getTenantFeatures(tenantId, productCode);

      // 3. Update Cache in background (no await)
      subscriptionCacheService.set(tenantId, apiResponse, productCode).catch(err => {
        syncLogger.error(`Failed to cache subscription for tenant ${tenantId}`, err);
      });

      return apiResponse;
    } catch (error) {
      syncLogger.error(`[SubscriptionService] Failed to get subscription for tenant ${tenantId}`, error);
      throw error;
    }
  }

  /**
   * Explicitly fetch a fresh subscription from Admin API and update the cache.
   */
  async refreshTenantSubscription(tenantId: string): Promise<TenantSubscriptionPayload> {
    try {
      const apiResponse = await subscriptionClient.getTenantFeatures(tenantId);
      await subscriptionCacheService.set(tenantId, apiResponse);
      syncLogger.info(`[SubscriptionService] Subscription forcibly refreshed for tenant ${tenantId}`);
      return apiResponse;
    } catch (error) {
      syncLogger.error(`[SubscriptionService] Failed to refresh subscription for tenant ${tenantId}`, error);
      throw error;
    }
  }

  /**
   * Invalidate the tenant's subscription cache.
   */
  async invalidateTenantSubscription(tenantId: string): Promise<void> {
    await subscriptionCacheService.del(tenantId);
  }
}

export const subscriptionService = new SubscriptionService();
