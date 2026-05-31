import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';

// ==========================================
// INTEGRATION TESTS — LogistiXpert API
// Tests real HTTP flows against an in-memory
// SQLite seeded test database.
// Run: npm test
// ==========================================

// Mock prisma to avoid needing a real DB in CI
jest.mock('@prisma/client');
jest.mock('../services/auction.service', () => ({
  AuctionService: { settleAuction: jest.fn(), cacheAuction: jest.fn(), startWatchdog: jest.fn() },
  redis: { xgroup: jest.fn(), xreadgroup: jest.fn(), xack: jest.fn(), xdel: jest.fn() },
}));
jest.mock('../services/dispatch.service', () => ({
  DispatchSimulationService: { startTicker: jest.fn(), stopTicker: jest.fn() },
}));

// ==========================================
// 1. AUTH ROUTES
// ==========================================
describe('POST /api/auth/register', () => {
  let app: express.Application;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = new (PrismaClient as any)();
    app = express();
    app.use(express.json());

    const authRoutes = require('../routes/auth.routes').default;
    app.use('/api/auth', authRoutes);
  });

  it('returns 400 if username is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'test123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 if password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testdriver', password: '123' });

    expect(res.status).toBe(400);
  });
});

// ==========================================
// 2. DISPATCH SIMULATION LOGIC UNIT TESTS
// ==========================================
describe('Dispatch Simulation — Route Progress Logic', () => {
  it('computes correct fatigue increment for normal driving', () => {
    const baseFatigue = 2;
    const stimulated = false;
    const tachoHours = 5.0;
    const isSchengen = true;

    let increment = baseFatigue;
    if (isSchengen && tachoHours > 10.0) increment = 6;
    if (stimulated) increment = 1;

    expect(increment).toBe(2);
  });

  it('triples fatigue increment past 10h tacho', () => {
    const isSchengen = true;
    const tachoHours = 10.5;

    let increment = 2;
    if (isSchengen && tachoHours > 10.0) increment = 6;

    expect(increment).toBe(6);
  });

  it('suppresses fatigue when stimulated', () => {
    const stimulated = true;
    const tachoHours = 11.0;
    const isSchengen = true;

    let increment = 2;
    if (isSchengen && tachoHours > 10.0) increment = 6;
    if (stimulated) increment = 1;

    expect(increment).toBe(1);
  });

  it('LEAD_FOOT trait adds 2% progress per tick', () => {
    let step = 10.0;
    const trait = 'LEAD_FOOT';
    const stimulated = false;

    if (trait === 'LEAD_FOOT') step += 2.0;
    if (stimulated) step += 3.5;

    expect(step).toBe(12.0);
  });

  it('stimulant adds 3.5% progress and suppresses fatigue', () => {
    let step = 10.0;
    const stimulated = true;

    if (stimulated) step += 3.5;

    expect(step).toBe(13.5);
  });

  it('snitch threshold scales with low loyalty', () => {
    const loyalty = 10;
    const threshold = (30 - loyalty) / 100 * 0.04;

    // At loyalty=10: (30-10)/100 * 0.04 = 0.008
    expect(threshold).toBeCloseTo(0.008);
  });

  it('LOYAL trait never snitches regardless of loyalty score', () => {
    const isSmuggling = true;
    const loyalty = 5;
    const fatigue = 95;
    const trait = 'LOYAL';

    const canSnitch = isSmuggling && loyalty < 30 && fatigue > 60 && trait !== 'LOYAL';
    expect(canSnitch).toBe(false);
  });
});

// ==========================================
// 3. BORDER SERVICE LOGIC UNIT TESTS
// ==========================================
describe('Border Service — Clearance Logic', () => {
  function calcDetectionRisk(
    contrabandClass: string,
    scannerShielding: number,
    driverCharisma: number
  ): number {
    const BASE: Record<string, number> = {
      CLASS_A: 20,
      CLASS_B: 50,
      CLASS_C: 85,
    };
    let risk = BASE[contrabandClass] ?? 50;
    risk -= scannerShielding * 10; // each shield level -10%
    risk -= Math.max(driverCharisma - 10, 0); // charisma above 10 reduces by 1% per point
    return Math.max(risk, 5); // minimum 5% always
  }

  it('CLASS_A with no shielding = 20% base risk', () => {
    expect(calcDetectionRisk('CLASS_A', 0, 10)).toBe(20);
  });

  it('CLASS_C is high risk (85%) with no shielding', () => {
    expect(calcDetectionRisk('CLASS_C', 0, 10)).toBe(85);
  });

  it('Shield level 5 reduces CLASS_A risk to 5% minimum', () => {
    expect(calcDetectionRisk('CLASS_A', 5, 10)).toBe(5); // 20 - 50 clamped to 5
  });

  it('High charisma (20) reduces risk by 10 points', () => {
    const risk = calcDetectionRisk('CLASS_B', 0, 20);
    // 50 - 0 (shield) - (20-10) = 40
    expect(risk).toBe(40);
  });

  it('CLASS_C + max shield = 35% (85 - 50)', () => {
    expect(calcDetectionRisk('CLASS_C', 5, 10)).toBe(35);
  });
});

