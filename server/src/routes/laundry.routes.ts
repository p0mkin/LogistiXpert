import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Apply auth middleware globally
router.use(authenticateJWT);

// 1. GET ALL USER FRONTS
router.get('/', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  try {
    const fronts = await prisma.frontBusiness.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(fronts);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve money laundering fronts.' });
  }
});

// 2. BUY A NEW LAUNDERING FRONT BUSINESS (Costs Clean Cash)
router.post('/buy', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { type, customName } = req.body; // type: 'TAXI', 'CAFE', 'LOGISTICS'

  let cost = 0;
  let name = '';
  let city = '';
  let baseRate = 500; // $ per cycle
  let baseLoss = 0.80; // 80% return

  if (type === 'TAXI') {
    cost = 15000;
    name = customName || 'Kaunas Transit Taxi Co';
    city = 'Kaunas';
    baseRate = 500;
    baseLoss = 0.80;
  } else if (type === 'CAFE') {
    cost = 35000;
    name = customName || 'Bialystok Truck Stop Cafe';
    city = 'Bialystok';
    baseRate = 1500;
    baseLoss = 0.83;
  } else if (type === 'LOGISTICS') {
    cost = 80000;
    name = customName || 'Warsaw Legal Freight Front';
    city = 'Warsaw';
    baseRate = 4500;
    baseLoss = 0.86;
  } else {
    return res.status(400).json({ error: 'INVALID_TYPE', message: 'Must select front type: TAXI, CAFE, or LOGISTICS.' });
  }

  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.legalBalance.toNumber() < cost) {
      return res.status(400).json({
        error: 'INSUFFICIENT_FUNDS',
        message: `Acquiring the legal front "${name}" requires $${cost} Clean Cash.`,
      });
    }

    const newFront = await prisma.$transaction(async (tx) => {
      // Deduct balance from Company
      await tx.company.update({
        where: { id: companyId },
        data: { legalBalance: { decrement: cost } },
      });

      return await tx.frontBusiness.create({
        data: {
          companyId,
          name,
          city,
          laundryRate: baseRate,
          lossMultiplier: baseLoss,
          upgradeLevel: 1,
        },
      });
    });

    res.status(201).json({
      message: 'Legal front business established! You can now launder dirty proceeds.',
      front: newFront,
    });
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to purchase laundering front.' });
  }
});

// 3. LAUNDER BLACK MARKET CASH (Launder dirty proceeds)
router.post('/:frontId/launder', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { frontId } = req.params;
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Must specify a valid positive amount to launder.' });
  }

  try {
    const front = await prisma.frontBusiness.findUnique({
      where: { id: frontId },
    });

    if (!front || front.companyId !== companyId) {
      return res.status(404).json({ error: 'FRONT_NOT_FOUND', message: 'Laundering front business not found.' });
    }

    if (front.isRaided) {
      const now = new Date();
      if (front.raidCooldown && front.raidCooldown > now) {
        return res.status(400).json({
          error: 'FRONT_RAIDED_LOCK',
          message: `This business is under deep audit lock following a recent police raid! Unlocks at ${front.raidCooldown.toISOString()}.`,
        });
      } else {
        // Cooldown expired, restore
        await prisma.frontBusiness.update({
          where: { id: frontId },
          data: { isRaided: false, raidCooldown: null },
        });
      }
    }

    const maxRate = front.laundryRate.toNumber();
    if (amount > maxRate) {
      return res.status(400).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `This front has a laundering cap of $${maxRate} dirty cash per cycle. Upgrade this front to process larger batches.`,
      });
    }

    // Double check black market balance
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.blackMarketBalance.toNumber() < amount) {
      return res.status(400).json({
        error: 'INSUFFICIENT_BLACK_MARKET_CUNDS',
        message: `You do not have $${amount} dirty cash to launder.`,
      });
    }

    // 4. ALGORITHM: Police Raid Risk calculation
    // Base risk: 4%
    // Batch scaling: +1% per $1000 laundered
    // Heat scaling: +1% per 10 police heat
    const batchScale = Math.floor(amount / 1000);
    const heatScale = Math.floor(company.policeHeat / 10);
    const raidRisk = Math.min(4 + batchScale + heatScale, 80); // clamp at 80% max risk

    const raidRoll = Math.random() * 100;
    const isRaided = raidRoll < raidRisk;

    if (isRaided) {
      // Raid triggers! Seize dirty cash, lock front, raise heat
      const cooldownDate = new Date();
      cooldownDate.setHours(cooldownDate.getHours() + 24); // 24 hours lock

      await prisma.$transaction(async (tx) => {
        // Deduct dirty cash from Company
        await tx.company.update({
          where: { id: companyId },
          data: {
            blackMarketBalance: { decrement: amount },
            policeHeat: { increment: 20 }, // heat spikes
          },
        });

        // Set raid lock
        await tx.frontBusiness.update({
          where: { id: frontId },
          data: {
            isRaided: true,
            raidCooldown: cooldownDate,
          },
        });
      });

      return res.json({
        raided: true,
        risk: raidRisk,
        roll: raidRoll,
        message: `POLICE RAID ENFORCEMENT! Officers raided "${front.name}". Launder batch of $${amount} seized and confiscated. Business locked for 24h audit. Police Heat +20.`,
      });
    }

    // Success laundering!
    const cleanReturned = amount * front.lossMultiplier;

    const updatedBalances = await prisma.$transaction(async (tx) => {
      // Deduct dirty, add clean
      await tx.company.update({
        where: { id: companyId },
        data: {
          blackMarketBalance: { decrement: amount },
          legalBalance: { increment: cleanReturned },
        },
      });

      return await tx.company.findUnique({ where: { id: companyId } });
    });

    res.json({
      raided: false,
      risk: raidRisk,
      roll: raidRoll,
      dirtyProcessed: amount,
      cleanCredited: cleanReturned,
      message: `Laundry cycle successful! Cleaned $${amount} dirty cash into $${cleanReturned} legal balance (Conversion Yield: ${Math.floor(front.lossMultiplier * 100)}%).`,
      legalBalance: updatedBalances?.legalBalance,
      blackMarketBalance: updatedBalances?.blackMarketBalance,
    });

  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Laundering transaction failed.' });
  }
});

