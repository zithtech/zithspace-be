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
 * OPTIMIZED: Reduces redundant context setting
 */
export class TenantAwarePrisma {
  private client: PrismaClient;
  private currentTenantId: string | null = null;

  constructor() {
    this.client = prisma;
  }

  /**
   * Set tenant context for Row Level Security
   * OPTIMIZED: Only sets if tenant has changed
   */
  async setTenantContext(tenantId: string, force: boolean = false): Promise<void> {
    // Skip if already set to this tenant (unless forced)
    if (!force && this.currentTenantId === tenantId) {
      return;
    }

    try {
      await this.client.$executeRaw`
        SELECT set_config('app.current_tenant_id', ${tenantId}, true)
      `;

      this.currentTenantId = tenantId;
    } catch (error) {
      console.error('Failed to set tenant context:', error);
      throw error;
    }
  }

  /**
   * Get Prisma client (context should already be set by middleware)
   * DEPRECATED: Use prisma directly instead
   */
  async getClient(tenantId: string): Promise<PrismaClient> {
    await this.setTenantContext(tenantId);
    return this.client;
  }

  /**
   * Execute a query with tenant context
   * DEPRECATED: Context should already be set by middleware, use prisma directly
   */
  async withTenant<T>(tenantId: string, operation: (client: PrismaClient) => Promise<T>): Promise<T> {
    // Context should already be set by middleware, just execute the operation
    return await operation(this.client);
  }

  /**
   * Get raw Prisma client (use carefully - no tenant context)
   */
  getRawClient(): PrismaClient {
    return this.client;
  }

  /**
   * Reset tenant context tracking (useful for testing)
   */
  resetContext(): void {
    this.currentTenantId = null;
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
