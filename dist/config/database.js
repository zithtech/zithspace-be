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
 */
class TenantAwarePrisma {
    constructor() {
        this.client = exports.prisma;
    }
    /**
     * Set tenant context for Row Level Security
     */
    async setTenantContext(tenantId) {
        const timer = tenantLogger_1.default.startTimer();
        try {
            tenantLogger_1.default.logDatabaseOperation('setTenantContext', tenantId, {
                operation: 'DATABASE_RLS',
                step: 'SET_CONTEXT',
                tenantId,
                metadata: { operation: 'setTenantContext' }
            });
            await this.client.$executeRaw `
        SELECT set_config('app.current_tenant_id', ${tenantId}, true)
      `;
            tenantLogger_1.default.info('Tenant context set successfully', {
                operation: 'DATABASE_RLS',
                step: 'CONTEXT_SET',
                tenantId,
                metadata: { tenantId }
            });
            timer.end('setTenantContext', { tenantId });
        }
        catch (error) {
            tenantLogger_1.default.error('Failed to set tenant context', {
                operation: 'DATABASE_RLS',
                step: 'CONTEXT_SET_ERROR',
                tenantId,
                metadata: {
                    error: {
                        message: error.message,
                        name: error.name,
                    },
                    tenantId
                }
            });
            timer.end('setTenantContext_failed', { tenantId });
            throw error;
        }
    }
    /**
     * Get Prisma client with tenant context set
     */
    async getClient(tenantId) {
        tenantLogger_1.default.logDatabaseOperation('getClient', tenantId, {
            operation: 'DATABASE_CLIENT',
            step: 'GET_CLIENT',
            tenantId,
            metadata: { operation: 'getClient' }
        });
        await this.setTenantContext(tenantId);
        return this.client;
    }
    /**
     * Execute a query with tenant context
     */
    async withTenant(tenantId, operation) {
        const timer = tenantLogger_1.default.startTimer();
        try {
            tenantLogger_1.default.logDatabaseOperation('withTenant', tenantId, {
                operation: 'DATABASE_OPERATION',
                step: 'WITH_TENANT_START',
                tenantId,
                metadata: { operation: 'withTenant' }
            });
            await this.setTenantContext(tenantId);
            const result = await operation(this.client);
            tenantLogger_1.default.info('Tenant-scoped operation completed successfully', {
                operation: 'DATABASE_OPERATION',
                step: 'WITH_TENANT_SUCCESS',
                tenantId,
                metadata: { tenantId }
            });
            timer.end('withTenant', { tenantId });
            return result;
        }
        catch (error) {
            tenantLogger_1.default.error('Tenant-scoped operation failed', {
                operation: 'DATABASE_OPERATION',
                step: 'WITH_TENANT_ERROR',
                tenantId,
                metadata: {
                    error: {
                        message: error.message,
                        name: error.name,
                    },
                    tenantId
                }
            });
            timer.end('withTenant_failed', { tenantId });
            throw error;
        }
    }
    /**
     * Get raw Prisma client (use carefully - no tenant context)
     */
    getRawClient() {
        tenantLogger_1.default.warn('Raw Prisma client requested - no tenant context', {
            operation: 'DATABASE_RAW',
            step: 'GET_RAW_CLIENT',
            metadata: {
                warning: 'Raw client bypasses tenant isolation',
                operation: 'getRawClient'
            }
        });
        return this.client;
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