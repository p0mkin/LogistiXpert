import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import { CITIES_DATASET } from '../domain/cities';
import { AnalyticsService } from '../services/analytics.service';
import { GameWebSocketServer } from '../websocket';

const router = Router();
const prisma = new PrismaClient();

export interface FuelStation {
  id: string;
  name: string;
  city: string;
  cityId: string;
}

const BRANDS = ['Shell', 'Circle K', 'BP', 'OMV', 'Neste', 'Orlen'];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export class FuelStationService {
  private static stations: FuelStation[] = [];

  static getStations(): FuelStation[] {
    if (this.stations.length === 0) {
      for (const cityId of Object.keys(CITIES_DATASET)) {
        const city = CITIES_DATASET[cityId];
        for (let i = 1; i <= 6; i++) {
          const brand = BRANDS[(cityId.length + i) % BRANDS.length];
          this.stations.push({
            id: `fs_${cityId}_${i}`,
            name: `${brand} ${city.name} Station #${i}`,
            city: city.name,
            cityId: city.id,
          });
        }
      }
    }
    return this.stations;
  }

  static getStationById(id: string): FuelStation | undefined {
    return this.getStations().find(s => s.id === id);
  }
}

// 1. GET ALL FUEL STATIONS WITH PRICES
router.get('/', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const stations = FuelStationService.getStations();

  try {
    const marketPrices = await prisma.commodityMarket.findMany();
    const pricesMap: Record<string, number> = {};
    for (const p of marketPrices) {
      pricesMap[p.commodityType] = p.currentPrice.toNumber();
    }

    const stationsWithPrices = stations.map(s => {
      const offset = -0.15 + (hashCode(s.id) % 31) * 0.01;
      const dieselMarket = pricesMap['DIESEL'] || 1.50;
      const electricityMarket = pricesMap['ELECTRICITY'] || 0.22;
      const adblueMarket = pricesMap['ADBLUE'] || 0.85;

      return {
        ...s,
        offsetPercent: Math.round(offset * 100),
        prices: {
          DIESEL: parseFloat((dieselMarket * (1 + offset)).toFixed(3)),
          ELECTRICITY: parseFloat((electricityMarket * (1 + offset)).toFixed(3)),
          ADBLUE: parseFloat((adblueMarket * (1 + offset)).toFixed(3)),
        }
      };
    });

    res.json(stationsWithPrices);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch fuel station list.' });
  }
});

