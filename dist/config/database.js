"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.disconnectDatabase = exports.connectDatabase = exports.tenantAwarePrisma = exports.TenantAwarePrisma = exports.prisma = void 0;
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
const tenantLogger_1 = __importDefault(require("@/utils/tenantLogger"));
dotenv_1.default.config();
// Prevent multiple instances during development hot reloads
exports.prisma = globalThis.__prisma || new client_1.PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    errorFormat: 'pretty',
});
exports.db = exports.prisma;
if (process.env.NODE_ENV !== 'production') {
    globalThis.__prisma = exports.prisma;
}
/**
 * Tenant-aware Prisma client that sets tenant context for RLS
 * OPTIMIZED: Reduces redundant context setting
 */
class TenantAwarePrisma {
    constructor() {
        this.currentTenantId = null;
        this.client = exports.prisma;
    }
    /**
     * Set tenant context for Row Level Security
     * OPTIMIZED: Only sets if tenant has changed
     */
    async setTenantContext(tenantId, force = false) {
        // Skip if already set to this tenant (unless forced)
        if (!force && this.currentTenantId === tenantId) {
            return;
        }
        try {
            await this.client.$executeRaw `
        SELECT set_config('app.current_tenant_id', ${tenantId}, true)
      `;
            this.currentTenantId = tenantId;
        }
        catch (error) {
            console.error('Failed to set tenant context:', error);
            throw error;
        }
    }
    /**
     * Get Prisma client (context should already be set by middleware)
     * DEPRECATED: Use prisma directly instead
     */
    async getClient(tenantId) {
        await this.setTenantContext(tenantId);
        return this.client;
    }
    /**
     * Execute a query with tenant context
     * DEPRECATED: Context should already be set by middleware, use prisma directly
     */
    async withTenant(tenantId, operation) {
        // Context should already be set by middleware, just execute the operation
        return await operation(this.client);
    }
    /**
     * Get raw Prisma client (use carefully - no tenant context)
     */
    getRawClient() {
        return this.client;
    }
    /**
     * Reset tenant context tracking (useful for testing)
     */
    resetContext() {
        this.currentTenantId = null;
    }
    /**
     * Close database connection
     */
    async disconnect() {
        tenantLogger_1.default.info('Disconnecting from database', {
            operation: 'DATABASE_CONNECTION',
            step: 'DISCONNECT',
            metadata: { operation: 'disconnect' }
        });
        try {
            await this.client.$disconnect();
            tenantLogger_1.default.info('Database disconnected successfully', {
                operation: 'DATABASE_CONNECTION',
                step: 'DISCONNECTED',
                metadata: { operation: 'disconnect' }
            });
        }
        catch (error) {
            tenantLogger_1.default.error('Failed to disconnect from database', {
                operation: 'DATABASE_CONNECTION',
                step: 'DISCONNECT_ERROR',
                metadata: {
                    error: {
                        message: error.message,
                        name: error.name,
                    }
                }
            });
            throw error;
        }
    }
}
exports.TenantAwarePrisma = TenantAwarePrisma;
// Singleton instance
exports.tenantAwarePrisma = new TenantAwarePrisma();
// Connection management
const connectDatabase = async () => {
    const timer = tenantLogger_1.default.startTimer();
    try {
        tenantLogger_1.default.info('Connecting to PostgreSQL database', {
            operation: 'DATABASE_CONNECTION',
            step: 'CONNECT_START',
            metadata: { operation: 'connectDatabase' }
        });
        await exports.prisma.$connect();
        console.log(Object.keys(exports.prisma));
        tenantLogger_1.default.info('PostgreSQL connected successfully', {
            operation: 'DATABASE_CONNECTION',
            step: 'CONNECTED',
            metadata: { operation: 'connectDatabase' }
        });
        // Test the connection
        await exports.prisma.$queryRaw `SELECT 1`;
        tenantLogger_1.default.info('Database connection verified', {
            operation: 'DATABASE_CONNECTION',
            step: 'VERIFIED',
            metadata: { operation: 'connectDatabase' }
        });
        timer.end('connectDatabase');
    }
    catch (error) {
        tenantLogger_1.default.error('Database connection failed', {
            operation: 'DATABASE_CONNECTION',
            step: 'CONNECT_ERROR',
            metadata: {
                error: {
                    message: error.message,
                    name: error.name,
                }
            }
        });
        timer.end('connectDatabase_failed');
        throw error;
    }
};
exports.connectDatabase = connectDatabase;
// Graceful shutdown
const disconnectDatabase = async () => {
    try {
        tenantLogger_1.default.info('Gracefully shutting down database connection', {
            operation: 'DATABASE_SHUTDOWN',
            step: 'SHUTDOWN_START',
            metadata: { operation: 'disconnectDatabase' }
        });
        await exports.prisma.$disconnect();
        tenantLogger_1.default.info('Database disconnected gracefully', {
            operation: 'DATABASE_SHUTDOWN',
            step: 'SHUTDOWN_SUCCESS',
            metadata: { operation: 'disconnectDatabase' }
        });
    }
    catch (error) {
        tenantLogger_1.default.error('Error disconnecting from database', {
            operation: 'DATABASE_SHUTDOWN',
            step: 'SHUTDOWN_ERROR',
            metadata: {
                error: {
                    message: error.message,
                    name: error.name,
                }
            }
        });
    }
};
exports.disconnectDatabase = disconnectDatabase;
exports.default = exports.prisma;
//# sourceMappingURL=database.js.map