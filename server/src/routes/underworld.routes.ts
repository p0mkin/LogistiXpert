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
      
      // v0.7.1: GPS Jammer protection — trucks on active routes are immune to sabotage
      const jammerActiveRoute = await tx.activeRoute.findUnique({ where: { truckId: victimTruck.id } });
      if (victimTruck.hasGpsJammer && jammerActiveRoute) {
        // Jammer deflects the attack — attacker still loses the fee
        await tx.company.update({
          where: { id: attackerId },
          data: { blackMarketBalance: { decrement: attackCost } },
        });
        throw new Error('GPS_JAMMER_DEFLECTION');
      }

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

// List sabotage contracts for the authenticated company
router.get('/sabotage-contracts', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(401).json({ error: 'Unauthorized' });

    const contracts = await prisma.sabotageContract.findMany({
      where: {
        OR: [
          { attackerId: companyId },
          { victimId: companyId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        attackerCompany: { select: { id: true, name: true } },
        victimCompany: { select: { id: true, name: true } },
      },
    });

    res.json(contracts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List sabotage event history
router.get('/sabotage-events', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(401).json({ error: 'Unauthorized' });

    const events = await prisma.sabotageEvent.findMany({
      where: {
        OR: [
          { attackerId: companyId },
          { victimId: companyId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        attackerCompany: { select: { id: true, name: true } },
        victimCompany: { select: { id: true, name: true } },
      },
    });

    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/underworld/bribe-interpol
 * Pay dirty cash to gain a 30-minute Interpol immunity window
 * During immunity, border detection probability is reduced by 40%
 */
router.post('/bribe-interpol', authenticateJWT, async (req: AuthRequest, res) => {
  const companyId = req.user?.companyId;
  if (!companyId) return res.status(401).json({ error: 'Unauthorized' });

  const INTERPOL_BRIBE_COST = 75000; // $75,000 BM
  const IMMUNITY_DURATION_MINUTES = 30;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) throw new Error('COMPANY_NOT_FOUND');

      // Check if already immune
      if (company.interpolImmunityUntil && company.interpolImmunityUntil > new Date()) {
        const remainingMs = company.interpolImmunityUntil.getTime() - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        throw new Error(`ALREADY_IMMUNE:${remainingMin}`);
      }

      if (company.blackMarketBalance.toNumber() < INTERPOL_BRIBE_COST) {
        throw new Error('INSUFFICIENT_BLACK_MARKET_FUNDS');
      }

      const immunityUntil = new Date(Date.now() + IMMUNITY_DURATION_MINUTES * 60 * 1000);

      const updated = await tx.company.update({
        where: { id: companyId },
        data: {
          blackMarketBalance: { decrement: INTERPOL_BRIBE_COST },
          interpolImmunityUntil: immunityUntil,
          policeHeat: { increment: 5 }, // Mild heat for contacting Interpol assets
        },
      });

      return { updated, immunityUntil };
    });

    GameWebSocketServer.sendToCompany(companyId, 'company:balance_update', {
      legalBalance: parseFloat(Number(result.updated.legalBalance).toFixed(2)),
      blackMarketBalance: parseFloat(Number(result.updated.blackMarketBalance).toFixed(2)),
      message: `🕵️ INTERPOL IMMUNITY ACTIVE: Border agents neutralized for ${IMMUNITY_DURATION_MINUTES} minutes. Detection probability reduced by 40%.`,
    });

    res.json({
      success: true,
      message: `Interpol agents bribed. You have ${IMMUNITY_DURATION_MINUTES} minutes of border immunity.`,
      immunityUntil: result.immunityUntil,
      cost: INTERPOL_BRIBE_COST,
    });
  } catch (error: any) {
    const msg = error.message || '';
    if (msg.startsWith('ALREADY_IMMUNE:')) {
      const min = msg.split(':')[1];
      return res.status(400).json({ error: 'ALREADY_IMMUNE', message: `You already have Interpol immunity for ${min} more minutes.` });
    }
    if (msg === 'INSUFFICIENT_BLACK_MARKET_FUNDS') {
      return res.status(400).json({ error: msg, message: `Interpol bribe costs $${INTERPOL_BRIBE_COST.toLocaleString()} Black Market Cash.` });
    }
    res.status(400).json({ error: msg || 'BRIBE_FAILED', message: 'Failed to bribe Interpol agents.' });
  }
});

/**
 * POST /api/underworld/loan-shark
 * Take a high-interest black market loan from the syndicate loan shark
 */
router.post('/loan-shark', authenticateJWT, async (req: AuthRequest, res) => {
  const companyId = req.user?.companyId;
  if (!companyId) return res.status(401).json({ error: 'Unauthorized' });

  const { amount } = req.body;
  const MIN_LOAN = 10000;
  const MAX_LOAN = 500000;
  const DAILY_INTEREST_RATE = 0.20; // 20% per simulated day
  const DUE_IN_DAYS = 3; // Must repay within 3 simulated days

  if (!amount || amount < MIN_LOAN || amount > MAX_LOAN) {
    return res.status(400).json({
      error: 'INVALID_AMOUNT',
      message: `Loan amount must be between $${MIN_LOAN.toLocaleString()} and $${MAX_LOAN.toLocaleString()}.`
    });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) throw new Error('COMPANY_NOT_FOUND');

      // Can only have one active loan at a time
      if (company.loanSharkPrincipal.toNumber() > 0) {
        throw new Error(`EXISTING_LOAN:${company.loanSharkPrincipal.toNumber()}`);
      }

      const dueAt = new Date(Date.now() + DUE_IN_DAYS * 24 * 60 * 60 * 1000);

      const updated = await tx.company.update({
        where: { id: companyId },
        data: {
          blackMarketBalance: { increment: amount },
          loanSharkPrincipal: amount,
          loanSharkInterestRate: DAILY_INTEREST_RATE,
          loanSharkDueAt: dueAt,
          policeHeat: { increment: 10 }, // Borrowing from criminals raises heat
        },
      });

      return { updated, dueAt };
    });

    GameWebSocketServer.sendToCompany(companyId, 'company:balance_update', {
      blackMarketBalance: parseFloat(Number(result.updated.blackMarketBalance).toFixed(2)),
      message: `🦈 LOAN SHARK DEAL: Borrowed $${amount.toLocaleString()} BM. Repay $${Math.round(amount * (1 + DAILY_INTEREST_RATE * DUE_IN_DAYS)).toLocaleString()} within ${DUE_IN_DAYS} days or face consequences.`,
    });

    res.json({
      success: true,
      message: `Loan of $${amount.toLocaleString()} received. Repay within ${DUE_IN_DAYS} simulated days (20%/day interest).`,
      loan: {
        principal: amount,
        interestRate: DAILY_INTEREST_RATE,
        dueAt: result.dueAt,
        totalOwed: Math.round(amount * (1 + DAILY_INTEREST_RATE * DUE_IN_DAYS)),
      }
    });
  } catch (error: any) {
    const msg = error.message || '';
    if (msg.startsWith('EXISTING_LOAN:')) {
      const owed = parseFloat(msg.split(':')[1]);
      return res.status(400).json({ error: 'EXISTING_LOAN', message: `You already owe the loan shark $${owed.toLocaleString()}. Repay first.` });
    }
    res.status(400).json({ error: msg || 'LOAN_FAILED', message: 'Failed to negotiate loan shark deal.' });
  }
});

