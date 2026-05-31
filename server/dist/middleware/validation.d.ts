import { Request, Response, NextFunction } from 'express';
import { AnyZodObject } from 'zod';
/**
 * Validates request body, query, or params against a Zod schema
 */
export declare const validateRequest: (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
