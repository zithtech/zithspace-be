"use strict";
/**
 * Structured JSON logger for sync operations.
 * Emits JSON-formatted lines for easy parsing by log aggregators.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncLogger = void 0;
function emit(level, message, ctx) {
    const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...ctx,
    });
    if (level === 'error') {
        process.stderr.write(entry + '\n');
    }
    else {
        process.stdout.write(entry + '\n');
    }
}
exports.syncLogger = {
    info: (message, ctx) => emit('info', message, ctx),
    warn: (message, ctx) => emit('warn', message, ctx),
    error: (message, ctx) => emit('error', message, ctx),
    debug: (message, ctx) => emit('debug', message, ctx),
};
//# sourceMappingURL=logger.js.map