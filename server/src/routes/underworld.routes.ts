import { Router } from 'express';
import { PrismaClient, SabotageType } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import { GameWebSocketServer } from '../websocket';

const router = Router();
const prisma = new PrismaClient();

// List all known syndicates / targets
router.get('/targets', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const targets = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        reputationScore: true,
        policeHeat: true,
        jurisdiction: true
      },
      take: 50,
      orderBy: { reputationScore: 'desc' }
    });
    res.json(targets);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Launch a sabotage attack
router.post('/sabotage', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const { targetId, type } = req.body;
    const attackerId = req.user?.companyId;

    if (!attackerId) return res.status(401).json({ error: 'Unauthorized' });
    if (attackerId === targetId) return res.status(400).json({ error: 'Cannot sabotage yourself' });

    // Validate type
    if (!Object.values(SabotageType).includes(type)) {
      return res.status(400).json({ error: 'Invalid sabotage type' });
    }

    const costs: Record<SabotageType, number> = {
      TIRE_BLOWOUT: 5000,
      ENGINE_FIRE: 15000,
      CARGO_THEFT: 25000,
      DRIVER_ASSAULT: 40000,
    };

    const attackCost = costs[type as SabotageType];

    const result = await prisma.$transaction(async (tx) => {
      const attacker = await tx.company.findUnique({ where: { id: attackerId }});
      if (!attacker) throw new Error('Attacker not found');
      
      // Deduct black market balance
      if (attacker.blackMarketBalance.toNumber() < attackCost) {
        throw new Error('INSUFFICIENT_BLACK_MARKET_FUNDS');
      }

      await tx.company.update({
        where: { id: attackerId },
        data: {
          blackMarketBalance: { decrement: attackCost },
          policeHeat: { increment: 15 } // Attacker gains heat
        }
      });

      // Target victim
      const victim = await tx.company.findUnique({
        where: { id: targetId },
        include: {
          garages: { include: { trucks: true } }
        }
      });
      if (!victim) throw new Error('Target not found');

      // Find a random truck to sabotage
      let allTrucks: any[] = [];
      victim.garages.forEach(g => {
        allTrucks = allTrucks.concat(g.trucks);
      });

      if (allTrucks.length === 0) {
        throw new Error('Target has no active operations to sabotage.');
      }

      const victimTruck = allTrucks[Math.floor(Math.random() * allTrucks.length)];
      const damageCost = attackCost * (1.5 + Math.random()); // Causes more damage than it costs

      const event = await tx.sabotageEvent.create({
        data: {
          attackerId,
          victimId: targetId,
          truckId: victimTruck.id,
          type: type as SabotageType,
          costToRepair: damageCost,
          success: true
        }
      });

      // Apply actual physical damage/effects
      if (type === 'TIRE_BLOWOUT') {
        await tx.truck.update({ where: { id: victimTruck.id }, data: { tireWear: Math.max(0, victimTruck.tireWear - 40) }});
      } else if (type === 'ENGINE_FIRE') {
        await tx.truck.update({ where: { id: victimTruck.id }, data: { engineHealth: Math.max(0, victimTruck.engineHealth - 80) }});
      } else if (type === 'CARGO_THEFT') {
        await tx.company.update({ where: { id: targetId }, data: { legalBalance: { decrement: damageCost } }});
      } else if (type === 'DRIVER_ASSAULT') {
        const d = await tx.driver.findFirst({ where: { assignedTruckId: victimTruck.id } });
        if (d) {
          await tx.driver.update({ where: { id: d.id }, data: { fatigue: 100 } });
        }
      }

      return { event, victimTruck, victimName: victim.name };
    });

    // Notify Victim
    GameWebSocketServer.sendToCompany(targetId, 'sabotage:attacked', {
      type: result.event.type,
      truckId: result.victimTruck.id,
      damageCost: result.event.costToRepair.toNumber(),
      timestamp: result.event.createdAt
    });

    // Trigger visual explosion on global map at the truck's home city
    const garage = await prisma.garage.findUnique({ where: { id: result.victimTruck.garageId }});
    if (garage) {
      GameWebSocketServer.broadcast('sabotage:visual_event', {
        type: result.event.type,
        city: garage.city
      });
    }

    res.json({
      success: true,
      message: `Successfully launched ${type} on ${result.victimName}!`,
      event: result.event
    });

  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
