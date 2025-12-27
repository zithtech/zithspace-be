import NodeCache from 'node-cache';

/**
 * Node-Cache Service for Performance Optimization
 * 
 * Caches:
 * - User sessions (5 minutes)
 * - Tenant lookups (10 minutes)
 * - Ticket details (2 minutes)
 * - Comments (30 seconds)
 * - Links (5 minutes)
 */
class CacheService {
  private cache: NodeCache;

  constructor() {
    this.cache = new NodeCache({
      stdTTL: 120,           // Default 2 minutes
      checkperiod: 60,       // Check for expired keys every 60s
      useClones: false,      // Better performance (don't clone objects)
      deleteOnExpire: true,  // Auto-delete expired keys
    });

    console.log('✅ Node-Cache initialized successfully');
  }

  /**
   * Check if cache is available
   */
  isAvailable(): boolean {
    return true; // node-cache is always available
  }

  /**
   * Generic get method
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = this.cache.get<T>(key);
      return cached || null;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Generic set method with TTL
   */
  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      this.cache.set(key, value, ttlSeconds);
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<void> {
    try {
      this.cache.del(key);
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Delete keys matching a pattern
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = this.cache.keys();
      const matchingKeys = keys.filter(key => {
        // Convert pattern to regex (simple wildcard support)
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(key);
      });
      
      if (matchingKeys.length > 0) {
        this.cache.del(matchingKeys);
      }
    } catch (error) {
      console.error(`Cache delete pattern error for ${pattern}:`, error);
    }
  }

  // ==================== USER CACHING ====================

  /**
   * Cache user session (10 minutes)
   */
  async cacheUser(userId: string, tenantId: string, user: any): Promise<void> {
    const key = `user:${tenantId}:${userId}`;
    await this.set(key, user, 600); // 10 minutes
  }

  /**
   * Get cached user
   */
  async getUser(userId: string, tenantId: string): Promise<any | null> {
    const key = `user:${tenantId}:${userId}`;
    return await this.get(key);
  }

  /**
   * Invalidate user cache
   */
  async invalidateUser(userId: string, tenantId: string): Promise<void> {
    const key = `user:${tenantId}:${userId}`;
    await this.del(key);
  }

  // ==================== TENANT CACHING ====================

  /**
   * Cache tenant (10 minutes)
   */
  async cacheTenant(tenantId: string, tenant: any): Promise<void> {
    const key = `tenant:${tenantId}`;
    await this.set(key, tenant, 600); // 10 minutes
  }

  /**
   * Cache tenant by subdomain (10 minutes)
   */
  async cacheTenantBySubdomain(subdomain: string, tenant: any): Promise<void> {
    const key = `tenant:subdomain:${subdomain}`;
    await this.set(key, tenant, 600); // 10 minutes
  }

  /**
   * Get cached tenant by ID
   */
  async getTenant(tenantId: string): Promise<any | null> {
    const key = `tenant:${tenantId}`;
    return await this.get(key);
  }

  /**
   * Get cached tenant by subdomain
   */
  async getTenantBySubdomain(subdomain: string): Promise<any | null> {
    const key = `tenant:subdomain:${subdomain}`;
    return await this.get(key);
  }

  /**
   * Invalidate tenant cache
   */
  async invalidateTenant(tenantId: string): Promise<void> {
    await this.delPattern(`tenant:${tenantId}*`);
    await this.delPattern(`tenant:subdomain:*`);
  }

  // ==================== TICKET CACHING ====================

  /**
   * Cache ticket details (2 minutes)
   */
  async cacheTicket(ticketId: string, tenantId: string, ticket: any): Promise<void> {
    const key = `ticket:${tenantId}:${ticketId}`;
    await this.set(key, ticket, 120); // 2 minutes
  }

  /**
   * Get cached ticket
   */
  async getTicket(ticketId: string, tenantId: string): Promise<any | null> {
    const key = `ticket:${tenantId}:${ticketId}`;
    return await this.get(key);
  }

  /**
   * Invalidate ticket cache
   */
  async invalidateTicket(ticketId: string, tenantId: string): Promise<void> {
    const key = `ticket:${tenantId}:${ticketId}`;
    await this.del(key);
  }

  /**
   * Invalidate all tickets for a tenant
   */
  async invalidateAllTickets(tenantId: string): Promise<void> {
    await this.delPattern(`ticket:${tenantId}:*`);
  }

  // ==================== COMMENTS CACHING ====================

  /**
   * Cache ticket comments (30 seconds - more dynamic)
   */
  async cacheComments(ticketId: string, tenantId: string, comments: any): Promise<void> {
    const key = `comments:${tenantId}:${ticketId}`;
    await this.set(key, comments, 30); // 30 seconds
  }

  /**
   * Get cached comments
   */
  async getComments(ticketId: string, tenantId: string): Promise<any | null> {
    const key = `comments:${tenantId}:${ticketId}`;
    return await this.get(key);
  }

  /**
   * Invalidate comments cache
   */
  async invalidateComments(ticketId: string, tenantId: string): Promise<void> {
    const key = `comments:${tenantId}:${ticketId}`;
    await this.del(key);
  }

  // ==================== LINKS CACHING ====================

  /**
   * Cache related links (5 minutes - rarely change)
   */
  async cacheLinks(ticketId: string, tenantId: string, links: any): Promise<void> {
    const key = `links:${tenantId}:${ticketId}`;
    await this.set(key, links, 300); // 5 minutes
  }

  /**
   * Get cached links
   */
  async getLinks(ticketId: string, tenantId: string): Promise<any | null> {
    const key = `links:${tenantId}:${ticketId}`;
    return await this.get(key);
  }

  /**
   * Invalidate links cache
   */
  async invalidateLinks(ticketId: string, tenantId: string): Promise<void> {
    const key = `links:${tenantId}:${ticketId}`;
    await this.del(key);
  }

  // ==================== STATS ====================

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Get all cache keys
   */
  getKeys(): string[] {
    return this.cache.keys();
  }

  /**
   * Clear all cache
   */
  async flushAll(): Promise<void> {
    this.cache.flushAll();
    console.log('🗑️ Cache cleared');
  }
}

// Export singleton instance
export const cacheService = new CacheService();
export default cacheService;
