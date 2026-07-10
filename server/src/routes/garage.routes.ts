import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import fs from 'fs';
import path from 'path';
import { GameWebSocketServer } from '../websocket';

const router = Router();
const prisma = new PrismaClient();

const nicknamesFilePath = path.join(__dirname, '../../data/truck_nicknames.json');

function getTruckNicknames() {
  try {
    if (fs.existsSync(nicknamesFilePath)) {
      return JSON.parse(fs.readFileSync(nicknamesFilePath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to read truck nicknames:', e);
  }
  return {};
}

function saveTruckNicknames(nicknames: any) {
  try {
    const dir = path.dirname(nicknamesFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(nicknamesFilePath, JSON.stringify(nicknames, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save truck nicknames:', e);
  }
}

// Apply auth protection globally to all garage routes
router.use(authenticateJWT);

// 1. GET ALL USER GARAGES & TRUCKS
router.get('/', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const garages = await prisma.garage.findMany({
      where: { companyId },
      include: {
        trucks: {
          include: {
            driver: true,
            history: { orderBy: { recordedAt: 'desc' }, take: 10 },
          },
        },
      },
    });

    const nicknames = getTruckNicknames();
    const garagesWithNicknames = garages.map((g) => ({
      ...g,
      trucks: g.trucks.map((t) => ({
        ...t,
        nickname: nicknames[t.id] || '',
      })),
    }));

    res.json(garagesWithNicknames);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve garages and vehicles.' });
  }
});

// 2. APPLY UNDERWORLD TRUCK RIGGING MODIFICATIONS
router.patch('/trucks/:truckId/mod', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { truckId } = req.params;
  const { fuelTankMod, scannerShielding } = req.body; // FuelTankMod enum, scannerShielding (0-5)

  try {
    // 1. Verify ownership
    const truck = await prisma.truck.findUnique({ where: { id: truckId } });
    if (!truck || truck.companyId !== companyId) {
      return res.status(404).json({ error: 'TRUCK_NOT_FOUND', message: 'Vehicle does not exist in your fleet.' });
    }

    if (truck.isImpounded) {
      return res.status(400).json({ error: 'TRUCK_IMPOUNDED', message: 'Cannot modify a vehicle currently in police impound.' });
    }

    // 2. Deduct modification cost from black market balance
    let cost = 0;
    if (fuelTankMod === 'FALSE_BOTTOM') cost += 5000;
    if (fuelTankMod === 'CHASSIS_CAVITY') cost += 12000;
    if (scannerShielding && scannerShielding > truck.scannerShielding) {
      cost += (scannerShielding - truck.scannerShielding) * 3500; // $3500 per shielding level
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.blackMarketBalance.toNumber() < cost) {
      return res.status(400).json({
        error: 'INSUFFICIENT_BLACK_MARKET_FUNDS',
        message: `Upgrades cost $${cost} Black Market Cash. You need more illegal proceeds.`,
      });
    }

    // 3. Apply modification inside a transaction
    const updatedTruck = await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: { blackMarketBalance: { decrement: cost } },
      });

      const updated = await tx.truck.update({
        where: { id: truckId },
        data: {
          fuelTankMod: fuelTankMod || truck.fuelTankMod,
          scannerShielding: scannerShielding !== undefined ? scannerShielding : truck.scannerShielding,
        },
      });

      await tx.truckHistory.create({
        data: {
          truckId,
          eventType: 'MODIFICATION',
          description: `Applied underworld modifications. Fuel Mod: ${fuelTankMod || 'UNCHANGED'}, Scanner Shielding Level: ${scannerShielding !== undefined ? scannerShielding : 'UNCHANGED'}. Total cost: $${cost} (Black Market Cash).`,
        },
      });

      return updated;
    });

    res.json({
      message: 'Modification applied successfully!',
      truck: updatedTruck,
    });
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to process mechanical modification.' });
  }
});

