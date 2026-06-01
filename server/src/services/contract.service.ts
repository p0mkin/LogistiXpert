import { PrismaClient, CargoType, ContrabandClass } from '@prisma/client';

const prisma = new PrismaClient();

const CITIES_SCHENGEN = [
  'Tallinn',
  'Riga',
  'Vilnius',
  'Kaunas',
  'Warsaw',
  'Bialystok',
  'Krakow',
  'Gdansk',
  'Siauliai',
  'Klaipeda',
  'Panevezys'
];
const CITIES_NON_SCHENGEN = ['Minsk', 'Brest', 'Grodno', 'Moscow', 'St. Petersburg', 'Kiev'];

const HUB_SPOKE_CONNECTIONS = [
  { hub: 'Siauliai', spoke: 'Kursenai', distance: 25 },
  { hub: 'Siauliai', spoke: 'Telsiai', distance: 70 },
  { hub: 'Siauliai', spoke: 'Mazeikiai', distance: 80 },
  { hub: 'Klaipeda', spoke: 'Telsiai', distance: 90 },
  { hub: 'Klaipeda', spoke: 'Mazeikiai', distance: 110 },
  { hub: 'Vilnius', spoke: 'Elektrenai', distance: 50 },
  { hub: 'Panevezys', spoke: 'Kursenai', distance: 90 }
];

const LEGAL_CARGO_TYPES = [
  CargoType.ELECTRONICS,
  CargoType.AGRICULTURAL_MACHINERY,
  CargoType.DAIRY_PRODUCTS,
  CargoType.TIMBER,
  CargoType.PHARMACEUTICALS,
  CargoType.STEEL_COILS
];

export class ContractService {
  private static isRunning = false;
  private static intervalId: NodeJS.Timeout | null = null;
  private static REFRESH_INTERVAL_MS = 60000; // 1 minute for fast gameplay iteration

  /**
   * Starts the background contract regenerator
   */
  static startGenerator() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log(`[Contracts] Starting contract regeneration ticker (Runs every ${this.REFRESH_INTERVAL_MS / 1000}s)...`);
    
    this.intervalId = setInterval(async () => {
      try {
        await this.refreshContracts();
      } catch (error) {
        console.error('[Contracts] Error regenerating contracts:', error);
      }
    }, this.REFRESH_INTERVAL_MS);
    
