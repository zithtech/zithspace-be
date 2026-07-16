export const SUBSCRIPTION_CONSTANTS = {
  ADMIN_API_URL: process.env.ADMIN_API_URL || 'http://localhost:5000',
  ADMIN_API_TIMEOUT: parseInt(process.env.ADMIN_API_TIMEOUT || '5000', 10),
  ADMIN_API_RETRY_COUNT: parseInt(process.env.ADMIN_API_RETRY_COUNT || '3', 10),
  CACHE_TTL: parseInt(process.env.SUBSCRIPTION_CACHE_TTL || '3600', 10), // in seconds
  getCacheKey: (tenantId: string) => `subscription:tenant:${tenantId}`,
};
