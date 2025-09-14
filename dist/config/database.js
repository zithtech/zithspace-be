"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.disconnectDatabase = exports.connectDatabase = exports.tenantAwarePrisma = exports.TenantAwarePrisma = exports.prisma = void 0;
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
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
        await this.client.$executeRaw `
      SELECT set_config('app.current_tenant_id', ${tenantId}, true)
    `;
    }
    /**
     * Get Prisma client with tenant context set
     */
    async getClient(tenantId) {
        await this.setTenantContext(tenantId);
        return this.client;
    }
    /**
     * Execute a query with tenant context
     */
    async withTenant(tenantId, operation) {
        await this.setTenantContext(tenantId);
        return operation(this.client);
    }
    /**
     * Get raw Prisma client (use carefully - no tenant context)
     */
    getRawClient() {
        return this.client;
    }
    /**
     * Close database connection
     */
    async disconnect() {
        await this.client.$disconnect();
    }
}
exports.TenantAwarePrisma = TenantAwarePrisma;
// Singleton instance
exports.tenantAwarePrisma = new TenantAwarePrisma();
// Connection management
const connectDatabase = async () => {
    try {
        await exports.prisma.$connect();
        console.log('PostgreSQL connected successfully');
        // Test the connection
        await exports.prisma.$queryRaw `SELECT 1`;
        console.log('Database connection verified');
    }
    catch (error) {
        console.error('Database connection failed:', error);
        throw error;
    }
};
exports.connectDatabase = connectDatabase;
// Graceful shutdown
const disconnectDatabase = async () => {
    try {
        await exports.prisma.$disconnect();
        console.log('Database disconnected gracefully');
    }
    catch (error) {
        console.error('Error disconnecting from database:', error);
    }
};
exports.disconnectDatabase = disconnectDatabase;
exports.default = exports.prisma;
//# sourceMappingURL=database.js.map