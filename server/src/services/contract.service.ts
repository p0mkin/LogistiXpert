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
  'Panevezys',
  'Helsinki',
  'Stockholm',
  'Malmoe',
  'Turku',
  'Prague',
  'Berlin',
  'Hamburg'
];
const CITIES_NON_SCHENGEN = ['Minsk', 'Brest', 'Grodno', 'Moscow', 'St. Petersburg', 'Kiev', 'Kaliningrad'];

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

  private static readonly CAPITAL_CITIES = new Set([
    'Tallinn', 'Riga', 'Vilnius', 'Helsinki', 'Stockholm', 'Warsaw', 'Berlin', 'Prague', 'Minsk', 'Kiev', 'Kyiv'
  ]);

  private static isCapital(city: string): boolean {
    return this.CAPITAL_CITIES.has(city) || Array.from(this.CAPITAL_CITIES).some(c => c.toLowerCase() === city.toLowerCase());
  }

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

    // 2. Query all unique terminal cities in the database
    const garages = await prisma.garage.findMany({
      select: { city: true, terminalLevel: true }
    });

    // Group garages by city to find the max terminal level in each city
    const cityLevels: Record<string, number> = {};
    garages.forEach(g => {
      const cityKey = g.city.trim().toLowerCase();
      cityLevels[cityKey] = Math.max(cityLevels[cityKey] || 0, g.terminalLevel);
    });

    // Default terminal cities if none exist in the database (fallback for starting setup)
    let terminalCities = Object.keys(cityLevels);
    if (terminalCities.length === 0) {
      terminalCities = ['tallinn', 'riga', 'vilnius', 'klaipeda'];
      terminalCities.forEach(c => {
        cityLevels[c] = 1; // Default level 1
      });
    }

    // Normalized display names lookup
    const canonicalCityNames: Record<string, string> = {
      tallinn: 'Tallinn',
      riga: 'Riga',
      vilnius: 'Vilnius',
      kaunas: 'Kaunas',
      warsaw: 'Warsaw',
      bialystok: 'Bialystok',
      krakow: 'Krakow',
      gdansk: 'Gdansk',
      siauliai: 'Siauliai',
      klaipeda: 'Klaipeda',
      panevezys: 'Panevezys',
      helsinki: 'Helsinki',
      stockholm: 'Stockholm',
      malmoe: 'Malmoe',
      turku: 'Turku',
      prague: 'Prague',
      berlin: 'Berlin',
      hamburg: 'Hamburg',
      minsk: 'Minsk',
      brest: 'Brest',
      grodno: 'Grodno',
      moscow: 'Moscow',
      'st. petersburg': 'St. Petersburg',
      kiev: 'Kiev',
      kaliningrad: 'Kaliningrad'
    };

    // For each terminal city, generate contracts up to the capacity limit
    for (const cityKey of terminalCities) {
      const originName = canonicalCityNames[cityKey] || cityKey.charAt(0).toUpperCase() + cityKey.slice(1);
      const level = cityLevels[cityKey] || 1;

      // Demand cap target = level-dependent
      const targetLegal = level + 1; // Level 1 = 2, Level 2 = 3, Level 3 = 4, Level 4 = 5
      const targetContraband = level; // Level 1 = 1, Level 2 = 2, Level 3 = 3, Level 4 = 4

      // Count existing contracts from this origin
      const currentLegal = await prisma.legalContract.count({
        where: { origin: originName }
      });
      const currentContraband = await prisma.contrabandJob.count({
        where: { origin: originName }
      });

      if (currentLegal < targetLegal) {
        const needed = targetLegal - currentLegal;
        await this.generateLegalContractsForCity(originName, level, needed);
      }

      if (currentContraband < targetContraband) {
        const needed = targetContraband - currentContraband;
        await this.generateContrabandJobsForCity(originName, level, needed);
      }
    }
  }

  private static async generateLegalContractsForCity(origin: string, level: number, count: number) {
    const newContracts = [];

    for (let i = 0; i < count; i++) {
      const { contractType, remainingQuota, expiresAt } = this.rollContractType();

      // Destination is another Schengen city
      let destination = this.getRandomItem(CITIES_SCHENGEN);
      while (destination.toLowerCase() === origin.toLowerCase()) {
        destination = this.getRandomItem(CITIES_SCHENGEN);
      }

      // Constraints based on level
      let maxDist = 9999;
      let maxWeight = 999999;
      let allowedCargos = LEGAL_CARGO_TYPES;

      if (level === 1) {
        maxDist = 200;
        maxWeight = 10000;
      } else if (level === 2) {
        maxDist = 500;
        maxWeight = 18000;
      } else if (level === 3) {
        maxWeight = 26000;
        // Cannot carry steel coils or agricultural machinery
        allowedCargos = LEGAL_CARGO_TYPES.filter(t => t !== CargoType.STEEL_COILS && t !== CargoType.AGRICULTURAL_MACHINERY);
      }

      const distanceKm = Math.min(maxDist, Math.floor(Math.random() * 400) + 100);
      let basePayout = distanceKm * 15; // standard payout rate

      // Capital City Premium
      if (this.isCapital(origin) || this.isCapital(destination)) {
        basePayout = basePayout * 1.25; // 25% premium
      }

      const variance = 1.0 + (Math.random() * 0.4 - 0.2); // +/- 20%
      const payoutLegal = Math.floor(basePayout * variance);

      newContracts.push({
        cargoType: this.getRandomItem(allowedCargos),
        origin,
        destination,
        distanceKm,
        payoutLegal,
        deadlineHours: Math.floor(Math.random() * 24) + 12,
        contractType,
        remainingQuota: remainingQuota ? Math.min(remainingQuota, maxWeight) : null,
        expiresAt
      });
    }

    if (newContracts.length > 0) {
      await prisma.legalContract.createMany({ data: newContracts });
      console.log(`[Contracts] Generated ${newContracts.length} new legal contracts for origin ${origin}.`);
    }
  }

  private static async generateContrabandJobsForCity(origin: string, level: number, count: number) {
    const newJobs = [];
    const classes: ContrabandClass[] = [ContrabandClass.CLASS_A, ContrabandClass.CLASS_B, ContrabandClass.CLASS_C];
    const originIsSchengen = CITIES_SCHENGEN.some(c => c.toLowerCase() === origin.toLowerCase());

    for (let i = 0; i < count; i++) {
      const { contractType, remainingQuota, expiresAt } = this.rollContractType();

      // Smuggling route must cross Schengen border
      let destination = "";
      if (originIsSchengen) {
        destination = this.getRandomItem(CITIES_NON_SCHENGEN);
      } else {
        destination = this.getRandomItem(CITIES_SCHENGEN);
      }

      // Constraints based on level
      let allowedClasses: ContrabandClass[] = [ContrabandClass.CLASS_A];
      if (level >= 2) allowedClasses.push(ContrabandClass.CLASS_B);
      if (level >= 3) allowedClasses.push(ContrabandClass.CLASS_C);

      const cargoClass = this.getRandomItem(allowedClasses);
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

      // Capital premium
      if (this.isCapital(origin) || this.isCapital(destination)) {
        baseBlackPayout = baseBlackPayout * 1.25;
        if (baseLegalPayout > 0) baseLegalPayout = baseLegalPayout * 1.25;
      }

      newJobs.push({
        cargoClass,
        origin,
        destination,
        riskMultiplier: parseFloat(riskMultiplier.toFixed(2)),
        payoutBlack: Math.floor(baseBlackPayout),
        payoutLegal: Math.floor(baseLegalPayout),
        contractType,
        remainingQuota,
        expiresAt
      });
    }

    if (newJobs.length > 0) {
      await prisma.contrabandJob.createMany({ data: newJobs });
      console.log(`[Contracts] Generated ${newJobs.length} new contraband jobs for origin ${origin}.`);
    }
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
