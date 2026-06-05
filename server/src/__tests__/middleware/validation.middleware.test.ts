import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validation';

describe('Validation Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      params: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    next = jest.fn();
  });

  const schema = z.object({
    body: z.object({
      name: z.string(),
      age: z.number().optional(),
    }).optional(),
    query: z.object({
      search: z.string().optional(),
    }).optional(),
    params: z.object({
      id: z.string().optional(),
    }).optional(),
  });

  it('should call next() if validation passes', async () => {
    req.body = { name: 'Test' };

    const middleware = validateRequest(schema);
    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('should return 400 if validation fails with ZodError', async () => {
    req.body = { age: 'not_a_number' }; // missing required 'name' and wrong type for 'age'

    const middleware = validateRequest(schema);
    await middleware(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'VALIDATION_FAILED',
      message: 'Invalid request parameters.',
      details: expect.arrayContaining([
        expect.objectContaining({
          field: expect.stringContaining('body.name'),
        })
      ]),
    });
  });

  it('should handle mixed sources (body, query, params) successfully', async () => {
    req.body = { name: 'Test' };
    req.query = { search: 'keyword' };
    req.params = { id: '123' };

    const middleware = validateRequest(schema);
    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ name: 'Test' });
    expect(req.query).toEqual({ search: 'keyword' });
    expect(req.params).toEqual({ id: '123' });
  });

  it('should strip unrecognized fields from the payload', async () => {
    req.body = { name: 'Test', isSuperAdmin: true, unknownField: 'foo' };

    const middleware = validateRequest(schema);
    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ name: 'Test' }); // Unrecognized fields stripped
  });

  it('should handle type coercion correctly', async () => {
    const coercionSchema = z.object({
      body: z.object({
        weight: z.coerce.number(),
      })
    });

    req.body = { weight: '4500' };

    const middleware = validateRequest(coercionSchema);
    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.weight).toBe(4500); // String '4500' coerced to number 4500
    expect(typeof req.body.weight).toBe('number');
  });

  it('should return 500 if an unexpected error occurs during parsing', async () => {
    const errorSchema = z.object({
      body: z.object({
        name: z.string()
      })
    });

    // Mock parseAsync to throw a generic Error instead of a ZodError
    jest.spyOn(errorSchema, 'parseAsync').mockRejectedValue(new Error('Unexpected error'));

    const middleware = validateRequest(errorSchema);
    await middleware(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'SERVER_ERROR',
      message: 'Validation process failed.',
    });
  });
});
