"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotFoundError = exports.TenantError = exports.AuthorizationError = exports.AuthenticationError = exports.AppValidationError = exports.AppError = exports.ValidationError = void 0;
// ==========================================
// VALIDATION SCHEMAS
// ==========================================
class ValidationError extends Error {
    constructor(message, field) {
        super(message);
        this.field = field;
        this.statusCode = 400;
        this.code = 'VALIDATION_ERROR';
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
// ==========================================
// ERROR TYPES
// ==========================================
class AppError extends Error {
    constructor(message, statusCode = 500, code) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        this.code = code;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
class AppValidationError extends AppError {
    constructor(errors) {
        super('Validation failed', 400, 'VALIDATION_ERROR');
        this.errors = errors;
    }
}
exports.AppValidationError = AppValidationError;
class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}
exports.AuthenticationError = AuthenticationError;
class AuthorizationError extends AppError {
    constructor(message = 'Authorization failed') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}
exports.AuthorizationError = AuthorizationError;
class TenantError extends AppError {
    constructor(message = 'Tenant error') {
        super(message, 400, 'TENANT_ERROR');
    }
}
exports.TenantError = TenantError;
class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 404, 'NOT_FOUND');
    }
}
exports.NotFoundError = NotFoundError;
// Note: Prisma types will be available after running 'npx prisma generate'
// For now, we use the temporary interfaces and enums defined above
//# sourceMappingURL=index.js.map