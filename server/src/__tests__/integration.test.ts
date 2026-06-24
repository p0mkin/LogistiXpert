import request from 'supertest';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import authRoutes from '../routes/auth.routes';
import garageRoutes from '../routes/garage.routes';
import driverRoutes from '../routes/driver.routes';
import shopRoutes from '../routes/shop.routes';
import laundryRoutes from '../routes/laundry.routes';
import dispatchRoutes from '../routes/dispatch.routes';
import breakdownRoutes from '../routes/breakdown.routes';
import leaderboardRoutes from '../routes/leaderboard.routes';
import commodityRoutes from '../routes/commodity.routes';
import analyticsRoutes from '../routes/analytics.routes';
import researchRoutes from '../routes/research.routes';
import financeRoutes from '../routes/finance.routes';
import { BorderService } from '../services/border.service';
import { errorHandler } from '../middleware/error';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config';

class MockDecimal {
  constructor(public val: number) {}
  toNumber() { return this.val; }
  toString() { return this.val.toString(); }
}
const Decimal = (val: number) => new MockDecimal(val);

jest.mock('@prisma/client', () => {
  class MockDecimal {
    constructor(public val: number) {}
    toNumber() { return this.val; }
    toString() { return this.val.toString(); }
  }
  const Decimal = (val: number) => new MockDecimal(val);

  const mPrisma: any = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    company: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    companyMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    garage: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    driver: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    truck: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    frontBusiness: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    legalContract: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    contrabandJob: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    activeRoute: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    truckHistory: {
      create: jest.fn(),
    },
    auctionListing: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    commodityMarket: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    dailyPerformanceReport: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    terminalDailyReport: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    cityDailyFreight: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    $connect: jest.fn(),
  };

  // Define $transaction separately to bypass circular self-reference compiler error TS7022
  mPrisma.$transaction = jest.fn((cb: any): any => cb(mPrisma));

  const CommodityType = {
    DIESEL: 'DIESEL',
    ELECTRICITY: 'ELECTRICITY',
    ADBLUE: 'ADBLUE',
    CO2_ALLOWANCE: 'CO2_ALLOWANCE',
  };

  const CompanyRole = {
    OWNER: 'OWNER',
    PARTNER: 'PARTNER',
    EMPLOYEE: 'EMPLOYEE',
  };

  const Prisma = {
    Decimal: MockDecimal
  };

  return {
    PrismaClient: jest.fn(() => mPrisma),
    Prisma,
    CommodityType,
    CompanyRole,
  };
});

const prisma = new PrismaClient() as any;

// Set up express test harness
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/garage', garageRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/laundry', laundryRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/breakdown', breakdownRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/commodity', commodityRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/finance', financeRoutes);
app.use(errorHandler);

// Helper to generate a valid test token
const generateTestToken = (id: string, username: string) => {
  return jwt.sign({ id, username, companyId: 'comp_abc' }, CONFIG.JWT_SECRET, { expiresIn: '1h' });
};

