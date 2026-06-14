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
      
      // Calculate success chance
      let successChance = 1.0;
      if (victimTruck.hasChaffFlares) {
        successChance *= 0.6; // -40% success rate
      }
      
      const isPhysical = ['TIRE_BLOWOUT', 'ENGINE_FIRE', 'DRIVER_ASSAULT'].includes(type);
      if (victimTruck.hasReinforcedArmor && isPhysical) {
        successChance *= 0.5; // -50% success rate for physical attacks
      }
      
      const isSuccess = Math.random() < successChance;
      let damageCost = 0;
      
      if (isSuccess) {
        let baseDmgCost = attackCost * (1.5 + Math.random());
        if (victimTruck.hasReinforcedArmor) {
          baseDmgCost = baseDmgCost * 0.5; // halving repair/cargo cost if armored
        }
        damageCost = Math.round(baseDmgCost);
      } else {
        damageCost = 0;
      }

      const event = await tx.sabotageEvent.create({
        data: {
          attackerId,
          victimId: targetId,
          truckId: victimTruck.id,
          type: type as SabotageType,
          costToRepair: damageCost,
          success: isSuccess
        }
      });

      // Apply actual physical damage/effects if successful
      if (isSuccess) {
        const damageReduction = victimTruck.hasReinforcedArmor ? 0.5 : 1.0;

        if (type === 'TIRE_BLOWOUT') {
          const dmg = Math.round(40 * damageReduction);
          await tx.truck.update({ where: { id: victimTruck.id }, data: { tireWear: Math.max(0, victimTruck.tireWear - dmg) }});
        } else if (type === 'ENGINE_FIRE') {
          const dmg = Math.round(80 * damageReduction);
          await tx.truck.update({ where: { id: victimTruck.id }, data: { engineHealth: Math.max(0, victimTruck.engineHealth - dmg) }});
        } else if (type === 'CARGO_THEFT') {
          await tx.company.update({ where: { id: targetId }, data: { legalBalance: { decrement: damageCost } }});
        } else if (type === 'DRIVER_ASSAULT') {
          const d = await tx.driver.findFirst({ where: { assignedTruckId: victimTruck.id } });
          if (d) {
            const fatigueInc = Math.round(100 * damageReduction);
            await tx.driver.update({ where: { id: d.id }, data: { fatigue: Math.min(100, d.fatigue + fatigueInc) } });
          }
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

/**
 * POST /api/underworld/wipe-heat
 * Pay police commissioner massive dirty cash sums to reset police heat to 0
 */
router.post('/wipe-heat', authenticateJWT, async (req: AuthRequest, res) => {
  const companyId = req.user?.companyId;
  if (!companyId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) throw new Error('Company not found');

      const currentHeat = company.policeHeat;
      if (currentHeat <= 0) {
        throw new Error('NO_HEAT');
      }

      const cost = currentHeat * 800;
      if (company.blackMarketBalance.toNumber() < cost) {
        throw new Error('INSUFFICIENT_BLACK_MARKET_FUNDS');
      }

      const updated = await tx.company.update({
        where: { id: companyId },
        data: {
          blackMarketBalance: { decrement: cost },
          policeHeat: 0,
        },
      });

      return { updated, cost, oldHeat: currentHeat };
    });

    // Broadcast balance & heat updates
    GameWebSocketServer.sendToCompany(companyId, 'company:balance_update', {
      legalBalance: parseFloat(Number(result.updated.legalBalance).toFixed(2)),
      blackMarketBalance: parseFloat(Number(result.updated.blackMarketBalance).toFixed(2)),
      message: `POLICE RECORD WIPED: Bribed police commissioner with $${result.cost.toLocaleString()} Black Market Cash. Police heat reset to 0.`,
    });

    GameWebSocketServer.sendToCompany(companyId, 'company:heat_update', {
      policeHeat: 0,
    });

    res.json({
      success: true,
      message: `Police heat successfully reset to 0. Bribe cost: $${result.cost} Black Market Cash.`,
      cost: result.cost,
      policeHeat: 0,
    });
  } catch (error: any) {
    const code = error.message || 'WIPE_HEAT_FAILED';
    let status = 400;
    let message = 'Failed to bribe police commissioner.';
    if (code === 'NO_HEAT') {
      message = 'Company has no active police heat to wipe.';
    } else if (code === 'INSUFFICIENT_BLACK_MARKET_FUNDS') {
      message = `Insufficient Black Market funds.`;
    }
    res.status(status).json({ error: code, message });
  }
});

export default router;