// 4. UPGRADE FRONT BUSINESS (Increases laundering rate cap and conversion yield)
router.post('/:frontId/upgrade', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { frontId } = req.params;

  try {
    const front = await prisma.frontBusiness.findUnique({ where: { id: frontId } });
    if (!front || front.companyId !== companyId) {
      return res.status(404).json({ error: 'FRONT_NOT_FOUND', message: 'Laundering front not found.' });
    }

    if (front.upgradeLevel >= 5) {
      return res.status(400).json({ error: 'MAX_UPGRADE', message: 'This front is already at maximum upgrade level (5). No further improvements possible.' });
    }

    if (front.isRaided) {
      return res.status(400).json({ error: 'FRONT_RAIDED', message: 'Cannot upgrade a front currently under police audit lock.' });
    }

    // Upgrade cost scales quadratically by level
    const upgradeCostTable: Record<number, number> = {
      1: 25000,   // Level 1 -> 2: $25,000
      2: 55000,   // Level 2 -> 3: $55,000
      3: 110000,  // Level 3 -> 4: $110,000
      4: 220000,  // Level 4 -> 5: $220,000
    };
    const upgradeCost = upgradeCostTable[front.upgradeLevel];

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.legalBalance.toNumber() < upgradeCost) {
      return res.status(400).json({
        error: 'INSUFFICIENT_FUNDS',
        message: `Upgrading this front to Level ${front.upgradeLevel + 1} costs $${upgradeCost} Clean Cash.`,
      });
    }

    // Per-level improvements: +$500 rate cap, +1% yield efficiency
    const newLevel = front.upgradeLevel + 1;
    const newLaundryRate = front.laundryRate.toNumber() + 500 * front.upgradeLevel;
    const newLossMultiplier = Math.min(front.lossMultiplier + 0.01, 0.95); // cap at 95% yield

    const upgraded = await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: { legalBalance: { decrement: upgradeCost } },
      });

      return tx.frontBusiness.update({
        where: { id: frontId },
        data: {
          upgradeLevel: newLevel,
          laundryRate: newLaundryRate,
          lossMultiplier: newLossMultiplier,
        },
      });
    });

    res.json({
      message: `"${front.name}" upgraded to Level ${newLevel}! Launder rate cap increased to $${newLaundryRate}/cycle. Conversion yield improved to ${Math.floor(newLossMultiplier * 100)}%.`,
      front: upgraded,
    });
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to upgrade front business.' });
  }
});

// 5. BRIBE AUDITORS — Pay clean cash to recover from a raid early
router.post('/:frontId/bribe-auditors', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { frontId } = req.params;

  const bribeCost = 15000; // $15,000 clean cash to bribe the investigation team

  try {
    const front = await prisma.frontBusiness.findUnique({ where: { id: frontId } });
    if (!front || front.companyId !== companyId) {
      return res.status(404).json({ error: 'FRONT_NOT_FOUND' });
    }

    if (!front.isRaided) {
      return res.status(400).json({ error: 'NOT_RAIDED', message: 'This front is not currently under a police audit. Nothing to bribe.' });
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.legalBalance.toNumber() < bribeCost) {
      return res.status(400).json({
        error: 'INSUFFICIENT_FUNDS',
        message: `Bribing auditors requires $${bribeCost} Clean Cash.`,
      });
    }

    // 65% chance the bribe works; 35% chance auditors take money and keep auditing
    const bribeSuccess = Math.random() < 0.65;

    if (bribeSuccess) {
      await prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id: companyId },
          data: { legalBalance: { decrement: bribeCost } },
        });
        await tx.frontBusiness.update({
          where: { id: frontId },
          data: { isRaided: false, raidCooldown: null },
        });
      });

      return res.json({
        success: true,
        message: `Bribe successful! Auditors pocketed $${bribeCost} and quietly closed the investigation. "${front.name}" is back in business.`,
      });
    } else {
      // Failed bribe — they take the money AND keep auditing, extending the lock
      const extendedCooldown = new Date();
      extendedCooldown.setHours(extendedCooldown.getHours() + 12); // extra 12h lock

      await prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id: companyId },
          data: { legalBalance: { decrement: bribeCost }, policeHeat: { increment: 10 } },
        });
        await tx.frontBusiness.update({
          where: { id: frontId },
          data: { raidCooldown: extendedCooldown },
        });
      });

      return res.json({
        success: false,
        message: `BRIBE REJECTED! Auditors took your $${bribeCost} anyway and extended the audit lockdown by 12 hours. Police Heat +10.`,
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to process bribe transaction.' });
  }
});

export default router;