// 2. REFUEL TRUCK MID-ROUTE
router.post('/:id/refuel', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { id: stationId } = req.params;
  const { truckId } = req.body;

  if (!truckId) {
    return res.status(400).json({ error: 'MISSING_TRUCK_ID', message: 'truckId is required.' });
  }

  const station = FuelStationService.getStationById(stationId);
  if (!station) {
    return res.status(404).json({ error: 'STATION_NOT_FOUND', message: 'Fuel station not found.' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) throw new Error('COMPANY_NOT_FOUND');

      const truck = await tx.truck.findUnique({
        where: { id: truckId },
        include: { activeRoute: true, garage: true },
      });
      if (!truck || truck.companyId !== companyId) throw new Error('TRUCK_NOT_FOUND');
      if (!truck.activeRoute) throw new Error('TRUCK_NOT_ON_ROUTE');

      const currentCity = truck.activeRoute.currentCity || '';
      if (currentCity.toLowerCase() !== station.city.toLowerCase()) {
        throw new Error(`TRUCK_NOT_IN_CITY:${station.city}`);
      }

      const isEV = truck.model.toLowerCase().includes('ev') || truck.model.toLowerCase().includes('electric');
      const commodityType = isEV ? 'ELECTRICITY' : 'DIESEL';

      const basePrices = await tx.commodityMarket.findMany();
      const marketPriceRecord = basePrices.find(p => p.commodityType === commodityType);
      const marketPrice = marketPriceRecord ? marketPriceRecord.currentPrice.toNumber() : (isEV ? 0.22 : 1.50);

      const offset = -0.15 + (hashCode(stationId) % 31) * 0.01;
      const unitPrice = marketPrice * (1 + offset);

      const refuelAmount = truck.fuelCapacity || (isEV ? 400.0 : 400.0);
      const cost = unitPrice * refuelAmount;

      if (company.legalBalance.toNumber() < cost) {
        throw new Error(`INSUFFICIENT_FUNDS:${cost}`);
      }

      const updatedCompany = await tx.company.update({
        where: { id: companyId },
        data: { legalBalance: { decrement: cost } }
      });

      const garageField = isEV ? 'electricityStorage' : 'dieselStorage';
      const garageMaxField = isEV ? 'maxElectricity' : 'maxDiesel';

      const currentGarageStock = truck.garage[garageField];
      const maxGarageStock = truck.garage[garageMaxField];

      const newStock = Math.min(maxGarageStock, currentGarageStock + refuelAmount);

      await tx.garage.update({
        where: { id: truck.garageId },
        data: { [garageField]: newStock }
      });

      if (truck.activeRoute.isPaused) {
        await tx.activeRoute.update({
          where: { id: truck.activeRoute.id },
          data: { isPaused: false }
        });
      }

      await AnalyticsService.recordTransaction(
        tx,
        companyId,
        truck.garageId,
        truck.garage.city,
        'EXPENSE_FUEL',
        cost
      );

      await tx.truckHistory.create({
        data: {
          truckId,
          eventType: 'REFUEL',
          description: `Mid-route refuel at ${station.name} (${station.city}). Purchased ${refuelAmount.toFixed(1)} units of ${commodityType} for $${cost.toFixed(2)} Clean Cash.`,
        }
      });

      return { updatedCompany, cost, refuelAmount, commodityType, garageId: truck.garageId };
    });

    GameWebSocketServer.sendToCompany(companyId, 'company:balance_update', {
      legalBalance: parseFloat(Number(result.updatedCompany.legalBalance).toFixed(2)),
      blackMarketBalance: parseFloat(Number(result.updatedCompany.blackMarketBalance).toFixed(2)),
      message: `⛽ REFUEL SUCCESS: Paid $${result.cost.toFixed(2)} for ${result.refuelAmount.toFixed(0)} units of ${result.commodityType} at ${result.updatedCompany.name === companyId ? 'Station' : station.name}.`,
    });

    const garageState = await prisma.garage.findUnique({ where: { id: result.garageId } });
    if (garageState) {
      GameWebSocketServer.sendToCompany(companyId, 'garage:stock_update', {
        garageId: result.garageId,
        dieselStorage: garageState.dieselStorage,
        electricityStorage: garageState.electricityStorage,
        adblueStorage: garageState.adblueStorage,
        co2Allowances: garageState.co2Allowances,
      });
    }

    res.json({
      success: true,
      message: `Truck refueled successfully. Paid $${result.cost.toFixed(2)}.`,
      cost: result.cost,
      refuelAmount: result.refuelAmount,
    });

  } catch (error: any) {
    const msg = error.message || '';
    if (msg.startsWith('INSUFFICIENT_FUNDS:')) {
      const cost = parseFloat(msg.split(':')[1]);
      return res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: `Refueling costs $${cost.toFixed(2)} Clean Cash.` });
    }
    if (msg.startsWith('TRUCK_NOT_IN_CITY:')) {
      const city = msg.split(':')[1];
      return res.status(400).json({ error: 'TRUCK_NOT_IN_CITY', message: `Truck is not in ${city}.` });
    }
    const friendly: Record<string, string> = {
      TRUCK_NOT_FOUND: 'Truck not found or not owned.',
      TRUCK_NOT_ON_ROUTE: 'Truck must be on an active route to refuel mid-route.',
    };
    res.status(400).json({ error: msg, message: friendly[msg] || 'Refuel failed.' });
  }
});

export default router;
