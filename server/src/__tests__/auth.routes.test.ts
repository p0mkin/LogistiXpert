// Set env var before any imports
process.env.FORCE_SEED_SECRET = 'test-secret-123';

import request from 'supertest';
import express from 'express';
import authRoutes from '../routes/auth.routes';
import { CONFIG } from '../config';

// Mock seed database to avoid actual DB calls during route testing
jest.mock('../seed', () => ({
  seedDatabase: jest.fn().mockResolvedValue(true),
}));

// Mock PrismaClient to avoid initializing a real connection
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      $disconnect: jest.fn(),
    })),
  };
});

describe('Auth Routes - /force-seed', () => {
  let app: express.Application;
  let originalEnv: string | undefined;

  beforeAll(() => {
    // Setup simple express app for testing the route
    app = express();
    app.use(express.json());
    app.use('/auth', authRoutes);

    // Store original NODE_ENV
    originalEnv = process.env.NODE_ENV;
  });

  afterAll(() => {
    // Restore original NODE_ENV
    if (originalEnv !== undefined) {
      process.env.NODE_ENV = originalEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Production Environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should return 403 Forbidden even with correct secret via body', async () => {
      const response = await request(app)
        .post('/auth/force-seed')
        .send({ secretKey: CONFIG.FORCE_SEED_SECRET });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('FORBIDDEN');
      expect(response.body.message).toBe('Endpoint disabled in production.');
    });

    it('should return 403 Forbidden even with correct secret via header', async () => {
      const response = await request(app)
        .post('/auth/force-seed')
        .set('x-seed-secret', CONFIG.FORCE_SEED_SECRET as string)
        .send();

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('FORBIDDEN');
      expect(response.body.message).toBe('Endpoint disabled in production.');
    });
  });

  describe('Non-Production Environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should return 403 Forbidden with no secret', async () => {
      const response = await request(app)
        .post('/auth/force-seed')
        .send();

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('FORBIDDEN');
      expect(response.body.message).toBe('Invalid secret key.');
    });

    it('should return 403 Forbidden with invalid secret via body', async () => {
      const response = await request(app)
        .post('/auth/force-seed')
        .send({ secretKey: 'wrong-secret' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('FORBIDDEN');
      expect(response.body.message).toBe('Invalid secret key.');
    });

    it('should return 403 Forbidden with invalid secret via header', async () => {
      const response = await request(app)
        .post('/auth/force-seed')
        .set('x-seed-secret', 'wrong-secret')
        .send();

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('FORBIDDEN');
      expect(response.body.message).toBe('Invalid secret key.');
    });

    it('should succeed with valid secret via body', async () => {
      const response = await request(app)
        .post('/auth/force-seed')
        .send({ secretKey: CONFIG.FORCE_SEED_SECRET });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Database successfully forced to re-seed!');
    });

    it('should succeed with valid secret via header', async () => {
      const response = await request(app)
        .post('/auth/force-seed')
        .set('x-seed-secret', CONFIG.FORCE_SEED_SECRET as string)
        .send();

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Database successfully forced to re-seed!');
    });
  });
});
