"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
/**
 * Centralized Express Error Handling Middleware
 */
function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || 500;
    const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
    const message = err.message || 'An unexpected server error occurred.';
    // Log full stack traces in development
    console.error(`[Error Middleware] Caught Exception: ${errorCode} (${statusCode}) - ${message}`);
    if (statusCode === 500) {
        console.error(err.stack);
    }
    // Handle Prisma Database specific violations
    if (err.name?.startsWith('PrismaClient')) {
        return res.status(400).json({
            error: 'DATABASE_VIOLATION',
            message: 'Database query execution failed. Relational constraints violated.',
        });
    }
    res.status(statusCode).json({
        error: errorCode,
        message: message,
    });
}
