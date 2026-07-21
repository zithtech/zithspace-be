import { Response, NextFunction } from 'express';
import { AuthRequest, ApiResponse } from '@/types';
import { featureResolverService } from './subscription.resolver';
import { syncLogger } from '@/utils/logger';
import { subscriptionService } from './subscription.service';

/**
 * Middleware that enforces overall subscription status access.
 * Must run before RBAC.
 */
export const validateSubscriptionStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.tenantId;

    if (!tenantId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Tenant context is required.' }
      } as any);
      return;
    }

    // IMPORTANT: Allow bypass for critical routes so users can actually renew!
    const bypassPaths = [
      '/api/payments',
      '/api/plans',
      '/api/subscriptions/tenant'
    ];

    if (bypassPaths.some(path => req.originalUrl.includes(path))) {
      return next();
    }

    // Read subscription from cache (falls back to Admin API on miss)
    const subscription = await subscriptionService.getTenantSubscription(tenantId);

    const now = new Date();
    
    // Check TRIAL EXPIRED explicitly
    if (subscription.status === 'TRIAL' && subscription.trial_ends_at) {
      const trialEnds = new Date(subscription.trial_ends_at);
      if (now > trialEnds) {
        syncLogger.warn(`[SubscriptionMiddleware] Access Denied: Tenant ${tenantId} trial expired. Request Path: ${req.originalUrl}`);
        res.status(403).json({
          success: false,
          error: {
            code: 'TRIAL_EXPIRED',
            message: 'Your free trial has ended.',
            status: 'EXPIRED',
            expiresAt: subscription.trial_ends_at,
            currentPlanId: subscription.plan?.id
          }
        } as any);
        return;
      }
    }

    // Check Standard Expiration
    if (subscription.status === 'EXPIRED') {
      syncLogger.warn(`[SubscriptionMiddleware] Access Denied: Tenant ${tenantId} subscription expired. Request Path: ${req.originalUrl}`);
      res.status(403).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_EXPIRED',
          message: 'Your subscription has expired.',
          status: 'EXPIRED',
          expiresAt: subscription.expires_at,
          currentPlanId: subscription.plan?.id
        }
      } as any);
      return;
    }

    // Check Suspended
    if (subscription.status === 'SUSPENDED') {
      syncLogger.warn(`[SubscriptionMiddleware] Access Denied: Tenant ${tenantId} subscription suspended. Request Path: ${req.originalUrl}`);
      res.status(403).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_SUSPENDED',
          message: 'Your subscription has been suspended.',
          status: 'SUSPENDED',
          expiresAt: subscription.expires_at,
          currentPlanId: subscription.plan?.id
        }
      } as any);
      return;
    }

    // Check Cancelled
    if (subscription.status === 'CANCELLED') {
      syncLogger.warn(`[SubscriptionMiddleware] Access Denied: Tenant ${tenantId} subscription cancelled. Request Path: ${req.originalUrl}`);
      res.status(403).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_CANCELLED',
          message: 'Your subscription has been cancelled.',
          status: 'CANCELLED',
          expiresAt: subscription.expires_at,
          currentPlanId: subscription.plan?.id
        }
      } as any);
      return;
    }

    // Allow ACTIVE, PENDING, or valid TRIAL to proceed
    next();
  } catch (error) {
    syncLogger.error(`[SubscriptionMiddleware] Unexpected error validating subscription status for tenant ${req.tenantId}:`, error);
    res.status(503).json({
      success: false,
      error: { code: 'UNAVAILABLE', message: 'Subscription service is temporarily unavailable.' }
    } as any);
    return;
  }
};


/**
 * Middleware that enforces runtime subscription access for a specific feature/page.
 * 
 * @param featureKey The unified metadata key (e.g., 'page.finance.invoice.dashboard')
 */
export const requireSubscriptionFeature = (featureKey: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId;

      if (!tenantId) {
        res.status(401).json({
          success: false,
          error: "Tenant context is required for subscription validation.",
        } as ApiResponse);
        return;
      }

      // 1. Resolve feature entitlement using the FeatureResolverService
      const isAllowed = await featureResolverService.hasFeature(tenantId, featureKey);

      // 2. Allow / Deny Request
      if (!isAllowed) {
        syncLogger.warn(`[SubscriptionMiddleware] Access Denied: Tenant ${tenantId} is not entitled to feature '${featureKey}'. Request Path: ${req.originalUrl}`);
        res.status(403).json({
          success: false,
          error: "Your subscription plan does not include access to this feature.",
        } as ApiResponse);
        return;
      }

      next();
    } catch (error) {
      syncLogger.error(`[SubscriptionMiddleware] Unexpected error validating feature '${featureKey}' for tenant ${req.tenantId}:`, error);
      res.status(503).json({
        success: false,
        error: "Subscription service is temporarily unavailable.",
      } as ApiResponse);
      return;
    }
  };
};