/**
 * POST /api/underworld/loan-shark/repay
 * Repay the outstanding loan shark debt
 */
router.post('/loan-shark/repay', authenticateJWT, async (req: AuthRequest, res) => {
  const companyId = req.user?.companyId;
  if (!companyId) return res.status(401).json({ error: 'Unauthorized' });

  const { amount } = req.body; // Partial or full repayment

  try {
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) throw new Error('COMPANY_NOT_FOUND');

      const owed = company.loanSharkPrincipal.toNumber();
      if (owed <= 0) throw new Error('NO_LOAN');

      const repayAmount = Math.min(amount || owed, owed);
      if (company.blackMarketBalance.toNumber() < repayAmount) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      const remainingPrincipal = Math.max(0, owed - repayAmount);
      const updated = await tx.company.update({
        where: { id: companyId },
        data: {
          blackMarketBalance: { decrement: repayAmount },
          loanSharkPrincipal: remainingPrincipal,
          loanSharkInterestRate: remainingPrincipal > 0 ? company.loanSharkInterestRate : 0.0,
          loanSharkDueAt: remainingPrincipal > 0 ? company.loanSharkDueAt : null,
          policeHeat: remainingPrincipal <= 0 ? { decrement: 5 } : undefined, // Heat drops on full repay
        },
      });

      return { updated, repayAmount, remainingPrincipal };
    });

    GameWebSocketServer.sendToCompany(companyId, 'company:balance_update', {
      blackMarketBalance: parseFloat(Number(result.updated.blackMarketBalance).toFixed(2)),
      message: result.remainingPrincipal <= 0
        ? `🦈 LOAN SHARK REPAID: Debt cleared! You paid $${result.repayAmount.toLocaleString()}.`
        : `🦈 PARTIAL REPAYMENT: Paid $${result.repayAmount.toLocaleString()}. Remaining: $${result.remainingPrincipal.toLocaleString()}.`,
    });

    res.json({
      success: true,
      repaidAmount: result.repayAmount,
      remainingPrincipal: result.remainingPrincipal,
      isCleared: result.remainingPrincipal <= 0,
    });
  } catch (error: any) {
    const msg = error.message || '';
    if (msg === 'NO_LOAN') return res.status(400).json({ error: 'NO_LOAN', message: 'No active loan shark debt.' });
    if (msg === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: 'Not enough black market cash to repay.' });
    res.status(400).json({ error: msg || 'REPAY_FAILED', message: 'Failed to repay loan.' });
  }
});

