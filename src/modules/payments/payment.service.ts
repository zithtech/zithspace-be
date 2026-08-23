import { paymentClient } from './payment.client';
import { subscriptionCacheService } from '../subscriptions/subscription.cache';

export class PaymentService {
  async createOrder(payload: any) {
    return await paymentClient.createOrder(payload);
  }

  async verifyPayment(payload: any, tenantId: string) {
    const result = await paymentClient.verifyPayment(payload);
    
    // Invalidate Redis cache so the next request gets the fresh subscription from Admin
    if (result && result.success) {
      await subscriptionCacheService.del(tenantId);
    }
    
    return result;
  }
}

export const paymentService = new PaymentService();
