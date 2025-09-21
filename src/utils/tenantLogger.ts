import { Request } from 'express';
import { AuthRequest } from '@/types';

export interface TenantLogContext {
  correlationId?: string;
  tenantId?: string;
  tenantSubdomain?: string;
  userId?: string;
  operation?: string;
  step?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export class TenantLogger {
  private static generateCorrelationId(): string {
    return `tenant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private static getRequestContext(req: AuthRequest): TenantLogContext {
    return {
      correlationId: req.headers['x-correlation-id'] as string || this.generateCorrelationId(),
      tenantId: req.tenantId,
      tenantSubdomain: req.tenant?.subdomain,
      userId: req.user?.id,
    };
  }

  private static formatLog(level: string, message: string, context: TenantLogContext): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      tenant: {
        id: context.tenantId,
        subdomain: context.tenantSubdomain,
      },
      user: {
        id: context.userId,
      },
      operation: context.operation,
      step: context.step,
      correlationId: context.correlationId,
      duration: context.duration,
      metadata: context.metadata,
    };

    // Filter out undefined values
    const cleanedLog = JSON.parse(JSON.stringify(logEntry));
    
    console.log(`[TENANT-${level.toUpperCase()}]`, JSON.stringify(cleanedLog, null, 2));
  }

  static info(message: string, context: TenantLogContext = {}): void {
    this.formatLog('INFO', message, context);
  }

  static warn(message: string, context: TenantLogContext = {}): void {
    this.formatLog('WARN', message, context);
  }

  static error(message: string, context: TenantLogContext = {}): void {
    this.formatLog('ERROR', message, context);
  }

  static debug(message: string, context: TenantLogContext = {}): void {
    if (process.env.NODE_ENV === 'development') {
      this.formatLog('DEBUG', message, context);
    }
  }

  // Tenant Resolution Specific Logging
  static logResolutionStart(req: AuthRequest): TenantLogContext {
    const context = this.getRequestContext(req);
    context.operation = 'TENANT_RESOLUTION';
    context.step = 'START';
    context.metadata = {
      host: req.get('Host'),
      userAgent: req.get('User-Agent'),
      headers: {
        'x-tenant-id': req.headers['x-tenant-id'],
        'x-tenant-subdomain': req.headers['x-tenant-subdomain'],
      },
      url: req.originalUrl,
      method: req.method,
    };

    this.info('Starting tenant resolution', context);
    return context;
  }

  static logResolutionStrategy(strategy: string, identifier: string | undefined, context: TenantLogContext): void {
    const strategyContext = { ...context };
    strategyContext.step = `STRATEGY_${strategy.toUpperCase()}`;
    strategyContext.metadata = {
      ...strategyContext.metadata,
      strategy,
      identifier,
      success: !!identifier,
    };

    if (identifier) {
      this.info(`Tenant resolution strategy ${strategy} succeeded`, strategyContext);
    } else {
      this.debug(`Tenant resolution strategy ${strategy} failed`, strategyContext);
    }
  }

  static logResolutionSuccess(tenant: any, resolvedBy: string, context: TenantLogContext): void {
    const successContext = { ...context };
    successContext.step = 'SUCCESS';
    successContext.tenantId = tenant.id;
    successContext.tenantSubdomain = tenant.subdomain;
    successContext.metadata = {
      ...successContext.metadata,
      resolvedBy,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        planType: tenant.planType,
        isActive: tenant.isActive,
      },
    };

    this.info('Tenant resolution completed successfully', successContext);
  }

  static logResolutionFailure(error: any, context: TenantLogContext): void {
    const failureContext = { ...context };
    failureContext.step = 'FAILURE';
    failureContext.metadata = {
      ...failureContext.metadata,
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
    };

    this.error('Tenant resolution failed', failureContext);
  }

  // Database Operations Logging
  static logDatabaseOperation(operation: string, tenantId: string, context: TenantLogContext = {}): void {
    const dbContext = { ...context };
    dbContext.operation = 'DATABASE';
    dbContext.step = operation.toUpperCase();
    dbContext.tenantId = tenantId;
    dbContext.metadata = {
      ...dbContext.metadata,
      operation,
      tenantId,
    };

    this.info(`Database operation: ${operation}`, dbContext);
  }

  // Authentication Logging
  static logAuthTenantValidation(req: AuthRequest, success: boolean, reason?: string): void {
    const context = this.getRequestContext(req);
    context.operation = 'AUTH_TENANT_VALIDATION';
    context.step = success ? 'SUCCESS' : 'FAILURE';
    context.metadata = {
      success,
      reason,
      userTenantId: req.user?.tenantId,
      requestTenantId: req.tenantId,
    };

    if (success) {
      this.info('Authentication tenant validation succeeded', context);
    } else {
      this.warn(`Authentication tenant validation failed: ${reason}`, context);
    }
  }

  // Controller Operations Logging
  static logControllerOperation(req: AuthRequest, controller: string, action: string, metadata: Record<string, any> = {}): void {
    const context = this.getRequestContext(req);
    context.operation = `CONTROLLER_${controller.toUpperCase()}`;
    context.step = action.toUpperCase();
    context.metadata = {
      ...metadata,
      controller,
      action,
      params: req.params,
      query: req.query,
    };

    this.info(`Controller operation: ${controller}.${action}`, context);
  }

  // Performance Logging
  static startTimer(): { end: (operation: string, context?: TenantLogContext) => void } {
    const startTime = Date.now();
    
    return {
      end: (operation: string, context: TenantLogContext = {}) => {
        const duration = Date.now() - startTime;
        const perfContext = { ...context };
        perfContext.operation = 'PERFORMANCE';
        perfContext.duration = duration;
        perfContext.metadata = {
          ...perfContext.metadata,
          operation,
          duration,
        };

        this.info(`Performance: ${operation} completed in ${duration}ms`, perfContext);
      }
    };
  }

  // Error Logging
  static logTenantError(error: any, req: AuthRequest, operation: string): void {
    const context = this.getRequestContext(req);
    context.operation = operation;
    context.step = 'ERROR';
    context.metadata = {
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      request: {
        url: req.originalUrl,
        method: req.method,
        headers: {
          'x-tenant-id': req.headers['x-tenant-id'],
          'x-tenant-subdomain': req.headers['x-tenant-subdomain'],
        },
      },
    };

    this.error(`Tenant error in ${operation}: ${error.message}`, context);
  }

  // Middleware Chain Logging
  static logMiddlewareEntry(middlewareName: string, req: AuthRequest): void {
    const context = this.getRequestContext(req);
    context.operation = 'MIDDLEWARE';
    context.step = `${middlewareName.toUpperCase()}_ENTRY`;
    context.metadata = {
      middleware: middlewareName,
      url: req.originalUrl,
      method: req.method,
    };

    this.debug(`Middleware entry: ${middlewareName}`, context);
  }

  static logMiddlewareExit(middlewareName: string, req: AuthRequest, success: boolean = true): void {
    const context = this.getRequestContext(req);
    context.operation = 'MIDDLEWARE';
    context.step = `${middlewareName.toUpperCase()}_EXIT`;
    context.metadata = {
      middleware: middlewareName,
      success,
      tenantResolved: !!req.tenantId,
    };

    this.debug(`Middleware exit: ${middlewareName}`, context);
  }
}

export default TenantLogger;
