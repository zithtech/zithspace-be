import { PrismaClient } from '@prisma/client';
declare global {
    var __prisma: PrismaClient | undefined;
}
export declare const prisma: PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
/**
 * Tenant-aware Prisma client that sets tenant context for RLS
 */
export declare class TenantAwarePrisma {
    private client;
    private currentTenantId;
    constructor();
    /**
     * Set tenant context for Row Level Security
     * OPTIMIZED: Only sets if tenant has changed
     */
    setTenantContext(tenantId: string, force?: boolean): Promise<void>;
    /**
     * Get Prisma client (context should already be set by middleware)
     * DEPRECATED: Use prisma directly instead
     */
    getClient(tenantId: string): Promise<PrismaClient>;
    /**
     * Execute a query with tenant context
     * DEPRECATED: Context should already be set by middleware, use prisma directly
     */
    withTenant<T>(tenantId: string, operation: (client: PrismaClient) => Promise<T>): Promise<T>;
    /**
     * Get raw Prisma client (use carefully - no tenant context)
     */
    getRawClient(): PrismaClient;
    /**
     * Reset tenant context tracking (useful for testing)
     */
    resetContext(): void;
    /**
     * Close database connection
     */
    disconnect(): Promise<void>;
}
export declare const tenantAwarePrisma: TenantAwarePrisma;
export declare const connectDatabase: () => Promise<void>;
export declare const disconnectDatabase: () => Promise<void>;
export { prisma as db };
export default prisma;
