import { PrismaClient, CommodityType } from '@prisma/client';
import { GameWebSocketServer } from '../websocket';
import { AnalyticsService } from './analytics.service';

const prisma = new PrismaClient();

interface MarketConfig {
  basePrice: number;
  minPrice: number;
  maxPrice: number;
  volatility: number;
}

const COMMODITY_CONFIGS: Record<CommodityType, MarketConfig> = {
  [CommodityType.DIESEL]: {
    basePrice: 1.50,
    minPrice: 1.10,
    maxPrice: 2.50,
    volatility: 1.2,
  },
  [CommodityType.ELECTRICITY]: {
    basePrice: 0.22,
    minPrice: 0.12,
    maxPrice: 0.45,
    volatility: 0.8,
  },
  [CommodityType.ADBLUE]: {
    basePrice: 0.85,
    minPrice: 0.55,
    maxPrice: 1.45,
    volatility: 1.0,
  },
  [CommodityType.CO2_ALLOWANCE]: {
    basePrice: 85.00,
    minPrice: 45.00,
    maxPrice: 165.00,
    volatility: 1.5,
  },
};

export class CommodityMarketService {
  private static ticker: NodeJS.Timeout | null = null;

  /**
   * Initializes market prices in the database if they do not exist
   */
  static async seedMarketPrices() {
    console.log('[CommodityMarket] Checking/seeding default commodity prices...');
    for (const type of Object.values(CommodityType)) {
      const config = COMMODITY_CONFIGS[type];
      const existing = await prisma.commodityMarket.findUnique({
        where: { commodityType: type },
      });

      if (!existing) {
        await prisma.commodityMarket.create({
          data: {
            commodityType: type,
            currentPrice: config.basePrice,
            volatilityIndex: config.volatility,
          },
        });
        console.log(`[CommodityMarket] Seeded starting price for ${type}: $${config.basePrice.toFixed(2)}`);
      }
    }
  }

  private static consumptionMap: Record<CommodityType, number> = {
    [CommodityType.DIESEL]: 0,
    [CommodityType.ELECTRICITY]: 0,
    [CommodityType.ADBLUE]: 0,
    [CommodityType.CO2_ALLOWANCE]: 0,
  };

  static recordConsumption(type: CommodityType, amount: number) {
    this.consumptionMap[type] += amount;
  }

