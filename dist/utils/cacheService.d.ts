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
declare class CacheService {
    private cache;
    constructor();
    /**
     * Check if cache is available
     */
    isAvailable(): boolean;
    /**
     * Generic get method
     */
    get<T>(key: string): Promise<T | null>;
    /**
     * Generic set method with TTL
     */
    set(key: string, value: any, ttlSeconds: number): Promise<void>;
    /**
     * Delete a key
     */
    del(key: string): Promise<void>;
    /**
     * Delete keys matching a pattern
     */
    delPattern(pattern: string): Promise<void>;
    /**
     * Cache user session (5 minutes)
     */
    cacheUser(userId: string, tenantId: string, user: any): Promise<void>;
    /**
     * Get cached user
     */
    getUser(userId: string, tenantId: string): Promise<any | null>;
    /**
     * Invalidate user cache
     */
    invalidateUser(userId: string, tenantId: string): Promise<void>;
    /**
     * Cache tenant (10 minutes)
     */
    cacheTenant(tenantId: string, tenant: any): Promise<void>;
    /**
     * Cache tenant by subdomain (10 minutes)
     */
    cacheTenantBySubdomain(subdomain: string, tenant: any): Promise<void>;
    /**
     * Get cached tenant by ID
     */
    getTenant(tenantId: string): Promise<any | null>;
    /**
     * Get cached tenant by subdomain
     */
    getTenantBySubdomain(subdomain: string): Promise<any | null>;
    /**
     * Invalidate tenant cache
     */
    invalidateTenant(tenantId: string): Promise<void>;
    /**
     * Cache ticket details (2 minutes)
     */
    cacheTicket(ticketId: string, tenantId: string, ticket: any): Promise<void>;
    /**
     * Get cached ticket
     */
    getTicket(ticketId: string, tenantId: string): Promise<any | null>;
    /**
     * Invalidate ticket cache
     */
    invalidateTicket(ticketId: string, tenantId: string): Promise<void>;
    /**
     * Invalidate all tickets for a tenant
     */
    invalidateAllTickets(tenantId: string): Promise<void>;
    /**
     * Cache ticket comments (30 seconds - more dynamic)
     */
    cacheComments(ticketId: string, tenantId: string, comments: any): Promise<void>;
    /**
     * Get cached comments
     */
    getComments(ticketId: string, tenantId: string): Promise<any | null>;
    /**
     * Invalidate comments cache
     */
    invalidateComments(ticketId: string, tenantId: string): Promise<void>;
    /**
     * Cache related links (5 minutes - rarely change)
     */
    cacheLinks(ticketId: string, tenantId: string, links: any): Promise<void>;
    /**
     * Get cached links
     */
    getLinks(ticketId: string, tenantId: string): Promise<any | null>;
    /**
     * Invalidate links cache
     */
    invalidateLinks(ticketId: string, tenantId: string): Promise<void>;
    /**
     * Get cache statistics
     */
    getStats(): NodeCache.Stats;
    /**
     * Get all cache keys
     */
    getKeys(): string[];
    /**
     * Clear all cache
     */
    flushAll(): Promise<void>;
}
export declare const cacheService: CacheService;
export default cacheService;
