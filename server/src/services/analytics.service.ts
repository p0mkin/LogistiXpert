import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export type TransactionType =
  | 'REVENUE_LEGAL'
  | 'REVENUE_BLACK'
  | 'EXPENSE_FUEL'
  | 'EXPENSE_REPAIRS'
  | 'EXPENSE_INTEREST'
  | 'EXPENSE_BRIBES_FINES'
  | 'ROUTE_DISPATCHED'
  | 'ROUTE_COMPLETED';

export class AnalyticsService {
  static getDateStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  static getCargoWeight(tier: string): number {
    const weightMap: Record<string, number> = {
      'VAN': 4000,
      'RIGID_MEDIUM': 9000,
      'RIGID_HEAVY': 16000,
      'ARTICULATED': 24000,
      'SUPER_HEAVY': 45000,
    };
    return weightMap[tier] || 4000;
  }

  static getBaseCapacity(city: string): number {
    const name = city.toLowerCase().replace(/[^a-z0-9]/g, '');
    const metros = ['stockholm', 'berlin', 'vilnius', 'warsaw', 'tallinn', 'riga', 'copenhagen', 'helsinki', 'oslo'];
    const regionals = ['siauliai', 'klaipeda', 'panevezys', 'kaunas', 'bialystok', 'gdansk'];

    if (metros.includes(name)) {
      return 1000000;
    }
    if (regionals.includes(name)) {
      return 300000;
    }
    return 80000;
  }

  static async getRemainingFreightCapacities(cities: string[], companyId: string): Promise<Record<string, number>> {
    const dateStr = this.getDateStr();

    // 1. Fetch company reputation score
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { reputationScore: true },
    });

    const repScore = company?.reputationScore || 0;
    const repBonus = Math.max(-0.9, Math.min(1.0, repScore * 0.001));
    // Fix floating point precision issues by rounding to two decimal places
    const reputationMultiplier = Math.round((1 + repBonus) * 100) / 100;

    // 2. Fetch local terminals (garages) to check terminalLevel
    const garages = await prisma.garage.findMany({
      where: {
        companyId,
        city: { in: cities, mode: 'insensitive' },
      },
      select: { city: true, terminalLevel: true },
    });

    // Create a map for case-insensitive city lookup
    const garageMap = new Map(garages.map(g => [g.city.toLowerCase(), g.terminalLevel]));

    // 3. Query daily freight usage for all requested cities
    const cityDailies = await prisma.cityDailyFreight.findMany({
      where: {
        city: { in: cities },
        dateStr,
      },
    });

    const dailyMap = new Map(cityDailies.map(cd => [cd.city, cd.shippedKg]));

    const result: Record<string, number> = {};

    for (const city of cities) {
      const baseCapacity = this.getBaseCapacity(city);

      // Terminal level scales base capacity (+25% per level: level 1 is 100%, level 2 is 125%, level 3 is 150%, level 4 is 175%)
      const terminalLevel = garageMap.get(city.toLowerCase()) || 1;
      const terminalMultiplier = 1 + (terminalLevel - 1) * 0.25;

      const totalCapacity = Math.floor(baseCapacity * terminalMultiplier * reputationMultiplier);

      const shippedKg = dailyMap.get(city) || 0;
      result[city] = Math.max(0, totalCapacity - shippedKg);
    }

    return result;
  }

  static async getRemainingFreightCapacity(city: string, companyId: string): Promise<number> {
    const capacities = await this.getRemainingFreightCapacities([city], companyId);
    return capacities[city] || 0;
  }

  static async recordFreightShipped(
    tx: Prisma.TransactionClient,
    city: string,
    weightKg: number
  ): Promise<void> {
    const dateStr = this.getDateStr();
    await tx.cityDailyFreight.upsert({
      where: { city_dateStr: { city, dateStr } },
      update: { shippedKg: { increment: weightKg } },
      create: { city, dateStr, shippedKg: weightKg },
    });
  }

  static async recordTransaction(
    tx: Prisma.TransactionClient,
    companyId: string,
    garageId: string | null,
    city: string | null,
    type: TransactionType,
    amount: number,
    kgDelivered: number = 0
  ): Promise<void> {
    const dateStr = this.getDateStr();
    const value = new Prisma.Decimal(amount);

    const updateData: Prisma.DailyPerformanceReportUpdateInput = {};
    const createData: Prisma.DailyPerformanceReportCreateInput = {
      company: { connect: { id: companyId } },
      dateStr,
    };

    switch (type) {
      case 'REVENUE_LEGAL':
        updateData.revenueLegal = { increment: value };
        createData.revenueLegal = value;
        break;
      case 'REVENUE_BLACK':
        updateData.revenueBlack = { increment: value };
        createData.revenueBlack = value;
        break;
      case 'EXPENSE_FUEL':
        updateData.expenseFuel = { increment: value };
        createData.expenseFuel = value;
        break;
      case 'EXPENSE_REPAIRS':
        updateData.expenseRepairs = { increment: value };
        createData.expenseRepairs = value;
        break;
      case 'EXPENSE_INTEREST':
        updateData.expenseInterest = { increment: value };
        createData.expenseInterest = value;
        break;
      case 'EXPENSE_BRIBES_FINES':
        updateData.expenseBribesFines = { increment: value };
        createData.expenseBribesFines = value;
        break;
      case 'ROUTE_DISPATCHED':
        updateData.routesDispatchedCount = { increment: 1 };
        createData.routesDispatchedCount = 1;
        break;
      case 'ROUTE_COMPLETED':
        updateData.routesCompletedCount = { increment: 1 };
        createData.routesCompletedCount = 1;
        if (kgDelivered > 0) {
          updateData.tonnageDeliveredKg = { increment: kgDelivered };
          createData.tonnageDeliveredKg = kgDelivered;
        }
        break;
    }

    // Upsert company-wide daily report
    await tx.dailyPerformanceReport.upsert({
      where: { companyId_dateStr: { companyId, dateStr } },
      update: updateData,
      create: createData,
    });

    // Upsert terminal-specific report if terminal and city are provided
    if (garageId && city) {
      const terminalUpdate: Prisma.TerminalDailyReportUpdateInput = {};
      const terminalCreate: Prisma.TerminalDailyReportCreateInput = {
        company: { connect: { id: companyId } },
        garageId,
        city,
        dateStr,
      };

      if (type === 'REVENUE_LEGAL') {
        terminalUpdate.revenueLegal = { increment: value };
        terminalCreate.revenueLegal = value;
      } else if (type === 'REVENUE_BLACK') {
        terminalUpdate.revenueBlack = { increment: value };
        terminalCreate.revenueBlack = value;
      }

      if (type === 'ROUTE_COMPLETED') {
        terminalUpdate.routesCompletedCount = { increment: 1 };
        terminalCreate.routesCompletedCount = 1;
        if (kgDelivered > 0) {
          terminalUpdate.tonnageDeliveredKg = { increment: kgDelivered };
          terminalCreate.tonnageDeliveredKg = kgDelivered;
        }
      }

      await tx.terminalDailyReport.upsert({
        where: { garageId_dateStr: { garageId, dateStr } },
        update: terminalUpdate,
        create: terminalCreate,
      });
    }
  }
}
