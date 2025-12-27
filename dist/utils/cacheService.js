"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheService = void 0;
const node_cache_1 = __importDefault(require("node-cache"));
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
    constructor() {
        this.cache = new node_cache_1.default({
            stdTTL: 120, // Default 2 minutes
            checkperiod: 60, // Check for expired keys every 60s
            useClones: false, // Better performance (don't clone objects)
            deleteOnExpire: true, // Auto-delete expired keys
        });
        console.log('✅ Node-Cache initialized successfully');
    }
    /**
     * Check if cache is available
     */
    isAvailable() {
        return true; // node-cache is always available
    }
    /**
     * Generic get method
     */
    async get(key) {
        try {
            const cached = this.cache.get(key);
            return cached || null;
        }
        catch (error) {
            console.error(`Cache get error for key ${key}:`, error);
            return null;
        }
    }
    /**
     * Generic set method with TTL
     */
    async set(key, value, ttlSeconds) {
        try {
            this.cache.set(key, value, ttlSeconds);
        }
        catch (error) {
            console.error(`Cache set error for key ${key}:`, error);
        }
    }
    /**
     * Delete a key
     */
    async del(key) {
        try {
            this.cache.del(key);
        }
        catch (error) {
            console.error(`Cache delete error for key ${key}:`, error);
        }
    }
    /**
     * Delete keys matching a pattern
     */
    async delPattern(pattern) {
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
        }
        catch (error) {
            console.error(`Cache delete pattern error for ${pattern}:`, error);
        }
    }
    // ==================== USER CACHING ====================
    /**
     * Cache user session (10 minutes)
     */
    async cacheUser(userId, tenantId, user) {
        const key = `user:${tenantId}:${userId}`;
        await this.set(key, user, 600); // 10 minutes
    }
    /**
     * Get cached user
     */
    async getUser(userId, tenantId) {
        const key = `user:${tenantId}:${userId}`;
        return await this.get(key);
    }
    /**
     * Invalidate user cache
     */
    async invalidateUser(userId, tenantId) {
        const key = `user:${tenantId}:${userId}`;
        await this.del(key);
    }
    // ==================== TENANT CACHING ====================
    /**
     * Cache tenant (10 minutes)
     */
    async cacheTenant(tenantId, tenant) {
        const key = `tenant:${tenantId}`;
        await this.set(key, tenant, 600); // 10 minutes
    }
    /**
     * Cache tenant by subdomain (10 minutes)
     */
    async cacheTenantBySubdomain(subdomain, tenant) {
        const key = `tenant:subdomain:${subdomain}`;
        await this.set(key, tenant, 600); // 10 minutes
    }
    /**
     * Get cached tenant by ID
     */
    async getTenant(tenantId) {
        const key = `tenant:${tenantId}`;
        return await this.get(key);
    }
    /**
     * Get cached tenant by subdomain
     */
    async getTenantBySubdomain(subdomain) {
        const key = `tenant:subdomain:${subdomain}`;
        return await this.get(key);
    }
    /**
     * Invalidate tenant cache
     */
    async invalidateTenant(tenantId) {
        await this.delPattern(`tenant:${tenantId}*`);
        await this.delPattern(`tenant:subdomain:*`);
    }
    // ==================== TICKET CACHING ====================
    /**
     * Cache ticket details (2 minutes)
     */
    async cacheTicket(ticketId, tenantId, ticket) {
        const key = `ticket:${tenantId}:${ticketId}`;
        await this.set(key, ticket, 120); // 2 minutes
    }
    /**
     * Get cached ticket
     */
    async getTicket(ticketId, tenantId) {
        const key = `ticket:${tenantId}:${ticketId}`;
        return await this.get(key);
    }
    /**
     * Invalidate ticket cache
     */
    async invalidateTicket(ticketId, tenantId) {
        const key = `ticket:${tenantId}:${ticketId}`;
        await this.del(key);
    }
    /**
     * Invalidate all tickets for a tenant
     */
    async invalidateAllTickets(tenantId) {
        await this.delPattern(`ticket:${tenantId}:*`);
    }
    // ==================== COMMENTS CACHING ====================
    /**
     * Cache ticket comments (30 seconds - more dynamic)
     */
    async cacheComments(ticketId, tenantId, comments) {
        const key = `comments:${tenantId}:${ticketId}`;
        await this.set(key, comments, 30); // 30 seconds
    }
    /**
     * Get cached comments
     */
    async getComments(ticketId, tenantId) {
        const key = `comments:${tenantId}:${ticketId}`;
        return await this.get(key);
    }
    /**
     * Invalidate comments cache
     */
    async invalidateComments(ticketId, tenantId) {
        const key = `comments:${tenantId}:${ticketId}`;
        await this.del(key);
    }
    // ==================== LINKS CACHING ====================
    /**
     * Cache related links (5 minutes - rarely change)
     */
    async cacheLinks(ticketId, tenantId, links) {
        const key = `links:${tenantId}:${ticketId}`;
        await this.set(key, links, 300); // 5 minutes
    }
    /**
     * Get cached links
     */
    async getLinks(ticketId, tenantId) {
        const key = `links:${tenantId}:${ticketId}`;
        return await this.get(key);
    }
    /**
     * Invalidate links cache
     */
    async invalidateLinks(ticketId, tenantId) {
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
    getKeys() {
        return this.cache.keys();
    }
    /**
     * Clear all cache
     */
    async flushAll() {
        this.cache.flushAll();
        console.log('🗑️ Cache cleared');
    }
}
// Export singleton instance
exports.cacheService = new CacheService();
exports.default = exports.cacheService;
//# sourceMappingURL=cacheService.js.map