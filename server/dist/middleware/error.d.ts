import { Request, Response, NextFunction } from 'express';
export interface AppError extends Error {
    statusCode?: number;
    code?: string;
}
/**
 * Centralized Express Error Handling Middleware
 */
export declare function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
