import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest } from '../middleware/validation';

describe('Validation Middleware', () => {
  it('should strip extra properties and coerce data according to schema', async () => {
    // Schema defines exactly what we expect
    const schema = z.object({
      body: z.object({
        username: z.string(),
        age: z.coerce.number(), // Test coercion
      }).strict(), // Ensure no extra fields are allowed by the schema itself, though validateRequest will strip them if not strict but reassigned.
      // Alternatively, if not strict, the parser drops extra fields, and our reassignment passes those dropped fields.
      query: z.object({}).optional(),
      params: z.object({}).optional()
    });

    // Actually, z.object strips extra fields by default!
    const schemaNonStrict = z.object({
      body: z.object({
        username: z.string(),
        age: z.coerce.number()
      }),
      query: z.object({}),
      params: z.object({})
    });

    const req = {
      body: {
        username: 'testuser',
        age: '25', // Should be coerced to number 25
        isSuperAdmin: true // Should be stripped
      },
      query: {},
      params: {}
    } as unknown as Request;

    const res = {} as Response;
    const next = jest.fn() as NextFunction;

    const middleware = validateRequest(schemaNonStrict);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();

    // Verify it stripped the unwanted field and coerced the number
    expect(req.body).toEqual({
      username: 'testuser',
      age: 25
    });

    // Verify prototype pollution fields are gone
    expect(req.body.isSuperAdmin).toBeUndefined();
  });
});