// 3. UPGRADE WAREHOUSE TERMINAL LEVEL
router.post('/:id/upgrade-terminal', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { id } = req.params;

  try {
    // 1. Verify ownership and load garage
    const garage = await prisma.garage.findUnique({ where: { id } });
    if (!garage || garage.companyId !== companyId) {
      return res.status(404).json({ error: 'GARAGE_NOT_FOUND', message: 'Garage terminal not found.' });
    }

    const currentLevel = garage.terminalLevel;
    if (currentLevel >= 4) {
      return res.status(400).json({
        error: 'MAX_TERMINAL_LEVEL_REACHED',
        message: 'This terminal is already at the maximum level (Level 4).',
      });
    }

    // 2. Determine upgrade cost
    let cost = 0;
    if (currentLevel === 1) cost = 100000;
    else if (currentLevel === 2) cost = 500000;
    else if (currentLevel === 3) cost = 2500000;

    // 3. Verify company legal balance
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.legalBalance.toNumber() < cost) {
      return res.status(400).json({
        error: 'INSUFFICIENT_FUNDS',
        message: `Upgrades to Level ${currentLevel + 1} cost $${cost.toLocaleString()} Clean Cash. Your balance is insufficient.`,
      });
    }

    // 4. Perform transaction
    const upgradedGarage = await prisma.$transaction(async (tx) => {
      // Deduct funds from company
      await tx.company.update({
        where: { id: companyId },
        data: { legalBalance: { decrement: cost } },
      });

      // Increment terminal level of garage
      const updated = await tx.garage.update({
        where: { id },
        data: { terminalLevel: currentLevel + 1 },
      });

      return updated;
    });

    res.json({
      message: `Terminal upgraded successfully to Level ${currentLevel + 1}!`,
      garage: upgradedGarage,
    });
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to upgrade terminal level.' });
  }
});

// 4. UPGRADE COMMODITY STORAGE CAPACITY
router.post('/:id/upgrade-storage', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { id } = req.params;
  const { commodityType } = req.body;

  if (!commodityType || !['DIESEL', 'ELECTRICITY', 'ADBLUE'].includes(commodityType.toUpperCase())) {
    return res.status(400).json({ error: 'INVALID_COMMODITY_TYPE', message: 'Commodity type must be DIESEL, ELECTRICITY, or ADBLUE.' });
  }

  const type = commodityType.toUpperCase();

  try {
    // 1. Verify ownership and load garage
    const garage = await prisma.garage.findUnique({ where: { id } });
    if (!garage || garage.companyId !== companyId) {
      return res.status(404).json({ error: 'GARAGE_NOT_FOUND', message: 'Garage terminal not found.' });
    }

    let cost = 0;
    let increment = 0;
    let currentVal = 0;
    let maxAllowed = 0;
    let field = '';

    if (type === 'DIESEL') {
      cost = 12500;
      increment = 1000;
      maxAllowed = 20000;
      currentVal = garage.maxDiesel;
      field = 'maxDiesel';
    } else if (type === 'ELECTRICITY') {
      cost = 8000;
      increment = 500;
      maxAllowed = 10000;
      currentVal = garage.maxElectricity;
      field = 'maxElectricity';
    } else if (type === 'ADBLUE') {
      cost = 5000;
      increment = 250;
      maxAllowed = 5000;
      currentVal = garage.maxAdblue;
      field = 'maxAdblue';
    }

    if (currentVal >= maxAllowed) {
      return res.status(400).json({
        error: 'MAX_STORAGE_LIMIT_REACHED',
        message: `Maximum storage capacity of ${maxAllowed} reached for ${type}.`,
      });
    }

    // 3. Verify company legal balance
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.legalBalance.toNumber() < cost) {
      return res.status(400).json({
        error: 'INSUFFICIENT_FUNDS',
        message: `Upgrades to ${type} storage cost $${cost.toLocaleString()} Clean Cash. Your balance is insufficient.`,
      });
    }

    // 4. Perform transaction
    const upgradedGarage = await prisma.$transaction(async (tx) => {
      // Deduct funds from company
      await tx.company.update({
        where: { id: companyId },
        data: { legalBalance: { decrement: cost } },
      });

      // Increment storage capacity of garage
      const updated = await tx.garage.update({
        where: { id },
        data: { [field]: { increment } },
      });

      return updated;
    });

    res.json({
      message: `${type} storage capacity upgraded successfully by +${increment}!`,
      garage: upgradedGarage,
    });
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to upgrade storage capacity.' });
  }
});

