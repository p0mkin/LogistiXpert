import { PrismaClient } from '@prisma/client';

const mockPrismaClient = {
  company: { findUnique: jest.fn() },
  garage: { findFirst: jest.fn(), findMany: jest.fn() },
  cityDailyFreight: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
  dailyPerformanceReport: { upsert: jest.fn() },
  terminalDailyReport: { upsert: jest.fn() },
};

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => mockPrismaClient),
    Prisma: {
      Decimal: jest.fn().mockImplementation((val) => ({
        toString: () => String(val),
      })),
    },
  };
});

import { AnalyticsService } from '../services/analytics.service';

describe('AnalyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDateStr', () => {
    it('returns the date in YYYY-MM-DD format', () => {
      const dateStr = AnalyticsService.getDateStr();
      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getCargoWeight', () => {
    it('returns the correct weight for known tiers', () => {
      expect(AnalyticsService.getCargoWeight('VAN')).toBe(4000);
      expect(AnalyticsService.getCargoWeight('ARTICULATED')).toBe(24000);
      expect(AnalyticsService.getCargoWeight('SUPER_HEAVY')).toBe(45000);
    });

    it('returns default 4000 for unknown tiers', () => {
      expect(AnalyticsService.getCargoWeight('UNKNOWN_TIER')).toBe(4000);
      expect(AnalyticsService.getCargoWeight('')).toBe(4000);
    });
  });

  describe('getBaseCapacity', () => {
    it('returns 1,000,000 for metro cities (exact match)', () => {
      expect(AnalyticsService.getBaseCapacity('berlin')).toBe(1000000);
      expect(AnalyticsService.getBaseCapacity('stockholm')).toBe(1000000);
    });

    it('returns 300,000 for regional cities (exact match)', () => {
      expect(AnalyticsService.getBaseCapacity('gdansk')).toBe(300000);
      expect(AnalyticsService.getBaseCapacity('kaunas')).toBe(300000);
    });

    it('returns 80,000 for standard cities', () => {
      expect(AnalyticsService.getBaseCapacity('somesmalltown')).toBe(80000);
    });

    it('does not false positive substring match on metros or regionals', () => {
      // Previously "berlinton" would return 1,000,000 because it includes "berlin". Now it should return 80,000
      expect(AnalyticsService.getBaseCapacity('berlinton')).toBe(80000);
      expect(AnalyticsService.getBaseCapacity('stockholmsville')).toBe(80000);
    });
  });

  describe('getRemainingFreightCapacity', () => {
    const defaultCity = 'berlin';
    const defaultCompanyId = 'company-123';

    // Import mocked instances properly without requiring them over again
    // The test framework module mapper uses the mock so we can just extract from the shared `prisma` instance

    it('calculates remaining capacity accurately based on rep, terminal level, and usage', async () => {
      mockPrismaClient.company.findUnique.mockResolvedValue({ reputationScore: 500 }); // +0.5 multiplier -> 1.5 total
      mockPrismaClient.garage.findMany.mockResolvedValue([{ city: defaultCity, terminalLevel: 2 }]); // +0.25 multiplier -> 1.25 total
      mockPrismaClient.cityDailyFreight.findMany.mockResolvedValue([{ city: defaultCity, shippedKg: 500000 }]);

      const capacity = await AnalyticsService.getRemainingFreightCapacity(defaultCity, defaultCompanyId);

      // base: 1,000,000 for Berlin
      // multipliers: 1.25 (terminal) * 1.5 (rep) = 1.875
      // total base capacity = 1,875,000
      // minus shipped (500,000) = 1,375,000
      expect(capacity).toBe(1375000);
    });

    it('handles negative reputation score properly', async () => {
      mockPrismaClient.company.findUnique.mockResolvedValue({ reputationScore: -500 }); // -0.5 multiplier -> 0.5 total
      mockPrismaClient.garage.findMany.mockResolvedValue([{ city: defaultCity, terminalLevel: 1 }]); // 1.0 multiplier
      mockPrismaClient.cityDailyFreight.findMany.mockResolvedValue([]); // Nothing shipped

      const capacity = await AnalyticsService.getRemainingFreightCapacity(defaultCity, defaultCompanyId);

      // base: 1,000,000
      // multipliers: 1.0 (terminal) * 0.5 (rep) = 0.5
      // total = 500,000
      expect(capacity).toBe(500000);
    });

    it('caps reputation bonus accurately', async () => {
      mockPrismaClient.company.findUnique.mockResolvedValue({ reputationScore: 5000 }); // Caps at +1.0 -> 2.0 total
      mockPrismaClient.garage.findMany.mockResolvedValue([]); // Defaults to level 1 multiplier
      mockPrismaClient.cityDailyFreight.findMany.mockResolvedValue([]);

      const capacity = await AnalyticsService.getRemainingFreightCapacity(defaultCity, defaultCompanyId);

      // base: 1,000,000 * 2.0 = 2,000,000
      expect(capacity).toBe(2000000);
    });

    it('floors reputation penalty to prevent negative total capacity', async () => {
      mockPrismaClient.company.findUnique.mockResolvedValue({ reputationScore: -1500 }); // Caps at -0.9 -> 0.1 total
      mockPrismaClient.garage.findMany.mockResolvedValue([]);
      mockPrismaClient.cityDailyFreight.findMany.mockResolvedValue([]);

      const capacity = await AnalyticsService.getRemainingFreightCapacity(defaultCity, defaultCompanyId);

      // Math.floor(1000000 * 1 * 0.1) results in 100000 since precision error is now solved
      expect(capacity).toBe(100000);
    });

    it('handles missing/null company, garage, and freight securely', async () => {
      mockPrismaClient.company.findUnique.mockResolvedValue(null);
      mockPrismaClient.garage.findMany.mockResolvedValue([]);
      mockPrismaClient.cityDailyFreight.findMany.mockResolvedValue([]);

      const capacity = await AnalyticsService.getRemainingFreightCapacity('SomeSmallTown', defaultCompanyId);

      // default base: 80,000. All defaults: 1.0 rep, 1.0 terminal, 0 shipped = 80,000
      expect(capacity).toBe(80000);
    });

    it('returns 0 if shipped exceeds total capacity', async () => {
      mockPrismaClient.company.findUnique.mockResolvedValue(null);
      mockPrismaClient.garage.findMany.mockResolvedValue([]);
      mockPrismaClient.cityDailyFreight.findMany.mockResolvedValue([{ city: 'SomeSmallTown', shippedKg: 100000 }]); // More than base 80k

      const capacity = await AnalyticsService.getRemainingFreightCapacity('SomeSmallTown', defaultCompanyId);

      // Math.max(0, 80000 - 100000) = 0
      expect(capacity).toBe(0);
    });
  });

  describe('recordFreightShipped', () => {
    it('upserts daily freight with correct values via a mocked transaction client', async () => {
      const mockTx = {
        cityDailyFreight: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      } as any;

      await AnalyticsService.recordFreightShipped(mockTx, 'berlin', 15000);

      expect(mockTx.cityDailyFreight.upsert).toHaveBeenCalledTimes(1);
      const callArgs = mockTx.cityDailyFreight.upsert.mock.calls[0][0];

      expect(callArgs.where.city_dateStr.city).toBe('berlin');
      expect(callArgs.update.shippedKg.increment).toBe(15000);
      expect(callArgs.create.shippedKg).toBe(15000);
    });
  });

  describe('recordTransaction', () => {
    it('creates accurate update and create structures for REVENUE_LEGAL company-wide and terminal reports', async () => {
      const mockTx = {
        dailyPerformanceReport: {
          upsert: jest.fn().mockResolvedValue({}),
        },
        terminalDailyReport: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      } as any;

      await AnalyticsService.recordTransaction(mockTx, 'company-123', 'garage-123', 'berlin', 'REVENUE_LEGAL', 5000);

      // Validate daily performance upsert
      expect(mockTx.dailyPerformanceReport.upsert).toHaveBeenCalledTimes(1);
      const dailyArgs = mockTx.dailyPerformanceReport.upsert.mock.calls[0][0];

      expect(dailyArgs.where.companyId_dateStr.companyId).toBe('company-123');
      expect(dailyArgs.update.revenueLegal.increment.toString()).toBe('5000');
      expect(dailyArgs.create.revenueLegal.toString()).toBe('5000');

      // Validate terminal daily report upsert
      expect(mockTx.terminalDailyReport.upsert).toHaveBeenCalledTimes(1);
      const terminalArgs = mockTx.terminalDailyReport.upsert.mock.calls[0][0];

      expect(terminalArgs.where.garageId_dateStr.garageId).toBe('garage-123');
      expect(terminalArgs.update.revenueLegal.increment.toString()).toBe('5000');
      expect(terminalArgs.create.revenueLegal.toString()).toBe('5000');
    });

    it('correctly processes EXPENSE_FUEL without creating a terminal report', async () => {
      const mockTx = {
        dailyPerformanceReport: {
          upsert: jest.fn().mockResolvedValue({}),
        },
        terminalDailyReport: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      } as any;

      await AnalyticsService.recordTransaction(mockTx, 'company-123', null, null, 'EXPENSE_FUEL', 1500);

      expect(mockTx.dailyPerformanceReport.upsert).toHaveBeenCalledTimes(1);
      const dailyArgs = mockTx.dailyPerformanceReport.upsert.mock.calls[0][0];

      expect(dailyArgs.update.expenseFuel.increment.toString()).toBe('1500');
      expect(dailyArgs.create.expenseFuel.toString()).toBe('1500');

      // Fuel isn't a terminal specific report unless specified logic states otherwise, but we passed null for garage
      expect(mockTx.terminalDailyReport.upsert).not.toHaveBeenCalled();
    });

    it('correctly processes ROUTE_COMPLETED updates and creates with valid kgDelivered', async () => {
      const mockTx = {
        dailyPerformanceReport: {
          upsert: jest.fn().mockResolvedValue({}),
        },
        terminalDailyReport: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      } as any;

      await AnalyticsService.recordTransaction(mockTx, 'company-123', 'garage-123', 'berlin', 'ROUTE_COMPLETED', 0, 10000);

      const dailyArgs = mockTx.dailyPerformanceReport.upsert.mock.calls[0][0];
      expect(dailyArgs.update.routesCompletedCount.increment).toBe(1);
      expect(dailyArgs.update.tonnageDeliveredKg.increment).toBe(10000);
      expect(dailyArgs.create.routesCompletedCount).toBe(1);
      expect(dailyArgs.create.tonnageDeliveredKg).toBe(10000);

      const terminalArgs = mockTx.terminalDailyReport.upsert.mock.calls[0][0];
      expect(terminalArgs.update.routesCompletedCount.increment).toBe(1);
      expect(terminalArgs.update.tonnageDeliveredKg.increment).toBe(10000);
      expect(terminalArgs.create.routesCompletedCount).toBe(1);
      expect(terminalArgs.create.tonnageDeliveredKg).toBe(10000);
    });
  });
});
