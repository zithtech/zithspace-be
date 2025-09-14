import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

declare global {
  var __prisma: PrismaClient | undefined;
}

// Prevent multiple instances during development hot reloads
export const prisma = globalThis.__prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  errorFormat: 'pretty',
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

/**
 * Tenant-aware Prisma client that sets tenant context for RLS
 */
export class TenantAwarePrisma {
  private client: PrismaClient;

  constructor() {
    this.client = prisma;
  }

  /**
   * Set tenant context for Row Level Security
   */
  async setTenantContext(tenantId: string): Promise<void> {
    await this.client.$executeRaw`
      SELECT set_config('app.current_tenant_id', ${tenantId}, true)
    `;
  }

  /**
   * Get Prisma client with tenant context set
   */
  async getClient(tenantId: string): Promise<PrismaClient> {
    await this.setTenantContext(tenantId);
    return this.client;
  }

  /**
   * Execute a query with tenant context
   */
  async withTenant<T>(tenantId: string, operation: (client: PrismaClient) => Promise<T>): Promise<T> {
    await this.setTenantContext(tenantId);
    return operation(this.client);
  }

  /**
   * Get raw Prisma client (use carefully - no tenant context)
   */
  getRawClient(): PrismaClient {
    return this.client;
  }

  /**
   * Close database connection
   */
  async disconnect(): Promise<void> {
    await this.client.$disconnect();
  }
}

// Singleton instance
export const tenantAwarePrisma = new TenantAwarePrisma();

// Connection management
export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log('PostgreSQL connected successfully');
    
    // Test the connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('Database connection verified');
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
};

// Graceful shutdown
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    console.log('Database disconnected gracefully');
  } catch (error) {
    console.error('Error disconnecting from database:', error);
  }
};

// Export the main client for direct use where tenant context isn't needed
export { prisma as db };

export default prisma;