// 5. PURCHASE NEW NODE TERMINAL (GARAGE)
router.post('/purchase-terminal', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { cityId } = req.body;

  if (!cityId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'City ID must be provided.' });
  }

  const PURCHASABLE_TERMINALS: Record<string, { city: string, cost: number }> = {
    turku: { city: 'Turku', cost: 180000 },
    stockholm: { city: 'Stockholm', cost: 320000 },
    malmoe: { city: 'Malmö', cost: 200000 },
    kaliningrad: { city: 'Kaliningrad', cost: 500000 },
    gdansk: { city: 'Gdańsk', cost: 220000 },
    warsaw: { city: 'Warsaw', cost: 350000 },
    krakow: { city: 'Kraków', cost: 240000 },
    berlin: { city: 'Berlin', cost: 600000 },
    hamburg: { city: 'Hamburg', cost: 380000 },
    prague: { city: 'Prague', cost: 420000 },
    minsk: { city: 'Minsk', cost: 700000 },
    kyiv: { city: 'Kyiv', cost: 550000 }
  };

  const normalizedKey = cityId.trim().toLowerCase();
  const term = PURCHASABLE_TERMINALS[normalizedKey];

  if (!term) {
    return res.status(400).json({ error: 'NOT_PURCHASABLE', message: `City terminal '${cityId}' is not purchasable.` });
  }

  try {
    // 1. Check if company already owns a terminal in this city
    const existing = await prisma.garage.findFirst({
      where: {
        companyId,
        city: { equals: term.city, mode: 'insensitive' }
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'ALREADY_OWNED', message: `You already own a terminal in ${term.city}.` });
    }

    // 2. Verify company legal balance
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company profile not resolved.' });
    }

    if (company.legalBalance.toNumber() < term.cost) {
      return res.status(400).json({
        error: 'INSUFFICIENT_FUNDS',
        message: `Establishing a terminal in ${term.city} costs $${term.cost.toLocaleString()} Clean Cash. Your balance is insufficient.`,
      });
    }

    // 3. Purchase terminal inside a transaction
    const newGarage = await prisma.$transaction(async (tx) => {
      // Deduct funds from company
      await tx.company.update({
        where: { id: companyId },
        data: { legalBalance: { decrement: term.cost } },
      });

      // Create garage
      const garage = await tx.garage.create({
        data: {
          companyId,
          city: term.city,
          capacity: 3,
          upgradeLevel: 1,
          terminalLevel: 1,
          dieselStorage: 0.0,
          maxDiesel: 5000.0,
          electricityStorage: 0.0,
          maxElectricity: 1000.0,
          adblueStorage: 0.0,
          maxAdblue: 500.0,
          co2Allowances: 0.0,
          hasStashRoom: false
        }
      });

      return garage;
    });

    res.status(201).json({
      message: `Node terminal established in ${term.city} successfully!`,
      garage: newGarage
    });

  } catch (error) {
    console.error('Purchase terminal error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to purchase terminal.' });
  }
});


