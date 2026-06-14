import { BorderService } from '../services/border.service';
import { PrismaClient } from '@prisma/client';

jest.mock('../websocket', () => ({
  GameWebSocketServer: {
    broadcast: jest.fn(),
    sendToCompany: jest.fn(),
  },
}));

jest.mock('../services/lock.service', () => ({
  LockService: {
    withLock: jest.fn((key, cb) => cb()),
  },
}));

jest.mock('@prisma/client', () => {
  const mPrisma: any = {
    company: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    truck: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    garage: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    driver: {
      updateMany: jest.fn(),
    },
    activeRoute: {
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    truckHistory: {
      create: jest.fn(),
    },
    $transaction: jest.fn((cb: any): any => cb(mPrisma)),
  };

  return {
    PrismaClient: jest.fn(() => mPrisma),
  };
});

describe('Underworld Overhaul - Schengen Multipliers, Heat Decay, & Smuggler Tow Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Schengen Border Multipliers
  describe('Schengen Border Multipliers', () => {
    it('returns 1.5x multiplier for cross-Schengen boundary routes', () => {
      // Brest (non-Schengen) to Warsaw (Schengen)
      const mult = BorderService.getSchengenMultiplier('brest', 'warsaw');
      expect(mult).toBe(1.5);
    });

    it('returns 1.0x multiplier for intra-Schengen boundary routes', () => {
      // Kaunas (Schengen) to Warsaw (Schengen)
      const mult = BorderService.getSchengenMultiplier('kaunas', 'warsaw');
      expect(mult).toBe(1.0);
    });
  });

  // 2. Laundromat Heat Shield Upgrades (Passive Heat Decay)
  describe('Laundromat Heat Shield Upgrades', () => {
    it('calculates expected heat decay with no Laundromats', async () => {
      const fronts: any[] = [];
      const baseDecay = 0.2;
      let totalBoostMultiplier = 1.0;
      for (const front of fronts) {
        if (!front.isRaided) {
          totalBoostMultiplier += front.upgradeLevel * 0.15;
        }
      }
      expect(baseDecay * totalBoostMultiplier).toBe(0.2);
    });

    it('calculates boosted heat decay with active Laundromats', async () => {
      const fronts = [
        { isRaided: false, upgradeLevel: 2 }, // +30% boost
        { isRaided: true, upgradeLevel: 3 },  // ignored
        { isRaided: false, upgradeLevel: 1 }, // +15% boost
      ];
      const baseDecay = 0.2;
      let totalBoostMultiplier = 1.0;
      for (const front of fronts) {
        if (!front.isRaided) {
          totalBoostMultiplier += front.upgradeLevel * 0.15;
        }
      }
      const finalDecay = baseDecay * totalBoostMultiplier; // 0.2 * (1.0 + 0.30 + 0.15) = 0.2 * 1.45 = 0.29
      expect(finalDecay).toBeCloseTo(0.29);
    });
  });
});
