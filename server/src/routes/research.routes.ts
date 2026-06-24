import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import { LockService } from '../services/lock.service';

const router = Router();
const prisma = new PrismaClient();

// Protect all research routes with JWT
router.use(authenticateJWT);

// Define upgrade costs and parameters for each research node
const RESEARCH_SPECS: Record<string, { maxLevel: number; costs: number[]; label: string; description: string }> = {
  resTerminalLogistics: {
    maxLevel: 3,
    costs: [15000, 60000, 250000],
    label: 'Terminal Dispatch Logistics',
    description: 'Improves loading & unloading efficiency by +10% per level. Cumulative with local terminal bonuses.',
  },
  resAerodynamics: {
    maxLevel: 3,
    costs: [25000, 100000, 400000],
    label: 'Streamlined Aerodynamics',
    description: 'Reduces aerodynamic drag on all vehicles, cutting diesel & electric fuel burn rates by -4% per level.',
  },
  resAdvancedPacking: {
    maxLevel: 3,
    costs: [20000, 80000, 300000],
    label: 'Advanced Spatial Packing',
    description: 'Increases payload delivery optimization by packing goods tighter, yielding +5% extra payout per level.',
  },
  resECURemapping: {
    maxLevel: 2,
    costs: [50000, 200000],
    label: 'ECU Micro-Remapping',
    description: 'Enables engine performance/economy tuning tiers in the dealership, unlocking high-grade specialized mods.',
  },
  resCoopCapacity: {
    maxLevel: 2,
    costs: [75000, 300000],
    label: 'Co-Op Company Capacity',
    description: 'Expands your logistics team slots, letting you hire +1 additional co-op operator per level.',
  },
};

/**
 * GET /api/research
 * Retrieves active company R&D research levels and next-upgrade specs
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        legalBalance: true,
        resTerminalLogistics: true,
        resAerodynamics: true,
        resAdvancedPacking: true,
        resECURemapping: true,
        resCoopCapacity: true,
        resBrandPartnership: true,
      },
    });

    if (!company) {
      return res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Corporate profile not found.' });
    }

    // Compile active status and available options
    const researchNodes = [];
    for (const key in RESEARCH_SPECS) {
      const spec = RESEARCH_SPECS[key];
      const currentLevel = (company as any)[key] as number;
      const isMax = currentLevel >= spec.maxLevel;
      const nextCost = isMax ? null : spec.costs[currentLevel];

      researchNodes.push({
        nodeKey: key,
        label: spec.label,
        description: spec.description,
        currentLevel,
        maxLevel: spec.maxLevel,
        isMaxLevel: isMax,
        nextUpgradeCost: nextCost,
      });
    }

    res.json({
      companyId: company.id,
      companyName: company.name,
      legalBalance: parseFloat(Number(company.legalBalance).toFixed(2)),
      brandPartnership: company.resBrandPartnership,
      nodes: researchNodes,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/research/upgrade
 * Upgrades a research node using clean Cash (legalBalance)
 */
router.post('/upgrade', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { nodeKey } = req.body;

  if (!nodeKey || !RESEARCH_SPECS[nodeKey]) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Specify a valid research nodeKey to upgrade.' });
  }

  const spec = RESEARCH_SPECS[nodeKey];
  const lockKey = `company:finance:${companyId}`;

  try {
    await LockService.withLock(lockKey, async () => {
      // 1. Fetch current levels
      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!company) {
        res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Corporate profile not found.' });
        return;
      }

      const currentLevel = (company as any)[nodeKey] as number;

      if (currentLevel >= spec.maxLevel) {
        res.status(400).json({
          error: 'MAX_RESEARCH_LEVEL',
          message: `${spec.label} is already fully researched (Level ${currentLevel}/${spec.maxLevel}).`,
        });
        return;
      }

      const cost = spec.costs[currentLevel];
      const balance = Number(company.legalBalance);

      if (balance < cost) {
        res.status(400).json({
          error: 'INSUFFICIENT_FUNDS',
          message: `Upgrades to ${spec.label} Level ${currentLevel + 1} requires $${cost.toLocaleString()} Clean Cash. Current Balance: $${balance.toLocaleString()}`,
        });
        return;
      }

      // 2. Apply upgrade atomically
      const updatedCompany = await prisma.$transaction(async (tx) => {
        // Deduct
        await tx.company.update({
          where: { id: companyId },
          data: { legalBalance: { decrement: cost } },
        });

        // Increment level
        const updated = await tx.company.update({
          where: { id: companyId },
          data: { [nodeKey]: currentLevel + 1 },
        });

        return updated;
      });

      res.json({
        message: `SUCCESS: Research complete! Upgraded ${spec.label} to Level ${currentLevel + 1}.`,
        nodeKey,
        newLevel: currentLevel + 1,
        legalBalance: parseFloat(Number(updatedCompany.legalBalance).toFixed(2)),
      });
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/research/sign-partnership
 * Signs or changes a corporate Brand Partnership for $150,000 flat
 */
router.post('/sign-partnership', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { manufacturer } = req.body; // e.g. 'MOOSE', 'SCARFIA', 'GUY', 'MYRCEDEZ', 'TESIO', 'LION', 'DRASIA'

  const validBrands = ['MOOSE', 'SCARFIA', 'GUY', 'MYRCEDEZ', 'TESIO', 'LION', 'DRASIA'];

  if (!manufacturer || !validBrands.includes(manufacturer.toUpperCase())) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: `Specify a valid brand partnership from selection: ${validBrands.join(', ')}`,
    });
  }

  const cost = 150000.00; // $150k flat
  const lockKey = `company:finance:${companyId}`;

  try {
    await LockService.withLock(lockKey, async () => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!company) {
        res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Corporate profile not found.' });
        return;
      }

      const activeBrand = company.resBrandPartnership.toUpperCase();
      if (activeBrand === manufacturer.toUpperCase()) {
        res.status(400).json({
          error: 'ALREADY_PARTNERED',
          message: `Your company is already partnered with ${manufacturer}. Contract active.`,
        });
        return;
      }

      const balance = Number(company.legalBalance);
      if (balance < cost) {
        res.status(400).json({
          error: 'INSUFFICIENT_FUNDS',
          message: `Signing a Brand Partnership with ${manufacturer} requires $${cost.toLocaleString()} Clean Cash. Current Balance: $${balance.toLocaleString()}`,
        });
        return;
      }

      // Perform trade
      const updated = await prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id: companyId },
          data: { legalBalance: { decrement: cost } },
        });

        const comp = await tx.company.update({
          where: { id: companyId },
          data: { resBrandPartnership: manufacturer.toUpperCase() },
        });

        return comp;
      });

      res.json({
        message: `SUCCESS: Signed exclusive R&D contract with ${manufacturer}. Unlocks 15% discount on all factory kitted vehicle purchases!`,
        brandPartnership: updated.resBrandPartnership,
        legalBalance: parseFloat(Number(updated.legalBalance).toFixed(2)),
      });
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

export default router;
