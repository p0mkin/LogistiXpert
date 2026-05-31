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

export default router;
