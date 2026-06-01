import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export class HttpError extends Error implements AppError {
  statusCode: number;
  code: string;

  constructor(statusCode: number, message: string, code: string = 'HTTP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'HttpError';
  }
}

/**
 * Centralized Express Error Handling Middleware
 */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
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
