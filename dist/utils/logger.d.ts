/**
 * Structured JSON logger for sync operations.
 * Emits JSON-formatted lines for easy parsing by log aggregators.
 */
interface LogContext {
    integrationId?: string;
    provider?: string;
    userId?: string;
    jobId?: string | number;
    [key: string]: unknown;
}
export declare const syncLogger: {
    info: (message: string, ctx?: LogContext) => void;
    warn: (message: string, ctx?: LogContext) => void;
    error: (message: string, ctx?: LogContext) => void;
    debug: (message: string, ctx?: LogContext) => void;
};
export {};