  /**
   * Starts the background pricing engine, running a random-walk fluctuation tick
   */
  static startPricingEngine(intervalMs = 60000) {
    if (this.ticker) {
      clearInterval(this.ticker);
    }

    console.log(`[CommodityMarket] Launching dynamic pricing engine (ticks every ${intervalMs / 1000}s)...`);
    this.ticker = setInterval(async () => {
      try {
        const prices = await prisma.commodityMarket.findMany();
        const updates: any[] = [];

        for (const record of prices) {
          const config = COMMODITY_CONFIGS[record.commodityType];
          const priceNum = record.currentPrice.toNumber();

          const consumed = this.consumptionMap[record.commodityType];
          this.consumptionMap[record.commodityType] = 0; // Reset for next tick

          // If highly consumed, demand is high, price goes up. If low, it drops.
          let demandDrift = 0;
          if (consumed > 500) demandDrift = 0.04;
          else if (consumed > 100) demandDrift = 0.01;
          else if (consumed === 0) demandDrift = -0.02;

          // Random Walk with slight drift towards base price
          const driftDirection = priceNum > config.basePrice ? -0.01 : 0.01;
          const randomFactor = (Math.random() - 0.5) * 2.0; // -1 to 1
          const changePercent = (randomFactor * 0.03 * record.volatilityIndex) + driftDirection + demandDrift;
          
          let newPrice = priceNum * (1 + changePercent);
          
          // Clamp price within configured boundaries
          newPrice = Math.min(Math.max(newPrice, config.minPrice), config.maxPrice);

          const updated = await prisma.commodityMarket.update({
            where: { id: record.id },
            data: {
              currentPrice: newPrice,
              lastUpdated: new Date(),
            },
          });

          updates.push({
            commodityType: record.commodityType,
            currentPrice: newPrice,
            priceChangePercent: ((newPrice - priceNum) / priceNum) * 100,
          });
        }

        // Broadcast prices update to all connected clients globally
        GameWebSocketServer.broadcast('market:price_update', {
          prices: updates,
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        console.error('[CommodityMarket] Failed to run price fluctuation tick:', error);
      }
    }, intervalMs);
  }

  /**
   * Stops the background pricing engine
   */
  static stopPricingEngine() {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  /**
   * Purchases a commodity and deposits it into the target garage stockpile
   */
  static async purchaseCommodity(
    companyId: string,
    garageId: string,
    type: CommodityType,
    amount: number
  ) {
    if (amount <= 0) {
      throw new Error('INVALID_AMOUNT');
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Fetch current price
      const marketRecord = await tx.commodityMarket.findUnique({
        where: { commodityType: type },
      });
      if (!marketRecord) {
        throw new Error('COMMODITY_NOT_FOUND');
      }

      const unitPrice = marketRecord.currentPrice.toNumber();
      const totalCost = unitPrice * amount;

      // 2. Fetch company balances
      const company = await tx.company.findUnique({
        where: { id: companyId },
      });
      if (!company) {
        throw new Error('COMPANY_NOT_FOUND');
      }

      if (company.legalBalance.toNumber() < totalCost) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      // 3. Fetch garage and verify capacity constraints
      const garage = await tx.garage.findUnique({
        where: { id: garageId },
      });
      if (!garage || garage.companyId !== companyId) {
        throw new Error('GARAGE_NOT_FOUND');
      }

      let currentStorage = 0;
      let maxStorage = Infinity;

      switch (type) {
        case CommodityType.DIESEL:
          currentStorage = garage.dieselStorage;
          maxStorage = garage.maxDiesel;
          break;
        case CommodityType.ELECTRICITY:
          currentStorage = garage.electricityStorage;
          maxStorage = garage.maxElectricity;
          break;
        case CommodityType.ADBLUE:
          currentStorage = garage.adblueStorage;
          maxStorage = garage.maxAdblue;
          break;
        case CommodityType.CO2_ALLOWANCE:
          currentStorage = garage.co2Allowances;
          maxStorage = Infinity; // CO2 allowances are electronic credits, unlimited storage
          break;
      }

      if (currentStorage + amount > maxStorage) {
        throw new Error('STORAGE_CAPACITY_EXCEEDED');
      }

      // 4. Deduct cost from company legal balance
      const updatedCompany = await tx.company.update({
        where: { id: companyId },
        data: {
          legalBalance: { decrement: totalCost },
        },
      });

      // Record fuel expense transaction
      await AnalyticsService.recordTransaction(
        tx,
        companyId,
        garageId,
        garage.city,
        'EXPENSE_FUEL',
        totalCost
      );

      // 5. Update garage storage stockpiles
      const garageUpdateData: any = {};
      switch (type) {
        case CommodityType.DIESEL:
          garageUpdateData.dieselStorage = { increment: amount };
          break;
        case CommodityType.ELECTRICITY:
          garageUpdateData.electricityStorage = { increment: amount };
          break;
        case CommodityType.ADBLUE:
          garageUpdateData.adblueStorage = { increment: amount };
          break;
        case CommodityType.CO2_ALLOWANCE:
          garageUpdateData.co2Allowances = { increment: amount };
          break;
      }

      const updatedGarage = await tx.garage.update({
        where: { id: garageId },
        data: garageUpdateData,
      });

      // 6. Broadcast updated balances and garage stats company-wide
      GameWebSocketServer.sendToCompany(companyId, 'company:balance_update', {
        legalBalance: updatedCompany.legalBalance.toNumber(),
        blackMarketBalance: updatedCompany.blackMarketBalance.toNumber(),
      });

      return {
        company: updatedCompany,
        garage: updatedGarage,
        totalCost,
        unitPrice,
      };
    });
  }
}