// POST /api/garage/upgrade
// Buys an underworld Chop Shop upgrade for a specific truck
router.post('/upgrade', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { truckId, upgradeType } = req.body;

  if (!truckId || !upgradeType) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing truckId or upgradeType' });
  }

  try {
    const truck = await prisma.truck.findUnique({
      where: { id: truckId },
      include: { company: true }
    });

    if (!truck || truck.companyId !== companyId) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Truck not found or unauthorized' });
    }

    let cost = 0;
    let updateData: any = {};

    switch (upgradeType) {
      case 'V8_ENGINE':
        if (truck.hasV8Engine) return res.status(400).json({ error: 'ALREADY_OWNED', message: 'Truck already has this.' });
        cost = 15000;
        updateData = { hasV8Engine: true };
        break;
      case 'REINFORCED_TIRES':
        if (truck.hasReinforcedTires) return res.status(400).json({ error: 'ALREADY_OWNED', message: 'Truck already has this.' });
        cost = 8500;
        updateData = { hasReinforcedTires: true };
        break;
      case 'LEAD_COMPARTMENT':
        if (truck.hasLeadLinedCompartment) return res.status(400).json({ error: 'ALREADY_OWNED', message: 'Truck already has this.' });
        cost = 45000;
        updateData = { hasLeadLinedCompartment: true };
        break;
      case 'RADAR_SCRAMBLER':
        if (truck.hasRadarScrambler) return res.status(400).json({ error: 'ALREADY_OWNED', message: 'Truck already has this.' });
        cost = 22000;
        updateData = { hasRadarScrambler: true };
        break;
      default:
        return res.status(400).json({ error: 'INVALID_UPGRADE', message: 'Unknown upgrade type' });
    }

    if (truck.company.blackMarketBalance.toNumber() < cost) {
      return res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: 'Not enough Underworld cash (C500)!' });
    }

    await prisma.$transaction([
      prisma.company.update({
        where: { id: companyId },
        data: { blackMarketBalance: { decrement: cost } }
      }),
      prisma.truck.update({
        where: { id: truckId },
        data: updateData
      }),
      prisma.truckHistory.create({
        data: {
          truckId: truckId,
          eventType: 'UPGRADE_INSTALLED',
          description: `Installed ${upgradeType} at the Chop Shop for C${cost}.`
        }
      })
    ]);

    res.json({ success: true, message: 'Upgrade installed successfully!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to apply upgrade.' });
  }
});

// PATCH /api/garage/trucks/:truckId/rename
router.patch('/trucks/:truckId/rename', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { truckId } = req.params;
  const { nickname } = req.body;

  try {
    const truck = await prisma.truck.findUnique({ where: { id: truckId } });
    if (!truck || truck.companyId !== companyId) {
      return res.status(404).json({ error: 'TRUCK_NOT_FOUND', message: 'Vehicle does not exist in your fleet.' });
    }

    const nicknames = getTruckNicknames();
    nicknames[truckId] = nickname || '';
    saveTruckNicknames(nicknames);

    res.json({
      success: true,
      message: 'Truck renamed successfully!',
      truck: {
        ...truck,
        nickname: nicknames[truckId]
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to rename truck.' });
  }
});

// 7. COMMODITY COMPRESSION (Convert commodities into contraband stashes)
router.post('/:id/compress', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { id } = req.params;
  const { commodityType, amount } = req.body;

  const validTypes = ['DIESEL', 'ELECTRICITY', 'ADBLUE'];
  if (!commodityType || !validTypes.includes(commodityType.toUpperCase())) {
    return res.status(400).json({ error: 'INVALID_COMMODITY_TYPE', message: 'Must compress DIESEL, ELECTRICITY, or ADBLUE.' });
  }
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Amount must be a positive number of commodity units to compress.' });
  }

  const type = commodityType.toUpperCase();

  // Conversion ratios: how many commodity units produce 1 contraband unit
  const RATIOS: Record<string, { field: string, stashField: string, ratio: number }> = {
    DIESEL:      { field: 'dieselStorage',       stashField: 'contrabandStorageA', ratio: 50  },
    ELECTRICITY: { field: 'electricityStorage',   stashField: 'contrabandStorageB', ratio: 10  },
    ADBLUE:      { field: 'adblueStorage',        stashField: 'contrabandStorageC', ratio: 5   },
  };

  const config = RATIOS[type];

  try {
    const garage = await prisma.garage.findUnique({ where: { id } });
    if (!garage || garage.companyId !== companyId) {
      return res.status(404).json({ error: 'GARAGE_NOT_FOUND', message: 'Garage not found or not owned.' });
    }

    // Calculate how many commodity units are consumed and contraband units produced
    const commodityConsumed = amount * config.ratio; // e.g. 5 contraband units * 50 = 250 diesel consumed
    const contrabandProduced = amount;

    // Validate commodity stock
    const currentCommodity = (garage as any)[config.field] as number;
    if (currentCommodity < commodityConsumed) {
      return res.status(400).json({
        error: 'INSUFFICIENT_STOCK',
        message: `Need ${commodityConsumed} ${type} to produce ${contrabandProduced} contraband units. You have ${currentCommodity}.`,
      });
    }

    // Validate contraband capacity
    const totalStash = garage.contrabandStorageA + garage.contrabandStorageB + garage.contrabandStorageC;
    if (totalStash + contrabandProduced > garage.maxContrabandStash) {
      return res.status(400).json({
        error: 'STASH_CAPACITY_EXCEEDED',
        message: `Cannot store ${contrabandProduced} more units. Current stash: ${totalStash}/${garage.maxContrabandStash}.`,
      });
    }

    // Execute compression in transaction
    const updated = await prisma.$transaction(async (tx) => {
      const updatedGarage = await tx.garage.update({
        where: { id },
        data: {
          [config.field]: { decrement: commodityConsumed },
          [config.stashField]: { increment: contrabandProduced },
        },
      });
      return updatedGarage;
    });

    // Broadcast stock update via WebSocket
    GameWebSocketServer.sendToCompany(companyId, 'garage:stock_update', {
      garageId: id,
      dieselStorage: updated.dieselStorage,
      electricityStorage: updated.electricityStorage,
      adblueStorage: updated.adblueStorage,
      co2Allowances: updated.co2Allowances,
      contrabandStorageA: updated.contrabandStorageA,
      contrabandStorageB: updated.contrabandStorageB,
      contrabandStorageC: updated.contrabandStorageC,
    });

    res.json({
      success: true,
      message: `Compressed ${commodityConsumed} ${type} into ${contrabandProduced} contraband units.`,
      garage: updated,
    });
  } catch (error) {
    console.error('Compress commodity error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to compress commodities.' });
  }
});