/**
 * GET /api/underworld/loan-shark/status
 * Get current loan shark debt status
 */
router.get('/loan-shark/status', authenticateJWT, async (req: AuthRequest, res) => {
  const companyId = req.user?.companyId;
  if (!companyId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        loanSharkPrincipal: true,
        loanSharkInterestRate: true,
        loanSharkDueAt: true,
        interpolImmunityUntil: true,
      }
    });
    if (!company) return res.status(404).json({ error: 'NOT_FOUND' });

    const principal = company.loanSharkPrincipal.toNumber();
    const daysRemaining = company.loanSharkDueAt
      ? Math.max(0, (company.loanSharkDueAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null;
    const interestAccrued = principal > 0 && daysRemaining !== null
      ? Math.round(principal * company.loanSharkInterestRate * (3 - daysRemaining))
      : 0;

    res.json({
      principal,
      interestRate: company.loanSharkInterestRate,
      dueAt: company.loanSharkDueAt,
      daysRemaining,
      interestAccrued,
      totalOwed: principal + interestAccrued,
      interpolImmunityUntil: company.interpolImmunityUntil,
      isInterpolImmune: company.interpolImmunityUntil ? company.interpolImmunityUntil > new Date() : false,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/underworld/tunnel-run
 * Feature 46 — Cartel Border Tunnel Run
 * Pay cartel fee to completely bypass a border checkpoint (no risk, just cost)
 */
router.post('/tunnel-run', authenticateJWT, async (req: AuthRequest, res) => {
  const companyId = req.user?.companyId;
  if (!companyId) return res.status(401).json({ error: 'Unauthorized' });

  const { truckId } = req.body;
  if (!truckId) return res.status(400).json({ error: 'MISSING_TRUCK_ID', message: 'truckId is required.' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) throw new Error('COMPANY_NOT_FOUND');

      const truck = await tx.truck.findUnique({
        where: { id: truckId },
        include: { activeRoute: { include: { contrabandJob: true } } }
      });
      if (!truck || truck.companyId !== companyId) throw new Error('TRUCK_NOT_FOUND');
      if (!truck.activeRoute) throw new Error('TRUCK_NOT_ON_ROUTE');
      if (!truck.activeRoute.contrabandJobId) throw new Error('NO_CONTRABAND_JOB');

      // Fee scales with cargo class
      const cargoClass = truck.activeRoute.contrabandJob?.cargoClass;
      const FEES: Record<string, number> = {
        CLASS_A: 10000,
        CLASS_B: 25000,
        CLASS_C: 50000,
      };
      const fee = FEES[cargoClass as string] || 25000;

      if (company.blackMarketBalance.toNumber() < fee) {
        throw new Error(`INSUFFICIENT_FUNDS:${fee}`);
      }

      const updated = await tx.company.update({
        where: { id: companyId },
        data: {
          blackMarketBalance: { decrement: fee },
          policeHeat: { increment: 8 }, // Tunnel usage raises heat
        },
      });

      // Mark route as bypassed
      await tx.activeRoute.update({
        where: { id: truck.activeRoute.id },
        data: { bypassSchengen: true },
      });

      return { updated, fee, cargoClass };
    });

    GameWebSocketServer.sendToCompany(companyId, 'company:balance_update', {
      blackMarketBalance: parseFloat(Number(result.updated.blackMarketBalance).toFixed(2)),
      message: `🚇 TUNNEL RUN ACTIVATED: Cartel tunnel passage secured for $${result.fee.toLocaleString()} BM. Border checkpoints bypassed!`,
    });

    res.json({
      success: true,
      message: `Cartel tunnel run secured. Border bypassed. Fee: $${result.fee.toLocaleString()}.`,
      fee: result.fee,
      cargoClass: result.cargoClass,
    });
  } catch (error: any) {
    const msg = error.message || '';
    if (msg.startsWith('INSUFFICIENT_FUNDS:')) {
      const fee = msg.split(':')[1];
      return res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: `Tunnel fee is $${parseInt(fee).toLocaleString()} BM.` });
    }
    const friendly: Record<string, string> = {
      TRUCK_NOT_FOUND: 'Truck not found or not owned.',
      TRUCK_NOT_ON_ROUTE: 'Truck must be on an active route to use a tunnel run.',
      NO_CONTRABAND_JOB: 'Tunnel runs are only for contraband smuggling routes.',
    };
    res.status(400).json({ error: msg, message: friendly[msg] || 'Tunnel run failed.' });
  }
});

export default router;

