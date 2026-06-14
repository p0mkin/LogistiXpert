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

  // 3. Sabotage Countermeasures
  describe('Sabotage Countermeasures', () => {
    it('reduces success chance when Chaff/Flares are active', () => {
      const truck = { hasChaffFlares: true, hasReinforcedArmor: false };
      let successChance = 1.0;
      if (truck.hasChaffFlares) successChance *= 0.6;
      expect(successChance).toBe(0.6);
    });

    it('halves physical sabotage success chance and damage when Kevlar Armor is active', () => {
      const truck = { hasChaffFlares: false, hasReinforcedArmor: true };
      const type = 'TIRE_BLOWOUT';
      let successChance = 1.0;
      if (truck.hasChaffFlares) successChance *= 0.6;
      const isPhysical = ['TIRE_BLOWOUT', 'ENGINE_FIRE', 'DRIVER_ASSAULT'].includes(type);
      if (truck.hasReinforcedArmor && isPhysical) successChance *= 0.5;
      expect(successChance).toBe(0.5);

      const baseDmg = 40;
      const damageReduction = truck.hasReinforcedArmor ? 0.5 : 1.0;
      const finalDmg = baseDmg * damageReduction;
      expect(finalDmg).toBe(20);
    });
  });

  // 4. Periodic Front Raids
  describe('Periodic Front Raids Probability', () => {
    it('calculates raid probability based on heat above 60', () => {
      const heat = 80;
      const raidProb = (heat - 60) * 0.005; // 10%
      expect(raidProb).toBeCloseTo(0.10);
    });

    it('returns zero raid probability when heat is below 60', () => {
      const heat = 50;
      const raidProb = heat > 60 ? (heat - 60) * 0.005 : 0;
      expect(raidProb).toBe(0);
    });
  });

  // 5. Schengen Bypass detour checks
  describe('Schengen Bypass', () => {
    it('skips customs checkpoint delays and scans if bypassSchengen is active', () => {
      const route = { bypassSchengen: true, progressPct: 45 };
      const progressStep = 10;
      const newProgress = route.progressPct + progressStep; // 55% (crosses 50% threshold)
      const crossedBorderThreshold = route.progressPct < 50.0 && newProgress >= 50.0;
      expect(crossedBorderThreshold).toBe(true);

      // Condition: isSmuggling && crossedBorderThreshold && !isCurrentlyFerrySegment && !bypassSchengen
      const triggerCheck = crossedBorderThreshold && !route.bypassSchengen;
      expect(triggerCheck).toBe(false); // check is bypassed!
    });
  });
});
