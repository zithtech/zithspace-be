import axios, { AxiosError, AxiosInstance } from 'axios';
import { SUBSCRIPTION_CONSTANTS } from './subscription.constants';
import { TenantSubscriptionPayload } from './subscription.types';
import { syncLogger } from '@/utils/logger';

export class SubscriptionClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: SUBSCRIPTION_CONSTANTS.ADMIN_API_URL,
      timeout: SUBSCRIPTION_CONSTANTS.ADMIN_API_TIMEOUT,
    });
  }

  /**
   * Fetch the tenant subscription from the Admin API.
   * Includes automatic retry logic.
   */
  async getTenantFeatures(tenantId: string, productCode?: string): Promise<TenantSubscriptionPayload> {
    // Scopes the answer to one product's subscription AND to what that product
    // sells. Omitted, the Admin API behaves exactly as before products existed.
    const url = `/api/subscriptions/tenant/${tenantId}/features`
      + (productCode ? `?product=${encodeURIComponent(productCode)}` : '');
    
    let attempt = 0;
    while (attempt < SUBSCRIPTION_CONSTANTS.ADMIN_API_RETRY_COUNT) {
      try {
        const response = await this.client.get(url);
        
        // Deserialize and simple validation (API returns { success: true, data: { ... } })
        const payload = response.data?.data || response.data;
        if (!payload || !payload.tenantId || !Array.isArray(payload.features)) {
          throw new Error('Invalid response structure from Admin API');
        }

        return payload as TenantSubscriptionPayload;
      } catch (error) {
        attempt++;
        const axiosError = error as AxiosError;
        syncLogger.warn(`[SubscriptionClient] Failed to fetch subscription for tenant ${tenantId}. Attempt ${attempt}/${SUBSCRIPTION_CONSTANTS.ADMIN_API_RETRY_COUNT}. Error: ${axiosError.message}`);
        
        if (attempt >= SUBSCRIPTION_CONSTANTS.ADMIN_API_RETRY_COUNT) {
          throw new Error(`Failed to fetch subscription after ${SUBSCRIPTION_CONSTANTS.ADMIN_API_RETRY_COUNT} attempts: ${axiosError.message}`);
        }
        
        // Wait before retrying (exponential backoff could be added here)
        await new Promise(res => setTimeout(res, 500 * attempt));
      }
    }
    
    throw new Error('Unexpected error in SubscriptionClient');
  }
}

export const subscriptionClient = new SubscriptionClient();