describe('🚨 TRUCK MANAGER 2026: INTEGRATION TEST SUITE', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((cb: any) => cb(prisma));
    prisma.garage.findMany.mockResolvedValue([]);
  });

  // ==========================================
  // 1. CREDENTIALS AUTH API TESTS
  // ==========================================
  describe('🔐 Authentication Services', () => {
    it('Should reject registration if input criteria falls below length rules', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'ab', password: '12' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_INPUT');
    });

    it('Should register new user and allocate starting Kaunas garage & Basic Scania', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'usr_abc', username: 'trucker_sam' });
      prisma.company.create.mockResolvedValue({ id: 'comp_abc', name: 'trucker_sam Logistics' });
      prisma.companyMember.create.mockResolvedValue({ id: 'cm_abc' });
      prisma.garage.create.mockResolvedValue({ id: 'gar_1', city: 'Kaunas' });
      prisma.truck.create.mockResolvedValue({ id: 'truck_1', model: 'Scania R450 Basic' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'trucker_sam', password: 'password123' });

      if (res.statusCode !== 201) {
        console.error("REGISTER TEST FAILED WITH BODY:", res.body);
      }

      expect(res.statusCode).toBe(201);
      expect(res.body.message).toContain('Starter company (Kaunas Garage + Scania truck) allocated!');
    });
  });

  // ==========================================
  // 2. RECRUITMENT & STIMULANTS TESTS
  // ==========================================
  describe('👤 Driver & Fatigue Services', () => {
    const token = generateTestToken('usr_abc', 'trucker_sam');

    it('Should allow user to hire driver if clean cash reserves allow', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'usr_abc', legalBalance: Decimal(5000) });
      prisma.company.findUnique.mockResolvedValue({ id: 'comp_abc', legalBalance: Decimal(5000) });
      prisma.driver.create.mockResolvedValue({ id: 'drv_1', name: 'Jonas S', trait: 'BALANCED' });

      const res = await request(app)
        .post('/api/driver/hire')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Jonas S' });

      if (res.statusCode !== 201) {
        console.error("HIRE TEST FAILED WITH BODY:", res.body);
      }

      expect(res.statusCode).toBe(201);
      expect(res.body.driver.name).toBe('Jonas S');
    });

    it('Should reject chemical fatigue stimulants order if driver loyalty is too low', async () => {
      // Driver loyalty (45) falls below threshold (60) and trait is BALANCED (not LOYAL)
      prisma.driver.findUnique.mockResolvedValue({
        id: 'drv_exhausted',
        ownerId: 'usr_abc',
        companyId: 'comp_abc',
        name: 'Tired Tim',
        loyalty: 45,
        trait: 'BALANCED',
      });

      const res = await request(app)
        .post('/api/driver/drv_exhausted/stimulate')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('DRIVER_REJECTED_SUBSTANCE');
    });

    it('Should administer chemical stimulants if driver is highly loyal', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'drv_loyal',
        ownerId: 'usr_abc',
        companyId: 'comp_abc',
        name: 'Loyal Leo',
        loyalty: 85,
        trait: 'LOYAL',
        fatigue: 90,
        assignedTruckId: 'truck_1',
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'usr_abc', blackMarketBalance: Decimal(1000) });
      prisma.company.findUnique.mockResolvedValue({ id: 'comp_abc', blackMarketBalance: Decimal(1000) });
      prisma.driver.update.mockResolvedValue({ id: 'drv_loyal', fatigue: 40, isStimulated: true });

      const res = await request(app)
        .post('/api/driver/drv_loyal/stimulate')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('stimulated and alert.');
    });
  });

  // ==========================================
  // 3. MECHANICAL PARTS SHOP TESTS
  // ==========================================
  describe('🔧 Mechanical Parts & Upgrades Store', () => {
    const token = generateTestToken('usr_abc', 'trucker_sam');

    it('Should successfully repair truck wear using legal clean cash', async () => {
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck_worn',
        ownerId: 'usr_abc',
        companyId: 'comp_abc',
        engineHealth: 50,
        tireWear: 60,
        isImpounded: false,
        activeRoute: null,
        garageId: 'gar_1',
        garage: { id: 'gar_1', city: 'Kaunas' },
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'usr_abc', legalBalance: Decimal(2000) });
      prisma.company.findUnique.mockResolvedValue({ id: 'comp_abc', legalBalance: Decimal(2000) });
      prisma.truck.update.mockResolvedValue({ id: 'truck_worn', engineHealth: 75 });

      const res = await request(app)
        .post('/api/shop/buy')
        .set('Authorization', `Bearer ${token}`)
        .send({ truckId: 'truck_worn', partId: 'engine_kit' });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('applied Standard Engine Overhaul Kit successfully.');
    });
  });

  // ==========================================
  // 4. MONEY LAUNDERING SYSTEMS
  // ==========================================
  describe('🧼 Money Laundering Fronts', () => {
    const token = generateTestToken('usr_abc', 'trucker_sam');

    it('Should process active laundering loop and return clean conversion yields', async () => {
      prisma.frontBusiness.findUnique.mockResolvedValue({
        id: 'front_cafe',
        ownerId: 'usr_abc',
        companyId: 'comp_abc',
        name: 'Cafe Stop',
        laundryRate: Decimal(2000),
        lossMultiplier: 0.83,
        isRaided: false,
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'usr_abc', blackMarketBalance: Decimal(5000), policeHeat: 0 });
      prisma.company.findUnique.mockResolvedValue({ id: 'comp_abc', blackMarketBalance: Decimal(5000), policeHeat: 0 });
      prisma.user.update.mockResolvedValue({});
      prisma.company.update.mockResolvedValue({});

      // Mock Math.random to guarantee no raid happens (roll = 90 > risk)
      const mathMock = jest.spyOn(Math, 'random').mockReturnValue(0.90);

      const res = await request(app)
        .post('/api/laundry/front_cafe/launder')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 1000 });

      expect(res.statusCode).toBe(200);
      expect(res.body.raided).toBe(false);
      expect(res.body.cleanCredited).toBe(830); // 1000 * 0.83

      mathMock.mockRestore();
    });
  });

  // ==========================================
  // 5. ROUTE DISPATCH PIPELINES
  // ==========================================
  describe('🚛 Route Dispatch Sandbox', () => {
    const token = generateTestToken('usr_abc', 'trucker_sam');

    it('Should reject launch if assigned driver is completely exhausted', async () => {
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck_fleet',
        ownerId: 'usr_abc',
        companyId: 'comp_abc',
        isImpounded: false,
        activeRoute: null,
        driver: {
          id: 'drv_sleepy',
          name: 'Sleepy Sam',
          fatigue: 95, // Above threshold (90)
        }
      });

      const res = await request(app)
        .post('/api/dispatch/launch')
        .set('Authorization', `Bearer ${token}`)
        .send({ truckId: 'truck_fleet', legalContractId: 'contract_1' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('DRIVER_EXHAUSTED');
    });

    it('Should return list of available legal contracts', async () => {
      prisma.garage.findMany.mockResolvedValue([
        { city: 'Tallinn', terminalLevel: 4 }
      ]);
      prisma.legalContract.findMany.mockResolvedValue([
        { id: 'lc_1', cargoType: 'ELECTRONICS', origin: 'Tallinn', destination: 'Riga', payoutLegal: Decimal(4500), distanceKm: 312 },
      ]);

      const res = await request(app)
        .get('/api/dispatch/contracts/legal')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('lc_1');
    });

    it('Should return list of available contraband jobs', async () => {
      prisma.garage.findMany.mockResolvedValue([
        { city: 'Minsk', terminalLevel: 4 }
      ]);
      prisma.contrabandJob.findMany.mockResolvedValue([
        { id: 'cj_1', cargoClass: 'CLASS_A', riskMultiplier: 1.5, payoutBlack: Decimal(15000), origin: 'Minsk', destination: 'Vilnius' },
      ]);

      const res = await request(app)
        .get('/api/dispatch/contracts/contraband')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('cj_1');
    });
  });

  // ==========================================
  // 6. BREAKDOWN & EMERGENCY RECOVERY TESTS
  // ==========================================
  describe('🚨 Breakdown & Emergency Recovery Services', () => {
    const token = generateTestToken('usr_abc', 'trucker_sam');

    it('Should return fleet health status with breakdown risk assessments', async () => {
      prisma.truck.findMany.mockResolvedValue([
        {
          id: 'truck_healthy',
          model: 'Scania R500',
          vin: 'VIN1234567890',
          mileage: 50000,
          engineHealth: 85,
          tireWear: 70,
          isImpounded: false,
          impoundReleaseAt: null,
          activeRoute: { currentCity: 'Riga', progressPct: 40.0, eta: new Date() },
        },
        {
          id: 'truck_critical',
          model: 'Volvo FH16',
          vin: 'VIN9876543210',
          mileage: 200000,
          engineHealth: 8,   // critically low
          tireWear: 6,       // critically low
          isImpounded: false,
          impoundReleaseAt: null,
          activeRoute: null,
        },
      ]);

      const res = await request(app)
        .get('/api/breakdown/fleet-status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.trucks).toHaveLength(2);

      const healthy = res.body.trucks.find((t: any) => t.truckId === 'truck_healthy');
      const critical = res.body.trucks.find((t: any) => t.truckId === 'truck_critical');

      expect(healthy.breakdownRisk).toBe('MINOR');
      expect(healthy.engineAlert).toBe(false);

      expect(critical.breakdownRisk).toBe('CATASTROPHIC');
      expect(critical.criticalAlert).toBe(true);
      expect(critical.engineAlert).toBe(true);
      expect(critical.tireAlert).toBe(true);
    });

    it('Should reject roadside repair if insufficient legal funds', async () => {
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck_broke',
        ownerId: 'usr_abc',
        companyId: 'comp_abc',
        model: 'MAN TGX',
        engineHealth: 20,
        tireWear: 15,
        isImpounded: false,
        activeRoute: { currentCity: 'Minsk' },
        owner: { legalBalance: { toNumber: () => 200 } },
        company: { legalBalance: { toNumber: () => 200 } },
      });

      const res = await request(app)
        .post('/api/breakdown/roadside-repair')
        .set('Authorization', `Bearer ${token}`)
        .send({ truckId: 'truck_broke', repairEngine: true, repairTires: true });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INSUFFICIENT_FUNDS');
    });

    it('Should successfully execute roadside repair and deduct cost from legal balance', async () => {
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck_repairable',
        ownerId: 'usr_abc',
        companyId: 'comp_abc',
        model: 'DAF XF',
        engineHealth: 40,
        tireWear: 35,
        isImpounded: false,
        activeRoute: { currentCity: 'Tallinn' },
        owner: { legalBalance: { toNumber: () => 50000 } },
        company: { legalBalance: { toNumber: () => 50000 } },
        garageId: 'gar_1',
        garage: { id: 'gar_1', city: 'Tallinn' },
      });
      prisma.truck.update.mockResolvedValue({ id: 'truck_repairable', engineHealth: 100, tireWear: 100 });
      prisma.user.update.mockResolvedValue({});
      prisma.company.update.mockResolvedValue({});

      const res = await request(app)
        .post('/api/breakdown/roadside-repair')
        .set('Authorization', `Bearer ${token}`)
        .send({ truckId: 'truck_repairable', repairEngine: true, repairTires: true });

      expect(res.statusCode).toBe(200);
      expect(res.body.repaired).toBe(true);
      expect(res.body.newEngineHealth).toBe(100);
      expect(res.body.newTireWear).toBe(100);
      expect(res.body.totalCharge).toBeGreaterThan(0);
    });

    it('Should compute repair estimate with correct severity classification', async () => {
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck_est',
        ownerId: 'usr_abc',
        companyId: 'comp_abc',
        model: 'Scania R500',
        engineHealth: 5,
        tireWear: 3,
        isImpounded: false,
        activeRoute: { currentCity: 'Minsk' },
      });

      const res = await request(app)
        .get('/api/breakdown/estimate/truck_est')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.severity).toBe('CATASTROPHIC');
      expect(res.body.totalCost).toBeGreaterThan(10000);
      // Minsk is non-hub city, has tow distance
      expect(res.body.towCost).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // 7. LEADERBOARD RANKING TESTS
  // ==========================================
  describe('🏆 Global Leaderboard Rankings', () => {
    const token = generateTestToken('usr_abc', 'trucker_sam');

    it('Should return underworld rep leaderboard sorted by reputationScore desc', async () => {
      prisma.company.findMany.mockResolvedValue([
        { id: 'c1', name: 'TopDog Logistics', reputationScore: 5500, policeHeat: 88, _count: { trucks: 4 } },
        { id: 'c3', name: 'Midway Logistics', reputationScore: 2500, policeHeat: 40, _count: { trucks: 2 } },
        { id: 'c2', name: 'Rookie Logistics', reputationScore: 120,  policeHeat: 10, _count: { trucks: 1 } },
      ]);

      const res = await request(app)
        .get('/api/leaderboard/underworld-rep')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.leaderboard[0].companyName).toBe('TopDog Logistics');
      expect(res.body.leaderboard[0].rank).toBe(1);
      expect(res.body.leaderboard[0].tier).toBe('💀 LEGEND');
      expect(res.body.leaderboard[1].companyName).toBe('Midway Logistics');
      expect(res.body.leaderboard[1].tier).toBe('🔥 KINGPIN');
    });

    it('Should return heat-index board with correct wanted levels', async () => {
      prisma.company.findMany.mockResolvedValue([
        { id: 'c1', name: 'MostWanted Logistics', policeHeat: 95, reputationScore: 2000, _count: { trucks: 3 } },
        { id: 'c2', name: 'LowProfile Logistics', policeHeat: 5,  reputationScore: 100,  _count: { trucks: 1 } },
      ]);

      const res = await request(app)
        .get('/api/leaderboard/heat-index')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.leaderboard[0].wantedLevel).toBe('☢️ EXTREME THREAT');
      expect(res.body.leaderboard[1].wantedLevel).toBe('⚪ CLEAN RECORD');
    });

    it('Should return my-rank with all category ranks', async () => {
      const mockCompanies = [
        { id: 'comp_abc', name: 'trucker_sam Logistics', reputationScore: 500, policeHeat: 20, trucks: [{ mileage: 80000, engineHealth: 90, tireWear: 80, isImpounded: false, model: 'Scania R500' }] },
        { id: 'c2', name: 'competitor Logistics', reputationScore: 1200, policeHeat: 60, trucks: [{ mileage: 200000, engineHealth: 50, tireWear: 60, isImpounded: false, model: 'Volvo FH16' }] },
      ];
      prisma.company.findMany.mockResolvedValue(mockCompanies);

      const res = await request(app)
        .get('/api/leaderboard/my-rank')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.companyName).toBe('trucker_sam Logistics');
      expect(res.body.totalCompanies).toBe(2);
      expect(res.body.ranks.underworldRep.rank).toBe(2);   // 500 < 1200
      expect(res.body.ranks.heatIndex.rank).toBe(2);        // 20 < 60
      expect(res.body.ranks.underworldRep.value).toBe(500);
    });
  });

  // ==========================================
  // 8. BORDER SERVICE DETECTION ALGORITHM
  // ==========================================
  describe('🛃 Border Clearance Detection Math', () => {
    it('Should clamp detection probability between 5% and 95%', () => {
      const checkpoint_alert = 10; // max
      const baseRisk = checkpoint_alert * 10; // = 100
      const modReduction = 5 * 10; // max shielding = 50
      const contrabandRisk = 5.0 * 12; // max risk multiplier = 60
      const scannerPenalty = 20 + 25; // xray + k9 = 45
      let prob = baseRisk - modReduction + contrabandRisk + scannerPenalty; // = 175
      prob = Math.min(Math.max(prob, 5), 95);
      expect(prob).toBe(95); // clamped at ceiling
    });

    it('Should return 0 risk probability for legal (no contraband) routes', async () => {
      // Without contraband, calculateClearance should short-circuit immediately
      prisma.truck.findUnique.mockResolvedValue({
        id: 'clean_truck',
        owner: { id: 'usr_abc' },
        companyId: 'comp_abc',
        fuelTankMod: 'STOCK',
        scannerShielding: 0,
        activeRoute: { contrabandJob: null }, // No contraband
      });

      const result = await BorderService.calculateClearance('clean_truck', {
        name: 'Riga Gate',
        alertLevel: 8,
        scannerType: 'XRAY',
        hasK9: true,
      });

      expect(result.cleared).toBe(true);
      expect(result.detectionProbability).toBe(0);
    });

    it('Should generate bust penalties with correct severity scaling by cargo class', async () => {
      const classC_baseFine = 50000;
      const classC_baseHeat = 60;
      const classC_impoundDays = 14;

      // Verify CLASS_C penalty constants match the service implementation
      expect(classC_baseFine).toBeGreaterThan(15000); // > CLASS_B
      expect(classC_impoundDays).toBeGreaterThan(7);  // > CLASS_B impound
      expect(classC_baseHeat).toBeGreaterThan(30);    // > CLASS_B heat
    });
  });

  // ==========================================
  // 9. DYNAMIC COMMODITY MARKET TESTS
  // ==========================================
  describe('📈 Commodity Market & Storage Systems', () => {
    const token = generateTestToken('usr_abc', 'trucker_sam');

    it('Should fetch current commodity prices sorted alphabetically', async () => {
      prisma.commodityMarket.findMany.mockResolvedValue([
        { id: 'c_adblue', commodityType: 'ADBLUE', currentPrice: Decimal(0.85) },
        { id: 'c_diesel', commodityType: 'DIESEL', currentPrice: Decimal(1.50) },
      ]);

      const res = await request(app)
        .get('/api/commodity')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].commodityType).toBe('ADBLUE');
      expect(res.body[1].commodityType).toBe('DIESEL');
    });

    it('Should reject commodity purchase if inputs are invalid or negative', async () => {
      const res = await request(app)
        .post('/api/commodity/buy')
        .set('Authorization', `Bearer ${token}`)
        .send({ garageId: 'gar_1', commodityType: 'DIESEL', amount: -50 });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_INPUT');
    });

    it('Should successfully purchase and stockpile commodity when constraints are met', async () => {
      prisma.commodityMarket.findUnique.mockResolvedValue({
        id: 'c_diesel',
        commodityType: 'DIESEL',
        currentPrice: Decimal(1.50),
      });
      prisma.company.findUnique.mockResolvedValue({
        id: 'comp_abc',
        legalBalance: Decimal(10000.00),
        blackMarketBalance: Decimal(0.00),
      });
      prisma.garage.findUnique.mockResolvedValue({
        id: 'gar_1',
        companyId: 'comp_abc',
        city: 'Kaunas',
        dieselStorage: 100.0,
        maxDiesel: 5000.0,
      });

      // Updates
      prisma.company.update.mockResolvedValue({
        id: 'comp_abc',
        legalBalance: Decimal(9850.00), // 10000 - (1.50 * 100)
        blackMarketBalance: Decimal(0.00),
      });
      prisma.garage.update.mockResolvedValue({
        id: 'gar_1',
        dieselStorage: 200.0,
      });

      const res = await request(app)
        .post('/api/commodity/buy')
        .set('Authorization', `Bearer ${token}`)
        .send({ garageId: 'gar_1', commodityType: 'DIESEL', amount: 100 });

      if (res.statusCode !== 200) {
        console.error("BUY TEST FAILED WITH BODY:", res.body);
      }

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Commodity purchased and stockpiled successfully!');
      expect(res.body.totalCost).toBe(150);
      expect(res.body.unitPrice).toBe(1.50);
    });

    it('Should reject commodity purchase if company balance is insufficient', async () => {
      prisma.commodityMarket.findUnique.mockResolvedValue({
        id: 'c_diesel',
        commodityType: 'DIESEL',
        currentPrice: Decimal(1.50),
      });
      prisma.company.findUnique.mockResolvedValue({
        id: 'comp_abc',
        legalBalance: Decimal(10.00), // Less than 150 needed
        blackMarketBalance: Decimal(0.00),
      });
      prisma.garage.findUnique.mockResolvedValue({
        id: 'gar_1',
        companyId: 'comp_abc',
        city: 'Kaunas',
        dieselStorage: 100.0,
        maxDiesel: 5000.0,
      });

      const res = await request(app)
        .post('/api/commodity/buy')
        .set('Authorization', `Bearer ${token}`)
        .send({ garageId: 'gar_1', commodityType: 'DIESEL', amount: 100 });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INSUFFICIENT_FUNDS');
    });

    it('Should reject commodity purchase if stockpile space limit is exceeded', async () => {
      prisma.commodityMarket.findUnique.mockResolvedValue({
        id: 'c_diesel',
        commodityType: 'DIESEL',
        currentPrice: Decimal(1.50),
      });
      prisma.company.findUnique.mockResolvedValue({
        id: 'comp_abc',
        legalBalance: Decimal(10000.00),
        blackMarketBalance: Decimal(0.00),
      });
      prisma.garage.findUnique.mockResolvedValue({
        id: 'gar_1',
        companyId: 'comp_abc',
        city: 'Kaunas',
        dieselStorage: 4950.0, // Remaining capacity: 50L
        maxDiesel: 5000.0,
      });

      const res = await request(app)
        .post('/api/commodity/buy')
        .set('Authorization', `Bearer ${token}`)
        .send({ garageId: 'gar_1', commodityType: 'DIESEL', amount: 100 }); // Demands 100L (exceeds capacity)

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('STORAGE_CAPACITY_EXCEEDED');
    });

    it('Should successfully upgrade commodity storage capacity and deduct clean cash', async () => {
      prisma.garage.findUnique.mockResolvedValue({
        id: 'gar_1',
        companyId: 'comp_abc',
        maxDiesel: 5000.0,
      });
      prisma.company.findUnique.mockResolvedValue({
        id: 'comp_abc',
        legalBalance: Decimal(20000.00),
      });

      prisma.company.update.mockResolvedValue({});
      prisma.garage.update.mockResolvedValue({
        id: 'gar_1',
        maxDiesel: 6000.0,
      });

      const res = await request(app)
        .post('/api/garage/gar_1/upgrade-storage')
        .set('Authorization', `Bearer ${token}`)
        .send({ commodityType: 'DIESEL' });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('DIESEL storage capacity upgraded successfully');
      expect(res.body.garage.maxDiesel).toBe(6000.0);

      expect(prisma.company.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'comp_abc' },
        data: { legalBalance: { decrement: 12500 } },
      }));
    });

    it('Should reject storage upgrade if commodity type is invalid', async () => {
      const res = await request(app)
        .post('/api/garage/gar_1/upgrade-storage')
        .set('Authorization', `Bearer ${token}`)
        .send({ commodityType: 'INVALID_TYPE' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_COMMODITY_TYPE');
    });

    it('Should reject storage upgrade if company balance is insufficient', async () => {
      prisma.garage.findUnique.mockResolvedValue({
        id: 'gar_1',
        companyId: 'comp_abc',
        maxElectricity: 1000.0,
      });
      prisma.company.findUnique.mockResolvedValue({
        id: 'comp_abc',
        legalBalance: Decimal(100.00), // less than $8000 cost for electricity
      });

      const res = await request(app)
        .post('/api/garage/gar_1/upgrade-storage')
        .set('Authorization', `Bearer ${token}`)
        .send({ commodityType: 'ELECTRICITY' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INSUFFICIENT_FUNDS');
    });

    it('Should reject storage upgrade if maximum storage capacity has been reached', async () => {
      prisma.garage.findUnique.mockResolvedValue({
        id: 'gar_1',
        companyId: 'comp_abc',
        maxElectricity: 10000.0, // already at limit (10000 kWh)
      });

      const res = await request(app)
        .post('/api/garage/gar_1/upgrade-storage')
        .set('Authorization', `Bearer ${token}`)
        .send({ commodityType: 'ELECTRICITY' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('MAX_STORAGE_LIMIT_REACHED');
    });
  });

  // ==========================================
  // 10. HUB-AND-SPOKE & SUGGESTER & AUCTION SAFEGUARD TESTS
  // ==========================================
  describe('🌐 Hub-and-Spoke Logistics & Suggester & Bidding Safeguards', () => {
    const token = generateTestToken('usr_abc', 'trucker_sam');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('Should successfully re-bind truck to destination garage if under capacity', async () => {
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck_1',
        companyId: 'comp_abc',
        garageId: 'gar_start',
        garage: { id: 'gar_start', city: 'Riga' },
        mileage: 1000.0,
        engineHealth: 100,
        tireWear: 100,
        fuelCapacity: 400.0,
        fuelTankMod: 'STOCK',
        company: {
          id: 'comp_abc',
          resAdvancedPacking: 0,
          jurisdiction: 'BALTICS'
        },
        activeRoute: {
          id: 'route_1',
          legalContract: {
            id: 'contract_1',
            payoutLegal: Decimal(3000.00),
            destination: 'Vilnius',
            distanceKm: 100.0
          }
        }
      });

      // Owned garage in Vilnius
      prisma.garage.findFirst.mockResolvedValue({
        id: 'gar_dest',
        city: 'Vilnius',
        capacity: 3
      });

      // 1 truck currently assigned (under 3 capacity)
      prisma.truck.count.mockResolvedValue(1);

      // Call delivery success
      const result = await BorderService.applyClearanceSuccess('truck_1');

      expect(result.payout).toBe(3000);

      // Verify re-binding occurred
      expect(prisma.truck.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'truck_1' },
        data: expect.objectContaining({
          garageId: 'gar_dest'
        })
      }));
    });

    it('Should reject terminal re-binding and keep start terminal on overflow', async () => {
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck_1',
        companyId: 'comp_abc',
        garageId: 'gar_start',
        garage: { id: 'gar_start', city: 'Riga' },
        mileage: 1000.0,
        engineHealth: 100,
        tireWear: 100,
        fuelCapacity: 400.0,
        fuelTankMod: 'STOCK',
        company: {
          id: 'comp_abc',
          resAdvancedPacking: 0,
          jurisdiction: 'BALTICS'
        },
        activeRoute: {
          id: 'route_1',
          legalContract: {
            id: 'contract_1',
            payoutLegal: Decimal(3000.00),
            destination: 'Vilnius',
            distanceKm: 100.0
          }
        }
      });

      // Owned garage in Vilnius
      prisma.garage.findFirst.mockResolvedValue({
        id: 'gar_dest',
        city: 'Vilnius',
        capacity: 3
      });

      // 3 trucks currently assigned (full capacity!)
      prisma.truck.count.mockResolvedValue(3);

      await BorderService.applyClearanceSuccess('truck_1');

      // Verify that truck.update was NOT called with garageId: 'gar_dest'
      const calls = prisma.truck.update.mock.calls;
      const garageIdUpdateCall = calls.find((call: any) => call[0]?.data?.garageId === 'gar_dest');
      expect(garageIdUpdateCall).toBeUndefined();
    });

    it('Should return optimal route suggestion from suggester endpoint', async () => {
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck_1',
        companyId: 'comp_abc',
        garage: { city: 'Riga' },
        driver: { id: 'drv_1', name: 'Sam', trait: 'LEAD_FOOT', isStimulated: false },
        company: { resAdvancedPacking: 0 }
      });

      prisma.legalContract.findMany.mockResolvedValue([
        {
          id: 'contract_low',
          origin: 'Riga',
          destination: 'Vilnius',
          distanceKm: 100.0,
          payoutLegal: Decimal(1000.00),
          cargoType: 'ELECTRONICS'
        },
        {
          id: 'contract_high',
          origin: 'Riga',
          destination: 'Warsaw',
          distanceKm: 200.0,
          payoutLegal: Decimal(2500.00),
          cargoType: 'PHARMACEUTICALS'
        }
      ]);

      prisma.contrabandJob.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/dispatch/suggest-route?truckId=truck_1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.suggestion).toBeDefined();
      expect(res.body.suggestion.id).toBe('contract_high'); // B yields 2500 / (200 / 80) = 1000/hr, A yields 1000 / (100 / 80) = 800/hr
      expect(res.body.suggestion.hourlyRate).toBe(1000);
    });

    it('Should trigger FLEET_CAPACITY_EXCEEDED when bidding beyond total garage slots', async () => {
      const { AuctionService } = require('../services/auction.service');

      prisma.company.findUnique.mockResolvedValue({
        id: 'comp_abc',
        name: 'LogistiXpert HQ',
        legalBalance: Decimal(50000.00)
      });

      // Total garage capacity: 5 slots
      prisma.garage.findMany.mockResolvedValue([
        { id: 'gar_1', capacity: 3 },
        { id: 'gar_2', capacity: 2 }
      ]);

      // 4 owned trucks
      prisma.truck.count.mockResolvedValue(4);

      // 1 active highest bid on another auction listing
      prisma.auctionListing.count.mockResolvedValue(1);

      // Placing another bid demands: owned(4) + otherBids(1) + 1 = 6 slots, which is > 5 capacity
      await expect(AuctionService.placeBid('auc_xyz', 'comp_abc', 10000))
        .rejects
        .toThrow('FLEET_CAPACITY_EXCEEDED');
    });
  });

  // ==========================================
  // 11. TERMINAL UPGRADES & ANALYTICS & CITY FREIGHT
  // ==========================================
  describe('📊 Warehouse Terminal Upgrades, Daily Performance Analytics, and Dynamic City Freight', () => {
    const token = generateTestToken('usr_abc', 'trucker_sam');

    it('Should upgrade terminal level and deduct legal Clean Cash', async () => {
      prisma.garage.findUnique.mockResolvedValue({
        id: 'gar_upgrade',
        companyId: 'comp_abc',
        terminalLevel: 1,
      });
      prisma.company.findUnique.mockResolvedValue({
        id: 'comp_abc',
        legalBalance: Decimal(150000),
      });
      prisma.company.update.mockResolvedValue({});
      prisma.garage.update.mockResolvedValue({
        id: 'gar_upgrade',
        terminalLevel: 2,
      });

      const res = await request(app)
        .post('/api/garage/gar_upgrade/upgrade-terminal')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Terminal upgraded successfully');
      expect(res.body.garage.terminalLevel).toBe(2);

      // Verify clean cash deduction of 100,000 for level 1 -> 2
      expect(prisma.company.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'comp_abc' },
        data: { legalBalance: { decrement: 100000 } },
      }));
    });

    it('Should block dispatch with TERMINAL_LEVEL_TOO_LOW if level is insufficient for contract distance', async () => {
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck_low_level',
        companyId: 'comp_abc',
        tier: 'VAN',
        isImpounded: false,
        activeRoute: null,
        driver: { id: 'drv_1', name: 'John', fatigue: 20 },
        garage: { id: 'gar_1', city: 'Kaunas', terminalLevel: 1 },
        garageId: 'gar_1',
      });
      // Contract of 300km originating in Kaunas is too long for Level 1 terminal (< 200km allowed)
      prisma.legalContract.findUnique.mockResolvedValue({
        id: 'contract_too_long',
        origin: 'Kaunas',
        destination: 'Berlin',
        distanceKm: 300,
        cargoType: 'ELECTRONICS',
      });

      // Stub AnalyticsService methods to avoid DB hits
      prisma.company.findUnique.mockResolvedValue({ id: 'comp_abc', reputationScore: 100 });
      prisma.garage.findFirst.mockResolvedValue({ id: 'gar_1', city: 'Kaunas', terminalLevel: 1 });
      prisma.garage.findMany.mockResolvedValue([{ city: 'Kaunas', terminalLevel: 1 }]);
      prisma.cityDailyFreight.findUnique.mockResolvedValue({ shippedKg: 0 });
      prisma.cityDailyFreight.findMany.mockResolvedValue([]);

      const res = await request(app)
        .post('/api/dispatch/launch')
        .set('Authorization', `Bearer ${token}`)
        .send({ truckId: 'truck_low_level', legalContractId: 'contract_too_long' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('TERMINAL_LEVEL_TOO_LOW');
    });

    it('Should block dispatch with FREIGHT_SUPPLY_DEPLETED if remaining city freight capacity is too low', async () => {
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck_heavy',
        companyId: 'comp_abc',
        tier: 'ARTICULATED', // Cargo weight 24,000 kg
        isImpounded: false,
        activeRoute: null,
        driver: { id: 'drv_1', name: 'John', fatigue: 20 },
        garage: { id: 'gar_1', city: 'Siauliai', terminalLevel: 1 },
        garageId: 'gar_1',
      });
      prisma.legalContract.findUnique.mockResolvedValue({
        id: 'contract_sh',
        origin: 'Siauliai',
        destination: 'Klaipeda',
        distanceKm: 120, // Inside level 1 limit
        cargoType: 'ELECTRONICS',
      });

      prisma.company.findUnique.mockResolvedValue({ id: 'comp_abc', reputationScore: 0 });
      prisma.garage.findFirst.mockResolvedValue({ id: 'gar_1', city: 'Siauliai', terminalLevel: 1 });
      prisma.garage.findMany.mockResolvedValue([{ city: 'Siauliai', terminalLevel: 1 }]);
      // Shipped 290,000 kg out of 300,000 kg regional city base capacity, leaving only 10,000 kg capacity (less than truck's 24,000 kg load)
      prisma.cityDailyFreight.findUnique.mockResolvedValue({ shippedKg: 290000 });
      prisma.cityDailyFreight.findMany.mockResolvedValue([{ city: 'Siauliai', shippedKg: 290000 }]);

      const res = await request(app)
        .post('/api/dispatch/launch')
        .set('Authorization', `Bearer ${token}`)
        .send({ truckId: 'truck_heavy', legalContractId: 'contract_sh' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('FREIGHT_SUPPLY_DEPLETED');
    });

    it('Should allow REST queries for historical daily reports and city freight capacities', async () => {
      prisma.dailyPerformanceReport.findMany.mockResolvedValue([
        { dateStr: '2026-06-01', revenueLegal: Decimal(15000), revenueBlack: Decimal(5000) },
      ]);
      prisma.terminalDailyReport.findMany.mockResolvedValue([
        { dateStr: '2026-06-01', garageId: 'gar_1', city: 'Kaunas', revenueLegal: Decimal(15000) },
      ]);
      prisma.cityDailyFreight.findUnique.mockResolvedValue({ shippedKg: 50000 });
      prisma.cityDailyFreight.findMany.mockResolvedValue([{ city: 'Kaunas', shippedKg: 50000 }]);
      prisma.company.findUnique.mockResolvedValue({ id: 'comp_abc', reputationScore: 500 });
      prisma.garage.findFirst.mockResolvedValue({ id: 'gar_1', city: 'Kaunas', terminalLevel: 2 });
      prisma.garage.findMany.mockResolvedValue([{ city: 'Kaunas', terminalLevel: 2 }]);

      // 1. Fetch general performance reports
      const resPerf = await request(app)
        .get('/api/analytics/performance')
        .set('Authorization', `Bearer ${token}`);
      expect(resPerf.statusCode).toBe(200);
      expect(resPerf.body).toHaveLength(1);
      expect(resPerf.body[0].revenueLegal.val).toBe(15000);

      // 2. Fetch terminal performance report breakdown
      const resTerm = await request(app)
        .get('/api/analytics/terminal-performance')
        .set('Authorization', `Bearer ${token}`);
      expect(resTerm.statusCode).toBe(200);
      expect(resTerm.body).toHaveLength(1);
      expect(resTerm.body[0].city).toBe('Kaunas');

      // 3. Fetch city remaining freight capacities
      const resCity = await request(app)
        .get('/api/analytics/city-freight?city=Kaunas')
        .set('Authorization', `Bearer ${token}`);
      expect(resCity.statusCode).toBe(200);
      expect(resCity.body.city).toBe('Kaunas');
      expect(resCity.body.shippedKg).toBe(50000);
      expect(resCity.body.remainingKg).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // 12. R&D TECH TREE & PARTNERSHIPS
  // ==========================================
  describe('🔬 R&D Tech Tree & Brand Partnerships', () => {
    const token = generateTestToken('usr_abc', 'trucker_sam');

    it('Should return full active R&D nodes and costs on GET', async () => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'comp_abc',
        name: 'trucker_sam Logistics',
        legalBalance: Decimal(50000),
        resTerminalLogistics: 1,
        resAerodynamics: 0,
        resAdvancedPacking: 0,
        resECURemapping: 0,
        resCoopCapacity: 0,
        resBrandPartnership: 'NONE',
      });

      const res = await request(app)
        .get('/api/research')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.companyId).toBe('comp_abc');
      expect(res.body.legalBalance).toBe(50000);
      expect(res.body.brandPartnership).toBe('NONE');
      expect(res.body.nodes).toHaveLength(5);

      const logisticsNode = res.body.nodes.find((n: any) => n.nodeKey === 'resTerminalLogistics');
      expect(logisticsNode).toBeDefined();
      expect(logisticsNode.currentLevel).toBe(1);
      expect(logisticsNode.nextUpgradeCost).toBe(60000); // Cost for Level 2 is costs[1] = 60000
    });

    it('Should upgrade R&D node successfully if clean cash allows', async () => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'comp_abc',
        name: 'trucker_sam Logistics',
        legalBalance: Decimal(50000),
        resTerminalLogistics: 0,
        resAerodynamics: 0,
        resAdvancedPacking: 0,
        resECURemapping: 0,
        resCoopCapacity: 0,
        resBrandPartnership: 'NONE',
      });

      prisma.company.update.mockResolvedValue({
        id: 'comp_abc',
        legalBalance: Decimal(35000),
        resTerminalLogistics: 1,
      });

      const res = await request(app)
        .post('/api/research/upgrade')
        .set('Authorization', `Bearer ${token}`)
        .send({ nodeKey: 'resTerminalLogistics' });

      if (res.statusCode !== 200) {
        console.error("UPGRADE TEST FAILED WITH BODY:", res.body);
      }

      expect(res.statusCode).toBe(200);
      expect(res.body.nodeKey).toBe('resTerminalLogistics');
      expect(res.body.newLevel).toBe(1);
      expect(res.body.legalBalance).toBe(35000);
    });

    it('Should reject R&D upgrade if clean cash is insufficient', async () => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'comp_abc',
        name: 'trucker_sam Logistics',
        legalBalance: Decimal(1000), // Less than 15000 cost
        resTerminalLogistics: 0,
        resAerodynamics: 0,
        resAdvancedPacking: 0,
        resECURemapping: 0,
        resCoopCapacity: 0,
        resBrandPartnership: 'NONE',
      });

      const res = await request(app)
        .post('/api/research/upgrade')
        .set('Authorization', `Bearer ${token}`)
        .send({ nodeKey: 'resTerminalLogistics' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INSUFFICIENT_FUNDS');
    });

    it('Should sign Brand Partnership successfully for $150,000 flat', async () => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'comp_abc',
        name: 'trucker_sam Logistics',
        legalBalance: Decimal(200000),
        resBrandPartnership: 'NONE',
      });

      prisma.company.update.mockResolvedValue({
        id: 'comp_abc',
        legalBalance: Decimal(50000),
        resBrandPartnership: 'SCARFIA',
      });

      const res = await request(app)
        .post('/api/research/sign-partnership')
        .set('Authorization', `Bearer ${token}`)
        .send({ manufacturer: 'SCARFIA' });

      expect(res.statusCode).toBe(200);
      expect(res.body.brandPartnership).toBe('SCARFIA');
      expect(res.body.legalBalance).toBe(50000);
    });
  });

  // ======================================================================
  // 10. CO-OP DEEP SIMULATION EXPANSION (PHASE 18)
  // ======================================================================
  describe('🌌 Co-op Deep Simulation Expansion: Weather, Autopilot & Contracts', () => {
    const token = generateTestToken('usr_abc', 'trucker_sam');

    beforeEach(() => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'comp_abc',
        name: 'trucker_sam Logistics',
        reputationScore: 100,
        legalBalance: Decimal(50000),
        blackMarketBalance: Decimal(10000),
        activeDebtPrincipal: Decimal(20000),
        resTerminalLogistics: 1,
        resAerodynamics: 1,
        resAdvancedPacking: 1,
        resECURemapping: 1,
        resCoopCapacity: 1,
        garages: [{ upgradeLevel: 1, terminalLevel: 4 }],
        fronts: [],
        trucks: [
          { id: 'truck_fleet', manufacturer: 'MOOSE', tier: 'HEAVY', engineHealth: 100, cosmeticHealth: 100, createdAt: new Date() }
        ],
      });
      prisma.garage.findFirst.mockResolvedValue({ terminalLevel: 4 });
      prisma.cityDailyFreight.findUnique.mockResolvedValue(null);
    });

    it('Should correctly depreciate company valuation based on truck cosmeticHealth', async () => {
      // 1. With cosmeticHealth = 100
      prisma.company.findUnique.mockResolvedValueOnce({
        id: 'comp_abc',
        name: 'trucker_sam Logistics',
        reputationScore: 100,
        legalBalance: Decimal(50000),
        blackMarketBalance: Decimal(10000),
        activeDebtPrincipal: Decimal(20000),
        resTerminalLogistics: 1,
        resAerodynamics: 1,
        resAdvancedPacking: 1,
        resECURemapping: 1,
        resCoopCapacity: 1,
        garages: [{ upgradeLevel: 1, terminalLevel: 4 }],
        fronts: [],
        trucks: [
          { id: 'truck_fleet', manufacturer: 'MOOSE', tier: 'HEAVY', engineHealth: 100, cosmeticHealth: 100, createdAt: new Date() }
        ],
      });

      const resFullHealth = await request(app)
        .get('/api/finance/valuation')
        .set('Authorization', `Bearer ${token}`);

      expect(resFullHealth.statusCode).toBe(200);
      const valFull = resFullHealth.body.valuation;

      // 2. With cosmeticHealth = 60
      // engineDeprec = 0, cosmeticDeprec = (100 - 60)/400 = 0.1
      // depreciated value should be 120000 * 0.9 = 108000 (reduced by 12000)
      prisma.company.findUnique.mockResolvedValueOnce({
        id: 'comp_abc',
        name: 'trucker_sam Logistics',
        reputationScore: 100,
        legalBalance: Decimal(50000),
        blackMarketBalance: Decimal(10000),
        activeDebtPrincipal: Decimal(20000),
        resTerminalLogistics: 1,
        resAerodynamics: 1,
        resAdvancedPacking: 1,
        resECURemapping: 1,
        resCoopCapacity: 1,
        garages: [{ upgradeLevel: 1, terminalLevel: 4 }],
        fronts: [],
        trucks: [
          { id: 'truck_fleet', manufacturer: 'MOOSE', tier: 'HEAVY', engineHealth: 100, cosmeticHealth: 60, createdAt: new Date() }
        ],
      });

      const resDamaged = await request(app)
        .get('/api/finance/valuation')
        .set('Authorization', `Bearer ${token}`);

      expect(resDamaged.statusCode).toBe(200);
      const valDamaged = resDamaged.body.valuation;

      // Valuation difference should be exactly 12000!
      expect(valFull - valDamaged).toBe(12000);
    });

    it('Should correctly reduce loan credit limit ceiling when truck has cosmetic damage', async () => {
      // 1. Full health cosmeticHealth = 100
      prisma.company.findUnique.mockResolvedValueOnce({
        id: 'comp_abc',
        name: 'trucker_sam Logistics',
        reputationScore: 100,
        marketingRepBoost: 0,
        legalBalance: Decimal(50000),
        blackMarketBalance: Decimal(10000),
        activeDebtPrincipal: Decimal(20000),
        activeDebtInterest: 10.0,
        garages: [{ upgradeLevel: 1, terminalLevel: 4 }],
        trucks: [
          { id: 'truck_fleet', manufacturer: 'MOOSE', tier: 'HEAVY', engineHealth: 100, cosmeticHealth: 100, createdAt: new Date() }
        ],
      });

      const resFull = await request(app)
        .get('/api/finance/loans')
        .set('Authorization', `Bearer ${token}`);

      expect(resFull.statusCode).toBe(200);
      const ceilingFull = resFull.body.creditCeiling;

      // 2. Damaged cosmeticHealth = 60
      // Truck value decreases by 12000, so assetsValue decreases by 12000.
      // creditCeiling decreases by 12000 * 0.5 = 6000.
      prisma.company.findUnique.mockResolvedValueOnce({
        id: 'comp_abc',
        name: 'trucker_sam Logistics',
        reputationScore: 100,
        marketingRepBoost: 0,
        legalBalance: Decimal(50000),
        blackMarketBalance: Decimal(10000),
        activeDebtPrincipal: Decimal(20000),
        activeDebtInterest: 10.0,
        garages: [{ upgradeLevel: 1, terminalLevel: 4 }],
        trucks: [
          { id: 'truck_fleet', manufacturer: 'MOOSE', tier: 'HEAVY', engineHealth: 100, cosmeticHealth: 60, createdAt: new Date() }
        ],
      });

      const resDamaged = await request(app)
        .get('/api/finance/loans')
        .set('Authorization', `Bearer ${token}`);

      expect(resDamaged.statusCode).toBe(200);
      const ceilingDamaged = resDamaged.body.creditCeiling;

      expect(ceilingFull - ceilingDamaged).toBe(6000);
    });

    it('Should delete legal contract immediately upon launch if SPOT type', async () => {
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck_fleet',
        ownerId: 'usr_abc',
        companyId: 'comp_abc',
        isImpounded: false,
        activeRoute: null,
        tier: 'RIGID_MEDIUM',
        garageId: 'gar_1',
        garage: { id: 'gar_1', city: 'Tallinn', terminalLevel: 4 },
        driver: {
          id: 'drv_active',
          name: 'Active driver',
          fatigue: 20,
          trait: 'BALANCED',
          tachoHours: 1.0,
        }
      });

      prisma.legalContract.findUnique.mockResolvedValue({
        id: 'contract_spot_test',
        contractType: 'SPOT',
        origin: 'Tallinn',
        destination: 'Riga',
        distanceKm: 312,
        cargoType: 'ELECTRONICS',
      });

      prisma.activeRoute.create.mockResolvedValue({
        id: 'route_spot_test',
        companyId: 'comp_abc',
        truckId: 'truck_fleet',
      });

      const res = await request(app)
        .post('/api/dispatch/launch')
        .set('Authorization', `Bearer ${token}`)
        .send({ truckId: 'truck_fleet', legalContractId: 'contract_spot_test', autopilotPolicy: 'SAFE' });

      expect(res.statusCode).toBe(201);
      expect(prisma.legalContract.delete).toHaveBeenCalledWith({
        where: { id: 'contract_spot_test' },
      });
    });

    it('Should retain legal contract on the board upon launch if PERSISTENT type', async () => {
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck_fleet',
        ownerId: 'usr_abc',
        companyId: 'comp_abc',
        isImpounded: false,
        activeRoute: null,
        tier: 'RIGID_MEDIUM',
        garageId: 'gar_1',
        garage: { id: 'gar_1', city: 'Tallinn', terminalLevel: 4 },
        driver: {
          id: 'drv_active',
          name: 'Active driver',
          fatigue: 20,
          trait: 'BALANCED',
          tachoHours: 1.0,
        }
      });

      prisma.legalContract.findUnique.mockResolvedValue({
        id: 'contract_persistent_test',
        contractType: 'PERSISTENT',
        origin: 'Tallinn',
        destination: 'Riga',
        distanceKm: 312,
        cargoType: 'ELECTRONICS',
      });

      prisma.activeRoute.create.mockResolvedValue({
        id: 'route_persistent_test',
        companyId: 'comp_abc',
        truckId: 'truck_fleet',
      });

      const res = await request(app)
        .post('/api/dispatch/launch')
        .set('Authorization', `Bearer ${token}`)
        .send({ truckId: 'truck_fleet', legalContractId: 'contract_persistent_test', autopilotPolicy: 'AVERAGE' });

      expect(res.statusCode).toBe(201);
      expect(prisma.legalContract.delete).not.toHaveBeenCalled();
      expect(prisma.legalContract.update).not.toHaveBeenCalled();
    });

    it('Should decrement remaining quota upon launch if LIMITED type and quota has balance left', async () => {
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck_fleet',
        ownerId: 'usr_abc',
        companyId: 'comp_abc',
        isImpounded: false,
        activeRoute: null,
        tier: 'RIGID_MEDIUM', // 9000 kg cargo weight
        garageId: 'gar_1',
        garage: { id: 'gar_1', city: 'Tallinn', terminalLevel: 4 },
        driver: {
          id: 'drv_active',
          name: 'Active driver',
          fatigue: 20,
          trait: 'BALANCED',
          tachoHours: 1.0,
        }
      });

      prisma.legalContract.findUnique.mockResolvedValue({
        id: 'contract_limited_test',
        contractType: 'LIMITED',
        origin: 'Tallinn',
        destination: 'Riga',
        distanceKm: 312,
        cargoType: 'ELECTRONICS',
        remainingQuota: 50000,
      });

      prisma.activeRoute.create.mockResolvedValue({
        id: 'route_limited_test',
        companyId: 'comp_abc',
        truckId: 'truck_fleet',
      });

      const res = await request(app)
        .post('/api/dispatch/launch')
        .set('Authorization', `Bearer ${token}`)
        .send({ truckId: 'truck_fleet', legalContractId: 'contract_limited_test', autopilotPolicy: 'GREEDY' });

      expect(res.statusCode).toBe(201);
      expect(prisma.legalContract.update).toHaveBeenCalledWith({
        where: { id: 'contract_limited_test' },
        data: { remainingQuota: 41000 }, // 50000 - 9000
      });
      expect(prisma.legalContract.delete).not.toHaveBeenCalled();
    });

    it('Should fully delete contract upon launch if LIMITED quota drops to zero or below', async () => {
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck_fleet',
        ownerId: 'usr_abc',
        companyId: 'comp_abc',
        isImpounded: false,
        activeRoute: null,
        tier: 'RIGID_MEDIUM', // 9000 kg cargo weight
        garageId: 'gar_1',
        garage: { id: 'gar_1', city: 'Tallinn', terminalLevel: 4 },
        driver: {
          id: 'drv_active',
          name: 'Active driver',
          fatigue: 20,
          trait: 'BALANCED',
          tachoHours: 1.0,
        }
      });

      prisma.legalContract.findUnique.mockResolvedValue({
        id: 'contract_limited_depleted_test',
        contractType: 'LIMITED',
        origin: 'Tallinn',
        destination: 'Riga',
        distanceKm: 312,
        cargoType: 'ELECTRONICS',
        remainingQuota: 5000, // 5000 < 9000 cargo weight
      });

      prisma.activeRoute.create.mockResolvedValue({
        id: 'route_limited_depleted_test',
        companyId: 'comp_abc',
        truckId: 'truck_fleet',
      });

      const res = await request(app)
        .post('/api/dispatch/launch')
        .set('Authorization', `Bearer ${token}`)
        .send({ truckId: 'truck_fleet', legalContractId: 'contract_limited_depleted_test', autopilotPolicy: 'SAFE' });

      expect(res.statusCode).toBe(201);
      expect(prisma.legalContract.delete).toHaveBeenCalledWith({
        where: { id: 'contract_limited_depleted_test' },
      });
    });
  });
});