// Feature 43 — License Plate Forgery
// POST /api/garage/trucks/:truckId/forge-plate
router.post('/trucks/:truckId/forge-plate', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { truckId } = req.params;

  const FORGE_COST = 8000; // $8,000 BM cash
  const DURATION_MINUTES = 60;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) throw new Error('COMPANY_NOT_FOUND');

      const truck = await tx.truck.findUnique({ where: { id: truckId } });
      if (!truck || truck.companyId !== companyId) throw new Error('TRUCK_NOT_FOUND');

      // Check if plates are still active
      if (truck.forgedPlateUntil && truck.forgedPlateUntil > new Date()) {
        const remainingMs = truck.forgedPlateUntil.getTime() - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        throw new Error(`ALREADY_FORGED:${remainingMin}`);
      }

      if (company.blackMarketBalance.toNumber() < FORGE_COST) throw new Error('INSUFFICIENT_FUNDS');

      const forgedUntil = new Date(Date.now() + DURATION_MINUTES * 60 * 1000);

      await tx.company.update({
        where: { id: companyId },
        data: { blackMarketBalance: { decrement: FORGE_COST } }
      });

      const updatedTruck = await tx.truck.update({
        where: { id: truckId },
        data: { forgedPlateUntil: forgedUntil },
      });

      return { updatedTruck, forgedUntil };
    });

    GameWebSocketServer.sendToCompany(companyId, 'truck:update', {
      truckId,
      forgedPlateUntil: result.forgedUntil,
      message: `🪪 PLATE FORGED: ${result.updatedTruck.model} running forged plates for ${DURATION_MINUTES} minutes. Detection probability -20%.`,
    });

    res.json({
      success: true,
      message: `Plates forged for ${DURATION_MINUTES} minutes. Detection probability reduced by 20%.`,
      forgedPlateUntil: result.forgedUntil,
      cost: FORGE_COST,
    });
  } catch (error: any) {
    const msg = error.message || '';
    if (msg.startsWith('ALREADY_FORGED:')) {
      const min = msg.split(':')[1];
      return res.status(400).json({ error: 'ALREADY_FORGED', message: `Forged plates already active for ${min} more minutes.` });
    }
    const friendly: Record<string, string> = {
      TRUCK_NOT_FOUND: 'Truck not found or not owned.',
      INSUFFICIENT_FUNDS: `Plate forgery costs $${FORGE_COST.toLocaleString()} Black Market Cash.`,
    };
    res.status(400).json({ error: msg, message: friendly[msg] || 'Failed to forge plates.' });
  }
});

export default router;


