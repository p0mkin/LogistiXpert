import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import { LockService } from '../services/lock.service';

const router = Router();
const prisma = new PrismaClient();

// Protect all staff routes with JWT
router.use(authenticateJWT);

// Max limits and progression costs
const MAX_LEVEL = 5;
const MAX_RANK = 5;

const SEMINAR_COSTS = [0, 5000, 12000, 28000, 65000]; // Level 1 -> 2 costs $5000, etc.
const PROMOTION_COSTS = [0, 8000, 20000, 45000, 100000]; // Rank 1 -> 2 costs $8000, etc.

const UNLOCK_COSTS: Record<string, number> = {
  purchasing_agent: 0,
  lead_mechanic: 15000,
  router: 35000,
};

function getRoleDbFields(roleId: string) {
  switch (roleId) {
    case 'purchasing_agent':
      return { levelKey: 'staffPurchasingAgentLevel', rankKey: 'staffPurchasingAgentRank', unlockedKey: 'staffPurchasingAgentUnlocked' };
    case 'lead_mechanic':
      return { levelKey: 'staffLeadMechanicLevel', rankKey: 'staffLeadMechanicRank', unlockedKey: 'staffLeadMechanicUnlocked' };
    case 'router':
      return { levelKey: 'staffRouterLevel', rankKey: 'staffRouterRank', unlockedKey: 'staffRouterUnlocked' };
    default:
      return null;
  }
}

/**
 * GET /api/staff
 * Returns the current staff structure for the company
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        legalBalance: true,
        staffPurchasingAgentLevel: true,
        staffPurchasingAgentRank: true,
        staffPurchasingAgentUnlocked: true,
        staffLeadMechanicLevel: true,
        staffLeadMechanicRank: true,
        staffLeadMechanicUnlocked: true,
        staffRouterLevel: true,
        staffRouterRank: true,
        staffRouterUnlocked: true,
      },
    });

    if (!company) {
      return res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
    }

    const roles = ['purchasing_agent', 'lead_mechanic', 'router'];
    const staffResponse: Record<string, any> = {};

    roles.forEach((roleId) => {
      const keys = getRoleDbFields(roleId)!;
      const level = company[keys.levelKey as keyof typeof company] as number;
      const rank = company[keys.rankKey as keyof typeof company] as number;
      const unlocked = company[keys.unlockedKey as keyof typeof company] as boolean;

      staffResponse[roleId] = {
        unlocked,
        level,
        rank,
        unlockCost: UNLOCK_COSTS[roleId] || 0,
        nextUpgradeCost: level >= MAX_LEVEL ? null : SEMINAR_COSTS[level],
        nextPromotionCost: rank >= MAX_RANK ? null : PROMOTION_COSTS[rank],
      };
    });

    res.json({
      legalBalance: parseFloat(Number(company.legalBalance).toFixed(2)),
      staff: staffResponse,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/staff/unlock
 * Unlocks / hires a staff role
 */
router.post('/unlock', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { roleId } = req.body;

  const keys = getRoleDbFields(roleId);
  if (!keys) {
    return res.status(400).json({ error: 'INVALID_ROLE', message: 'Invalid staff role specified.' });
  }

  const lockKey = `company:finance:${companyId}`;

  try {
    await LockService.withLock(lockKey, async () => {
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (!company) {
        res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
        return;
      }

      const isUnlocked = company[keys.unlockedKey as keyof typeof company] as boolean;
      if (isUnlocked) {
        res.status(400).json({ error: 'ALREADY_UNLOCKED', message: 'This staff role is already unlocked.' });
        return;
      }

      const cost = UNLOCK_COSTS[roleId];
      const balance = Number(company.legalBalance);

      if (balance < cost) {
        res.status(400).json({
          error: 'INSUFFICIENT_FUNDS',
          message: `Unlocking ${roleId} requires $${cost.toLocaleString()} Clean Cash. Balance: $${balance.toLocaleString()}`,
        });
        return;
      }

      const updatedCompany = await prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id: companyId },
          data: {
            legalBalance: { decrement: cost },
            [keys.unlockedKey]: true,
          },
        });

        return tx.company.findUnique({ where: { id: companyId } });
      });

      res.json({
        message: `SUCCESS: Hired staff member for ${roleId}!`,
        roleId,
        legalBalance: parseFloat(Number(updatedCompany!.legalBalance).toFixed(2)),
        unlocked: true,
      });
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/staff/upgrade
 * Upgrades a staff seminar level
 */
