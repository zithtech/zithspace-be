import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import TenantLogger from '@/utils/tenantLogger';

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
    const timer = TenantLogger.startTimer();
    
    try {
      TenantLogger.logDatabaseOperation('setTenantContext', tenantId, {
        operation: 'DATABASE_RLS',
        step: 'SET_CONTEXT',
        tenantId,
        metadata: { operation: 'setTenantContext' }
      });

      await this.client.$executeRaw`
        SELECT set_config('app.current_tenant_id', ${tenantId}, true)
      `;

      TenantLogger.info('Tenant context set successfully', {
        operation: 'DATABASE_RLS',
        step: 'CONTEXT_SET',
        tenantId,
        metadata: { tenantId }
      });

      timer.end('setTenantContext', { tenantId });
    } catch (error) {
      TenantLogger.error('Failed to set tenant context', {
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
  async getClient(tenantId: string): Promise<PrismaClient> {
    TenantLogger.logDatabaseOperation('getClient', tenantId, {
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
  async withTenant<T>(tenantId: string, operation: (client: PrismaClient) => Promise<T>): Promise<T> {
    const timer = TenantLogger.startTimer();
    
    try {
      TenantLogger.logDatabaseOperation('withTenant', tenantId, {
        operation: 'DATABASE_OPERATION',
        step: 'WITH_TENANT_START',
        tenantId,
        metadata: { operation: 'withTenant' }
      });

      await this.setTenantContext(tenantId);
      const result = await operation(this.client);

      TenantLogger.info('Tenant-scoped operation completed successfully', {
        operation: 'DATABASE_OPERATION',
        step: 'WITH_TENANT_SUCCESS',
        tenantId,
        metadata: { tenantId }
      });

      timer.end('withTenant', { tenantId });
      return result;
    } catch (error) {
      TenantLogger.error('Tenant-scoped operation failed', {
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
  getRawClient(): PrismaClient {
    TenantLogger.warn('Raw Prisma client requested - no tenant context', {
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
  async disconnect(): Promise<void> {
    TenantLogger.info('Disconnecting from database', {
      operation: 'DATABASE_CONNECTION',
      step: 'DISCONNECT',
      metadata: { operation: 'disconnect' }
    });

    try {
      await this.client.$disconnect();
      TenantLogger.info('Database disconnected successfully', {
        operation: 'DATABASE_CONNECTION',
        step: 'DISCONNECTED',
        metadata: { operation: 'disconnect' }
      });
    } catch (error) {
      TenantLogger.error('Failed to disconnect from database', {
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

// Singleton instance
export const tenantAwarePrisma = new TenantAwarePrisma();

// Connection management
export const connectDatabase = async (): Promise<void> => {
  const timer = TenantLogger.startTimer();
  
  try {
    TenantLogger.info('Connecting to PostgreSQL database', {
      operation: 'DATABASE_CONNECTION',
      step: 'CONNECT_START',
      metadata: { operation: 'connectDatabase' }
    });

    
    await prisma.$connect();
    console.log(Object.keys(prisma));
    TenantLogger.info('PostgreSQL connected successfully', {
      operation: 'DATABASE_CONNECTION',
      step: 'CONNECTED',
      metadata: { operation: 'connectDatabase' }
    });
    
    // Test the connection
    await prisma.$queryRaw`SELECT 1`;
    TenantLogger.info('Database connection verified', {
      operation: 'DATABASE_CONNECTION',
      step: 'VERIFIED',
      metadata: { operation: 'connectDatabase' }
    });

    timer.end('connectDatabase');
  } catch (error) {
    TenantLogger.error('Database connection failed', {
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

// Graceful shutdown
export const disconnectDatabase = async (): Promise<void> => {
  try {
    TenantLogger.info('Gracefully shutting down database connection', {
      operation: 'DATABASE_SHUTDOWN',
      step: 'SHUTDOWN_START',
      metadata: { operation: 'disconnectDatabase' }
    });

    await prisma.$disconnect();
    TenantLogger.info('Database disconnected gracefully', {
      operation: 'DATABASE_SHUTDOWN',
      step: 'SHUTDOWN_SUCCESS',
      metadata: { operation: 'disconnectDatabase' }
    });
  } catch (error) {
    TenantLogger.error('Error disconnecting from database', {
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

// Export the main client for direct use where tenant context isn't needed
export { prisma as db };

export default prisma;
