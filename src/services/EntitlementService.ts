import { SubscriptionCacheService } from '../modules/subscriptions/subscription.cache';
import { usageService } from './UsageService';
import { AIFeature } from '../ai/types/AIFeature';
import { PricingResult } from '../ai/interfaces/PricingResult';

export class EntitlementError extends Error {
  public code: string;
  public current: number;
  public allowed: number;
  public remaining: number;
  public upgradeRequired: boolean;

  constructor(code: string, message: string, current: number, allowed: number) {
    super(message);
    this.name = 'EntitlementError';
    this.code = code;
    this.current = current;
    this.allowed = allowed;
    this.remaining = allowed === -1 ? -1 : Math.max(allowed - current, 0);
    this.upgradeRequired = true;
  }
}

export class EntitlementService {
  private subscriptionCache = new SubscriptionCacheService();

  async checkLimit(tenantId: string, limitKey: string): Promise<void> {
    const subscription = await this.subscriptionCache.get(tenantId);
    if (!subscription) {
      throw new Error('No active subscription found for tenant.');
    }

    const limitConfig = subscription.limits?.[limitKey];
    if (!limitConfig) {
      // If no limit is configured, we assume it is unrestricted, or restricted based on business rules.
      // We will default to unlimited for unconfigured limits to avoid blocking execution.
      return;
    }

    const allowed = limitConfig.value;
    
    // -1 signifies Unlimited
    if (allowed === -1) {
      return;
    }

    const currentUsage = await usageService.getUsage(tenantId, limitKey, limitConfig.type);

    if (currentUsage >= allowed) {
      const code = `${limitKey.toUpperCase()}_LIMIT_REACHED`;
      const message = `Your current subscription allows a maximum of ${allowed} ${limitKey}. Please upgrade your plan.`;
      throw new EntitlementError(code, message, currentUsage, allowed);
    }
  }

  async incrementUsage(tenantId: string, limitKey: string, feature: AIFeature, pricing: PricingResult): Promise<void> {
      await usageService.increment(tenantId, limitKey, feature, pricing);
  }
}

export const entitlementService = new EntitlementService();
