/**
 * Structured JSON logger for sync operations.
 * Emits JSON-formatted lines for easy parsing by log aggregators.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
    integrationId?: string;
    provider?: string;
    userId?: string;
    jobId?: string | number;
    [key: string]: unknown;
}

function emit(level: LogLevel, message: string, ctx?: LogContext) {
    const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...ctx,
    });

    if (level === 'error') {
        process.stderr.write(entry + '\n');
    } else {
        process.stdout.write(entry + '\n');
    }
}

export const syncLogger = {
    info: (message: string, ctx?: LogContext) => emit('info', message, ctx),
    warn: (message: string, ctx?: LogContext) => emit('warn', message, ctx),
    error: (message: string, ctx?: LogContext) => emit('error', message, ctx),
    debug: (message: string, ctx?: LogContext) => emit('debug', message, ctx),
};
