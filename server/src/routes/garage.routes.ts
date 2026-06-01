import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

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

    res.json(garages);
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

export default router;
