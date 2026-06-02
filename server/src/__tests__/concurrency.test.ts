import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import financeRoutes from '../routes/finance.routes';
import { LockService } from '../services/lock.service';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config';

// Create a Mock Decimal constructor matching the expected schema structure
class MockDecimal {
  constructor(public val: number) {}
  toNumber() { return this.val; }
  toString() { return this.val.toString(); }
}
const Decimal = (val: number) => new MockDecimal(val);

// Let's control the mock latency of Prisma calls to simulate concurrency
let mockPrismaDelayMs = 0;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

jest.mock('@prisma/client', () => {
  class MockDecimal {
    constructor(public val: number) {}
    toNumber() { return this.val; }
    toString() { return this.val.toString(); }
  }

  const mPrisma: any = {
    company: {
      findUnique: jest.fn(async () => {
        if (mockPrismaDelayMs > 0) {
          await delay(mockPrismaDelayMs);
        }
        return {
          id: 'comp_abc',
          legalBalance: new MockDecimal(100000.00),
          blackMarketBalance: new MockDecimal(50000.00),
          activeDebtPrincipal: new MockDecimal(0.00),
          activeDebtInterest: 12.0,
          reputationScore: 100,
          marketingRepBoost: 0,
          isPublic: true,
          totalShares: 100000,
          clanId: null,
          garages: [{ upgradeLevel: 1, terminalLevel: 0 }],
          trucks: [],
          fronts: [],
          goldStock: 0,
          resTerminalLogistics: 0,
          resAerodynamics: 0,
          resAdvancedPacking: 0,
          resECURemapping: 0,
          resCoopCapacity: 0,
        };
      }),
      update: jest.fn(async () => {
        if (mockPrismaDelayMs > 0) {
          await delay(mockPrismaDelayMs);
        }
        return {
          id: 'comp_abc',
          legalBalance: new MockDecimal(100000.00),
          blackMarketBalance: new MockDecimal(50000.00),
          activeDebtPrincipal: new MockDecimal(0.00),
          activeDebtInterest: 12.0,
        };
      }),
    },
    companyShare: {
      findUnique: jest.fn(async () => {
        if (mockPrismaDelayMs > 0) {
          await delay(mockPrismaDelayMs);
        }
        return null;
      }),
      upsert: jest.fn(async () => {
        if (mockPrismaDelayMs > 0) {
          await delay(mockPrismaDelayMs);
        }
        return {};
      }),
    },
    $transaction: jest.fn(async (cb: any) => {
      if (mockPrismaDelayMs > 0) {
        await delay(mockPrismaDelayMs);
      }
      return cb(mPrisma);
    }),
  };

  const Prisma = {
    Decimal: MockDecimal
  };

  return {
    PrismaClient: jest.fn(() => mPrisma),
    Prisma,
    Jurisdiction: {
      SCANDINAVIA: 'SCANDINAVIA',
      GERMANY: 'GERMANY',
      BALTICS: 'BALTICS',
      BELARUS: 'BELARUS',
    },
  };
});

const prisma = new PrismaClient() as any;

// Setup express app with only finance routes for targeted lock isolation testing
const app = express();
app.use(express.json());
app.use('/api/finance', financeRoutes);

const generateTestToken = () => {
  return jwt.sign({ id: 'usr_abc', username: 'concurrency_tester', companyId: 'comp_abc' }, CONFIG.JWT_SECRET, { expiresIn: '1h' });
};

describe('⚡ Phase 18: Concurrency Race-Condition and Transaction Lock Boundary Tests', () => {
  const token = generateTestToken();

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaDelayMs = 0;
    // Release any lingering locks from prior tests
    LockService.release('company:finance:comp_abc');
  });

  afterEach(() => {
    LockService.release('company:finance:comp_abc');
  });

  // ==========================================================================
  // 1. DUAL PARALLEL BORROW LOAN CONCURRENCY LOCK TEST
  // ==========================================================================
  it('Should successfully process the first borrow request, but abort the second concurrent request with 409/500 lock conflict', async () => {
    // Add artificial delay to Prisma calls to allow the race condition to occur in flight
    mockPrismaDelayMs = 150;

    // Send two concurrent requests to the borrow loan route
    const req1 = request(app)
      .post('/api/finance/loans/borrow')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 5000 });

    const req2 = request(app)
      .post('/api/finance/loans/borrow')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 10000 });

    // Await both concurrent parallel requests
    const [res1, res2] = await Promise.all([req1, req2]);

    // One of them must succeed (200 OK) and the other must be rejected due to lock collision
    const successRes = res1.statusCode === 200 ? res1 : res2;
    const conflictRes = res1.statusCode === 200 ? res2 : res1;

    expect(successRes.statusCode).toBe(200);
    expect(successRes.body.message).toContain('FINANCING APPROVED: Borrowed $');

    // Express router catches LockService's HttpError and wraps it in a 500 (or custom error handler if configured)
    expect([409, 500]).toContain(conflictRes.statusCode);
    expect(conflictRes.body.message).toContain('Another member of your corporate co-op is currently performing a conflicting operation');
  });

  // ==========================================================================
  // 2. DUAL PARALLEL STOCK TRADING CONCURRENCY LOCK TEST
  // ==========================================================================
  it('Should successfully complete the first share trade, but block the second concurrent trade on the same company', async () => {
    // Add artificial delay to Prisma calls
    mockPrismaDelayMs = 150;

    // Send two concurrent trade requests
    const req1 = request(app)
      .post('/api/finance/trade')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetCompanyId: 'comp_xyz',
        action: 'BUY',
        sharesAmount: 100,
      });

    const req2 = request(app)
      .post('/api/finance/trade')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetCompanyId: 'comp_xyz',
        action: 'BUY',
        sharesAmount: 200,
      });

    // Await both concurrent requests
    const [res1, res2] = await Promise.all([req1, req2]);

    // One of them must succeed and the other must be locked out
    const successRes = res1.statusCode === 200 ? res1 : res2;
    const conflictRes = res1.statusCode === 200 ? res2 : res1;

    expect(successRes.statusCode).toBe(200);
    expect(successRes.body.message).toContain('SUCCESS: Purchased');

    expect([409, 500]).toContain(conflictRes.statusCode);
    expect(conflictRes.body.message).toContain('Another member of your corporate co-op is currently performing a conflicting operation');
  });
});
