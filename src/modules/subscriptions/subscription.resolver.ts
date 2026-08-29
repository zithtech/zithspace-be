import { subscriptionService } from './subscription.service';
import { syncLogger } from '@/utils/logger';

export class FeatureResolverService {
  /**
   * Evaluates if a tenant has access to a specific feature.
   * This is the source of truth for runtime subscription enforcement.
   * 
   * @param tenantId The tenant ID
   * @param featureKey The unified metadata key (e.g., 'page.finance.invoice.dashboard')
   * @returns boolean true if allowed, false otherwise
   */
  async hasFeature(tenantId: string, featureKey: string): Promise<boolean> {
    try {
      if (!tenantId || !featureKey) {
        return false;
      }

      const subscription = await subscriptionService.getTenantSubscription(tenantId);
      
      // If the subscription has the featureKey in its features array, it's allowed.
      // We use startsWith because Admin API returns fully qualified leaf nodes (e.g. 'finance_accounts_invoice_prime').
      // Passing 'finance_accounts_invoice' or 'finance' should grant access if any leaf node exists.
      if (subscription && subscription.features && Array.isArray(subscription.features)) {
        return subscription.features.some(f => f.startsWith(featureKey));
      }

      return false;
    } catch (error) {
      syncLogger.error(`[FeatureResolver] Error checking feature ${featureKey} for tenant ${tenantId}`, error);
      // In case of an outage where Redis is down AND the Admin API fails,
      // fail closed by default to enforce security.
      return false;
    }
  }

  /**
   * Helper to retrieve all features for a tenant.
   */
  /**
   * Every feature the tenant may use, optionally scoped to one product.
   *
   * Pass the product the request arrived through (see config/brand.ts). A
   * tenant holding both a Zukvo and a Testiez subscription otherwise resolves
   * to whichever is newest, which would show the wrong shell entirely.
   */
  async getTenantFeatures(tenantId: string, productCode?: string): Promise<string[]> {
    try {
      const subscription = await subscriptionService.getTenantSubscription(tenantId, productCode);
      return subscription?.features || [];
    } catch (error) {
      syncLogger.error(`[FeatureResolver] Error getting all features for tenant ${tenantId}`, error);
      return [];
    }
  }
}

export const featureResolverService = new FeatureResolverService();