router.post('/upgrade', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { roleId } = req.body;

  const keys = getRoleDbFields(roleId);
  if (!keys) {
    return res.status(400).json({ error: 'INVALID_ROLE', message: 'Invalid staff role specified.' });
  }

  const lockKey = `company:finance:${companyId}`;

  try {
    await LockService.withLock(lockKey, async () => {
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (!company) {
        res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
        return;
      }

      const isUnlocked = company[keys.unlockedKey as keyof typeof company] as boolean;
      if (!isUnlocked) {
        res.status(400).json({ error: 'ROLE_LOCKED', message: 'Unlock/hire this staff member first.' });
        return;
      }

      const level = company[keys.levelKey as keyof typeof company] as number;
      if (level >= MAX_LEVEL) {
        res.status(400).json({ error: 'MAX_LEVEL_REACHED', message: 'Maximum seminar level reached.' });
        return;
      }

      const cost = SEMINAR_COSTS[level];
      const balance = Number(company.legalBalance);

      if (balance < cost) {
        res.status(400).json({
          error: 'INSUFFICIENT_FUNDS',
          message: `Seminar level ${level + 1} requires $${cost.toLocaleString()} Clean Cash. Balance: $${balance.toLocaleString()}`,
        });
        return;
      }

      const updatedCompany = await prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id: companyId },
          data: {
            legalBalance: { decrement: cost },
            [keys.levelKey]: level + 1,
          },
        });

        return tx.company.findUnique({ where: { id: companyId } });
      });

      res.json({
        message: `SUCCESS: Upgraded ${roleId} seminar to Level ${level + 1}!`,
        roleId,
        newLevel: level + 1,
        legalBalance: parseFloat(Number(updatedCompany!.legalBalance).toFixed(2)),
      });
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/staff/promote
 * Promotes a staff rank
 */
router.post('/promote', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { roleId } = req.body;

  const keys = getRoleDbFields(roleId);
  if (!keys) {
    return res.status(400).json({ error: 'INVALID_ROLE', message: 'Invalid staff role specified.' });
  }

  const lockKey = `company:finance:${companyId}`;

  try {
    await LockService.withLock(lockKey, async () => {
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (!company) {
        res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
        return;
      }

      const isUnlocked = company[keys.unlockedKey as keyof typeof company] as boolean;
      if (!isUnlocked) {
        res.status(400).json({ error: 'ROLE_LOCKED', message: 'Unlock/hire this staff member first.' });
        return;
      }

      const rank = company[keys.rankKey as keyof typeof company] as number;
      if (rank >= MAX_RANK) {
        res.status(400).json({ error: 'MAX_RANK_REACHED', message: 'Maximum promotion rank reached.' });
        return;
      }

      const cost = PROMOTION_COSTS[rank];
      const balance = Number(company.legalBalance);

      if (balance < cost) {
        res.status(400).json({
          error: 'INSUFFICIENT_FUNDS',
          message: `Rank ${rank + 1} promotion requires $${cost.toLocaleString()} Clean Cash. Balance: $${balance.toLocaleString()}`,
        });
        return;
      }

      const updatedCompany = await prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id: companyId },
          data: {
            legalBalance: { decrement: cost },
            [keys.rankKey]: rank + 1,
          },
        });

        return tx.company.findUnique({ where: { id: companyId } });
      });

      res.json({
        message: `SUCCESS: Promoted ${roleId} to Rank ${rank + 1}!`,
        roleId,
        newRank: rank + 1,
        legalBalance: parseFloat(Number(updatedCompany!.legalBalance).toFixed(2)),
      });
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

export default router;
