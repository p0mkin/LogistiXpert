import request from 'supertest';
import express from 'express';
import analyticsRoutes from '../routes/analytics.routes';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

jest.mock('@prisma/client', () => {
  const mockPrisma = {
    company: {
      findUnique: jest.fn().mockResolvedValue({ reputationScore: 50 }),
    },
    garage: {
      findFirst: jest.fn().mockResolvedValue({ terminalLevel: 2 }),
      findMany: jest.fn().mockResolvedValue([{ city: 'Stockholm', terminalLevel: 2 }]),
    },
    cityDailyFreight: {
      findUnique: jest.fn().mockResolvedValue({ shippedKg: 1000 }),
      findMany: jest.fn().mockResolvedValue([{ city: 'Stockholm', shippedKg: 1000 }]),
    },
    dailyPerformanceReport: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    terminalDailyReport: {
      findMany: jest.fn().mockResolvedValue([]),
    }
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

const app = express();
app.use(express.json());

// Mock Auth Middleware
app.use((req: any, res: any, next: any) => {
  req.user = { id: 'user-1', companyId: 'company-1' };
  next();
});

app.use('/api/analytics', analyticsRoutes);

describe('Performance Benchmark: /api/analytics/city-freight', () => {
  it('measures response time', async () => {
    // Warm up
    await request(app).get('/api/analytics/city-freight');

    const iters = 50;
    const start = performance.now();
    for (let i = 0; i < iters; i++) {
      await request(app).get('/api/analytics/city-freight');
    }
    const end = performance.now();

    console.log(`Original route implementation (${iters} iterations): ${(end - start).toFixed(2)} ms`);
    console.log(`Average per request: ${((end - start)/iters).toFixed(2)} ms`);

    // Assert to ensure the test passes
    expect(true).toBe(true);
  });
});
