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
export declare class TenantLogger {
    private static generateCorrelationId;
    private static getRequestContext;
    private static formatLog;
    static info(message: string, context?: TenantLogContext): void;
    static warn(message: string, context?: TenantLogContext): void;
    static error(message: string, context?: TenantLogContext): void;
    static debug(message: string, context?: TenantLogContext): void;
    static logResolutionStart(req: AuthRequest): TenantLogContext;
    static logResolutionStrategy(strategy: string, identifier: string | undefined, context: TenantLogContext): void;
    static logResolutionSuccess(tenant: any, resolvedBy: string, context: TenantLogContext): void;
    static logResolutionFailure(error: any, context: TenantLogContext): void;
    static logDatabaseOperation(operation: string, tenantId: string, context?: TenantLogContext): void;
    static logAuthTenantValidation(req: AuthRequest, success: boolean, reason?: string): void;
    static logControllerOperation(req: AuthRequest, controller: string, action: string, metadata?: Record<string, any>): void;
    static startTimer(): {
        end: (operation: string, context?: TenantLogContext) => void;
    };
    static logTenantError(error: any, req: AuthRequest, operation: string): void;
    static logMiddlewareEntry(middlewareName: string, req: AuthRequest): void;
    static logMiddlewareExit(middlewareName: string, req: AuthRequest, success?: boolean): void;
}
export default TenantLogger;