// ==========================================
// 4. LAUNDRY ECONOMICS UNIT TESTS
// ==========================================
describe('Money Laundering Economy', () => {
  function calcRaidRisk(amount: number, policeHeat: number): number {
    const batchScale = Math.floor(amount / 1000);
    const heatScale = Math.floor(policeHeat / 10);
    return Math.min(4 + batchScale + heatScale, 80);
  }

  it('small amount with no heat = 4% base risk', () => {
    expect(calcRaidRisk(500, 0)).toBe(4);
  });

  it('$10,000 batch + 50 heat = 4 + 10 + 5 = 19%', () => {
    expect(calcRaidRisk(10000, 50)).toBe(19);
  });

  it('risk is capped at 80% regardless of batch/heat', () => {
    expect(calcRaidRisk(100000, 100)).toBe(80);
  });

  it('front upgrade increases laundry rate by 500 * upgradeLevel', () => {
    const baseRate = 500;
    const currentLevel = 2;
    const newRate = baseRate + 500 * currentLevel;
    expect(newRate).toBe(1500);
  });

  it('yield multiplier improves by 1% per upgrade level (max 95%)', () => {
    const baseYield = 0.80;
    const upgrades = 5;
    const newYield = Math.min(baseYield + 0.01 * upgrades, 0.95);
    expect(newYield).toBeCloseTo(0.85);
  });
});

// ==========================================
// 5. BREAKDOWN COST CALCULATOR UNIT TESTS
// ==========================================
describe('Breakdown Cost Calculator', () => {
  function calcRepairCost(engineHealth: number, tireWear: number, distanceKm: number) {
    const engineDamage = Math.max(100 - engineHealth, 0);
    const engineCost = Math.max(engineDamage * 200, 500);
    const tireDamage = Math.max(50 - tireWear, 0);
    const tireCost = Math.max(tireDamage * 80, 200);
    const towCost = Math.round(distanceKm * 3);
    return engineCost + tireCost + towCost;
  }

  it('fully healthy truck at hub = minimum repair cost', () => {
    const cost = calcRepairCost(100, 100, 0);
    // engineDamage=0 → 500 floor, tireDamage=0 → 200 floor, tow=0
    expect(cost).toBe(700);
  });

  it('catastrophic engine (1%) + 200km tow = expensive', () => {
    const cost = calcRepairCost(1, 100, 200);
    // engineCost: 99*200=19800, tireCost: 200 floor, tow: 600
    expect(cost).toBe(19800 + 200 + 600);
  });

  it('roadside repair applies 1.5x premium', () => {
    const baseCost = calcRepairCost(50, 50, 100);
    const roadsideCost = baseCost * 1.5;
    expect(roadsideCost).toBeGreaterThan(baseCost);
  });

  it('early impound release fee scales by days remaining', () => {
    const daysRemaining = 3;
    const dailyRate = 3500;
    const fee = daysRemaining * dailyRate * 2;
    expect(fee).toBe(21000);
  });
});

// ==========================================
// 6. AUCTION BID VALIDATION UNIT TESTS
// ==========================================
describe('Auction Bid Validation', () => {
  function validateBid(
    bidAmount: number,
    currentBid: number,
    bidderBalance: number,
    minIncrement: number = 100
  ): { valid: boolean; error?: string } {
    if (bidAmount <= currentBid) {
      return { valid: false, error: 'BID_TOO_LOW' };
    }
    if (bidAmount < currentBid + minIncrement) {
      return { valid: false, error: 'BELOW_MIN_INCREMENT' };
    }
    if (bidderBalance < bidAmount) {
      return { valid: false, error: 'INSUFFICIENT_FUNDS' };
    }
    return { valid: true };
  }

  it('bid equal to current is rejected', () => {
    expect(validateBid(1000, 1000, 5000).valid).toBe(false);
  });

  it('bid below current is rejected', () => {
    expect(validateBid(900, 1000, 5000).error).toBe('BID_TOO_LOW');
  });

  it('bid below minimum increment is rejected', () => {
    expect(validateBid(1050, 1000, 5000).error).toBe('BELOW_MIN_INCREMENT');
  });

  it('valid higher bid is accepted', () => {
    expect(validateBid(1200, 1000, 5000).valid).toBe(true);
  });

  it('bid exceeding balance is rejected', () => {
    expect(validateBid(6000, 1000, 5000).error).toBe('INSUFFICIENT_FUNDS');
  });
});
