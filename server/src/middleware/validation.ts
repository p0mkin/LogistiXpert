import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

/**
 * Validates request body, query, or params against a Zod schema
 */
export const validateRequest = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Reassign the sanitized data back to the request to strip unexpected fields
      req.body = validatedData.body;
      req.query = validatedData.query;
      req.params = validatedData.params;

      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'VALIDATION_FAILED',
          message: 'Invalid request parameters.',
          details: error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Validation process failed.' });
    }
  };
};
