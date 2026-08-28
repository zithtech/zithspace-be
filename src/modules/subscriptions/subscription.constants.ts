export const SUBSCRIPTION_CONSTANTS = {
  ADMIN_API_URL: process.env.ADMIN_API_URL || 'http://localhost:5000',
  ADMIN_API_TIMEOUT: parseInt(process.env.ADMIN_API_TIMEOUT || '5000', 10),
  ADMIN_API_RETRY_COUNT: parseInt(process.env.ADMIN_API_RETRY_COUNT || '3', 10),
  CACHE_TTL: parseInt(process.env.SUBSCRIPTION_CACHE_TTL || '3600', 10), // in seconds
  // Product is part of the key: one tenant can hold a Zukvo AND a Testiez
  // subscription, and without it a request through one brand door would be
  // served the other product's cached features for the whole TTL.
  getCacheKey: (tenantId: string, productCode?: string) =>
    `subscription:tenant:${tenantId}${productCode ? `:${productCode}` : ''}`,
};