    // Run immediately on start
    this.refreshContracts();
  }

  private static rollContractType(): { contractType: 'SPOT' | 'PERSISTENT' | 'LIMITED', remainingQuota: number | null, expiresAt: Date | null } {
    const roll = Math.random();
    if (roll < 0.75) {
      return { contractType: 'SPOT', remainingQuota: null, expiresAt: null };
    } else if (roll < 0.90) {
      return { contractType: 'PERSISTENT', remainingQuota: null, expiresAt: null };
    } else {
      // LIMITED contract (runs for +30 minutes in future, global quota e.g. 50,000 kg to 150,000 kg)
      const expiresAt = new Date(Date.now() + 30 * 60000);
      const remainingQuota = Math.floor(Math.random() * 100000) + 50000; // 50k to 150k kg
      return { contractType: 'LIMITED', remainingQuota, expiresAt };
    }
  }

  private static async refreshContracts() {
    // 1. Delete stale contracts that are NOT currently active on any truck route
    const now = new Date();
    const expiryThreshold = new Date(now.getTime() - 15 * 60000); // 15 mins old

    // SPOT contracts decay by time. LIMITED contracts decay if expiresAt is passed.
    // PERSISTENT contracts are retained on the board indefinitely.
    const deletedLegal = await prisma.legalContract.deleteMany({
      where: {
        activeRoutes: { none: {} },
        OR: [
          {
            contractType: 'SPOT',
            createdAt: { lt: expiryThreshold }
          },
          {
            contractType: 'LIMITED',
            expiresAt: { lt: now }
          }
        ]
      }
    });

    const deletedContraband = await prisma.contrabandJob.deleteMany({
      where: {
        activeRoutes: { none: {} },
        OR: [
          {
            contractType: 'SPOT',
            createdAt: { lt: expiryThreshold }
          },
          {
            contractType: 'LIMITED',
            expiresAt: { lt: now }
          }
        ]
      }
    });

    if (deletedLegal.count > 0 || deletedContraband.count > 0) {
      console.log(`[Contracts] Cleared stale job board entries: ${deletedLegal.count} Legal, ${deletedContraband.count} Contraband.`);
    }

    // 2. Ensure minimum pool sizes
    const legalCount = await prisma.legalContract.count();
    const contrabandCount = await prisma.contrabandJob.count();

    const LEGAL_TARGET = 8;
    const CONTRABAND_TARGET = 4;

    if (legalCount < LEGAL_TARGET) {
      const needed = LEGAL_TARGET - legalCount;
      await this.generateLegalContracts(needed);
    }

    if (contrabandCount < CONTRABAND_TARGET) {
      const needed = CONTRABAND_TARGET - contrabandCount;
      await this.generateContrabandJobs(needed);
    }
  }

  private static async generateLegalContracts(count: number) {
    const newContracts = [];
    for (let i = 0; i < count; i++) {
      const { contractType, remainingQuota, expiresAt } = this.rollContractType();

      // 35% probability of generating a Hub-and-Spoke local connection
      if (Math.random() < 0.35 && HUB_SPOKE_CONNECTIONS.length > 0) {
        const conn = this.getRandomItem(HUB_SPOKE_CONNECTIONS);
        // Decide direction: Hub -> Spoke or Spoke -> Hub
        const isHubToSpoke = Math.random() > 0.5;
        const origin = isHubToSpoke ? conn.hub : conn.spoke;
        const destination = isHubToSpoke ? conn.spoke : conn.hub;
        
        const distanceKm = conn.distance;
        const basePayout = distanceKm * 30; // Premium local rate of $30/km
        const variance = 1.0 + (Math.random() * 0.4 - 0.2); // +/- 20%
        const payoutLegal = Math.floor(basePayout * variance);

        newContracts.push({
          cargoType: this.getRandomItem(LEGAL_CARGO_TYPES),
          origin,
          destination,
          distanceKm,
          payoutLegal,
          deadlineHours: Math.floor(Math.random() * 12) + 6, // Local feed routes have shorter deadlines
          contractType,
          remainingQuota,
          expiresAt
        });
      } else {
        const origin = this.getRandomItem(CITIES_SCHENGEN);
        let destination = this.getRandomItem(CITIES_SCHENGEN);
        while (destination === origin) destination = this.getRandomItem(CITIES_SCHENGEN);
        
        const distanceKm = Math.floor(Math.random() * 400) + 100; // 100-500km
        const basePayout = distanceKm * 15; // ~$15 per km
        const variance = 1.0 + (Math.random() * 0.4 - 0.2); // +/- 20%
        const payoutLegal = Math.floor(basePayout * variance);
        
        newContracts.push({
          cargoType: this.getRandomItem(LEGAL_CARGO_TYPES),
          origin,
          destination,
          distanceKm,
          payoutLegal,
          deadlineHours: Math.floor(Math.random() * 24) + 12,
          contractType,
          remainingQuota,
          expiresAt
        });
      }
    }

    await prisma.legalContract.createMany({ data: newContracts });
    console.log(`[Contracts] Generated ${count} new legal logistics contracts.`);
  }

  private static async generateContrabandJobs(count: number) {
    const newJobs = [];
    const classes = [ContrabandClass.CLASS_A, ContrabandClass.CLASS_B, ContrabandClass.CLASS_C];
    
    for (let i = 0; i < count; i++) {
      const { contractType, remainingQuota, expiresAt } = this.rollContractType();

      const isImport = Math.random() > 0.5;
      const origin = isImport ? this.getRandomItem(CITIES_NON_SCHENGEN) : this.getRandomItem(CITIES_SCHENGEN);
      const destination = isImport ? this.getRandomItem(CITIES_SCHENGEN) : this.getRandomItem(CITIES_NON_SCHENGEN);
      
      const cargoClass = this.getRandomItem(classes);
      let riskMultiplier = 1.5;
      let baseBlackPayout = 10000;
      let baseLegalPayout = 0;

      if (cargoClass === ContrabandClass.CLASS_B) {
        riskMultiplier = 2.5 + Math.random();
        baseBlackPayout = 30000 + Math.random() * 10000;
      } else if (cargoClass === ContrabandClass.CLASS_C) {
        riskMultiplier = 4.0 + Math.random() * 1.5;
        baseBlackPayout = 75000 + Math.random() * 25000;
        baseLegalPayout = 5000; // Laundered kicker
      } else {
        riskMultiplier = 1.0 + Math.random() * 0.5;
        baseBlackPayout = 12000 + Math.random() * 5000;
      }

      newJobs.push({
        cargoClass,
        origin,
        destination,
        riskMultiplier: parseFloat(riskMultiplier.toFixed(2)),
        payoutBlack: Math.floor(baseBlackPayout),
        payoutLegal: baseLegalPayout,
        contractType,
        remainingQuota,
        expiresAt
      });
    }

    await prisma.contrabandJob.createMany({ data: newJobs });
    console.log(`[Contracts] Generated ${count} new underworld contraband jobs.`);
  }

  private static getRandomItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  static stopGenerator() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }
}
