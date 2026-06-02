import { Router, Response } from 'express';
import { PrismaClient, Jurisdiction } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import { FinanceService, currentGoldPrice, currentC500Index } from '../services/finance.service';
import { LockService } from '../services/lock.service';
import { PrismaUnitOfWork } from '../infrastructure/persistence/PrismaUnitOfWork';
import { BorrowLoanCommandHandler } from '../application/commands/BorrowLoanCommand';
import { RepayLoanCommandHandler } from '../application/commands/RepayLoanCommand';
import { TradeSharesCommandHandler } from '../application/commands/TradeSharesCommand';

const router = Router();
const prisma = new PrismaClient();

// Apply auth globally
router.use(authenticateJWT);

/**
 * GET /api/finance/valuation
 * Returns detailed valuation of the company and current estimated share price
 */
router.get('/valuation', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const valuation = await FinanceService.calculateCompanyValuation(companyId);
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
    }

    const sharePrice = valuation / company.totalShares;

    res.json({
      valuation: parseFloat(valuation.toFixed(2)),
      totalShares: company.totalShares,
      sharePrice: parseFloat(sharePrice.toFixed(4)),
      isPublic: company.isPublic,
      legalBalance: parseFloat(Number(company.legalBalance).toFixed(2)),
      blackMarketBalance: parseFloat(Number(company.blackMarketBalance).toFixed(2)),
      reputationScore: company.reputationScore,
      policeHeat: company.policeHeat,
      activeDebtPrincipal: parseFloat(Number(company.activeDebtPrincipal).toFixed(2)),
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'SERVER_ERROR';
    res.status(statusCode).json({ error: errorCode, message: error.message });
  }
});

/**
 * POST /api/finance/ipo
 * Launches public IPO if requirements are met
 */
router.post('/ipo', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const lockKey = `company:finance:${companyId}`;

  try {
    await LockService.withLock(lockKey, async () => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        include: { trucks: { include: { history: true } } },
      });

      if (!company) {
        throw new Error('Company not found.');
      }

      if (company.isPublic) {
        res.status(400).json({ error: 'ALREADY_PUBLIC', message: 'Company is already public.' });
        return;
      }

      // 1. Calculate valuation
      const valuation = await FinanceService.calculateCompanyValuation(companyId);

      // 2. Count deliveries from truck histories
      const deliveriesCount = await prisma.truckHistory.count({
        where: {
          truck: { companyId },
          eventType: 'ROUTE_COMPLETED',
        },
      });

      // 3. Check requirements
      const minValuation = 4500000.00; // $4.5M
      const minDeliveries = 300;
      const maxHeat = 30;

      if (valuation < minValuation || deliveriesCount < minDeliveries || company.policeHeat >= maxHeat) {
        res.status(400).json({
          error: 'REQUIREMENTS_NOT_MET',
          message: `IPO Requirements not met. Valuation: $${valuation.toFixed(2)}/$${minValuation.toFixed(2)}, Deliveries: ${deliveriesCount}/${minDeliveries}, Heat: ${company.policeHeat}/${maxHeat}`,
        });
        return;
      }

      // Launch IPO!
      await prisma.company.update({
        where: { id: companyId },
        data: { isPublic: true },
      });

      res.json({
        message: 'CONGRATULATIONS: Your company is now publicly traded on the Underworld C500 Stock Exchange!',
        valuation,
        deliveriesCount,
        sharePrice: valuation / company.totalShares,
      });
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'SERVER_ERROR';
    res.status(statusCode).json({ error: errorCode, message: error.message });
  }
});

/**
 * GET /api/finance/market
 * Returns public market ticker tape and listings
 */
router.get('/market', async (req: AuthRequest, res: Response) => {
  try {
    const publicCompanies = await prisma.company.findMany({
      where: { isPublic: true },
      select: {
        id: true,
        name: true,
        totalShares: true,
        reputationScore: true,
      },
    });

    const listings = [];
    for (const comp of publicCompanies) {
      const val = await FinanceService.calculateCompanyValuation(comp.id);
      listings.push({
        companyId: comp.id,
        name: comp.name,
        valuation: parseFloat(val.toFixed(2)),
        sharePrice: parseFloat((val / comp.totalShares).toFixed(4)),
        totalShares: comp.totalShares,
      });
    }

    res.json({
      c500Index: parseFloat(currentC500Index.toFixed(2)),
      goldPrice: parseFloat(currentGoldPrice.toFixed(2)),
      listings,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'SERVER_ERROR';
    res.status(statusCode).json({ error: errorCode, message: error.message });
  }
});

/**
 * POST /api/finance/trade
 * Buy or Sell shares of a public competitor
 * REFACTORED: Decoupled controller delegating execution to TradeSharesCommandHandler
 */
router.post('/trade', async (req: AuthRequest, res: Response) => {
  const buyerCompanyId = req.user!.companyId;
  const { targetCompanyId, action, sharesAmount } = req.body;

  if (!targetCompanyId || !action || !sharesAmount || sharesAmount <= 0) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Specify targetCompanyId, action (BUY/SELL), and a positive sharesAmount.' });
  }

  const lockKey = `company:finance:${buyerCompanyId}`;

  try {
    await LockService.withLock(lockKey, async () => {
      const uow = new PrismaUnitOfWork(prisma);
      const handler = new TradeSharesCommandHandler(uow);

      const result = await handler.handle({
        buyerCompanyId,
        targetCompanyId,
        action: action.toUpperCase() as 'BUY' | 'SELL',
        sharesAmount,
      });

      res.json(result);
    });
  } catch (error: any) {
    if (
      error.message.includes('INSUFFICIENT_FUNDS') ||
      error.message.includes('HOSTILE_TAKEOVER_SHIELD_TRIGGERED') ||
      error.message.includes('INSUFFICIENT_SHARES') ||
      error.message.includes('TARGET_NOT_PUBLIC') ||
      error.message.includes('TARGET_COMPANY_NOT_FOUND')
    ) {
      return res.status(400).json({ error: 'TRADE_FAILED', message: error.message });
    }
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'SERVER_ERROR';
    res.status(statusCode).json({ error: errorCode, message: error.message });
  }
});


/**
 * GET /api/finance/loans
 * Queries current corporate credit limits, dynamic APR, and active debts
 */
router.get('/loans', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { trucks: true, garages: true },
    });

    if (!company) {
      return res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
    }

    // Dynamic Collateral (50% of asset value of trucks and garages)
    let assetsValue = 0;
    for (const garage of company.garages) {
      assetsValue += 150000.00 + (garage.upgradeLevel - 1) * 50000.00 + garage.terminalLevel * 15000.00;
    }
    for (const truck of company.trucks) {
      const retail = FinanceService.getTruckRetailValue(truck.manufacturer, truck.tier);
      const engineDeprec = (100 - truck.engineHealth) / 200.0;
      const cosmeticDeprec = (100 - truck.cosmeticHealth) / 400.0;
      assetsValue += retail * Math.max(0.1, 1.0 - engineDeprec - cosmeticDeprec);
    }

    const effectiveRep = company.reputationScore + company.marketingRepBoost;

    // Credit limit ceiling
    const creditCeiling = (assetsValue * 0.5) + (effectiveRep * 2000.00);

    // Dynamic Interest Rate APR (high risk is 26% down to 4.5% base depending on reputation)
    const activeAPR = Math.max(4.5, 26.0 - (effectiveRep * 0.04));

    res.json({
      creditCeiling: parseFloat(creditCeiling.toFixed(2)),
      activeDebtPrincipal: parseFloat(Number(company.activeDebtPrincipal).toFixed(2)),
      activeDebtInterest: parseFloat(company.activeDebtInterest.toFixed(2)),
      estimatedAPR: parseFloat(activeAPR.toFixed(2)),
      reputationScore: company.reputationScore,
      marketingRepBoost: company.marketingRepBoost,
      collateralValue: parseFloat(assetsValue.toFixed(2)),
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'SERVER_ERROR';
    res.status(statusCode).json({ error: errorCode, message: error.message });
  }
});

/**
 * POST /api/finance/loans/borrow
 * Borrows funds from the bank using corporate reputation and assets as collateral
 * REFACTORED: Decoupled controller delegating execution to BorrowLoanCommandHandler
 */
router.post('/loans/borrow', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Specify a positive borrow amount.' });
  }

  const lockKey = `company:finance:${companyId}`;

  try {
    await LockService.withLock(lockKey, async () => {
      const uow = new PrismaUnitOfWork(prisma);
      const handler = new BorrowLoanCommandHandler(uow);

      const result = await handler.handle({ companyId, amount });

      res.json({
        message: `FINANCING APPROVED: Borrowed $${amount.toFixed(2)} Clean Cash.`,
        activeDebtPrincipal: parseFloat(result.activeDebtPrincipal.toFixed(2)),
        activeDebtInterest: parseFloat(result.activeDebtInterest.toFixed(2)),
      });
    });
  } catch (error: any) {
    if (error.message.includes('CREDIT_LIMIT_EXCEEDED') || error.message.includes('COMPANY_NOT_FOUND')) {
      return res.status(400).json({ error: 'BORROW_FAILED', message: error.message });
    }
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'SERVER_ERROR';
    res.status(statusCode).json({ error: errorCode, message: error.message });
  }
});

/**
 * POST /api/finance/loans/repay
 * Repays outstanding debt principal using clean legal cash
 * REFACTORED: Decoupled controller delegating execution to RepayLoanCommandHandler
 */
router.post('/loans/repay', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Specify a positive repayment amount.' });
  }

  const lockKey = `company:finance:${companyId}`;

  try {
    await LockService.withLock(lockKey, async () => {
      const uow = new PrismaUnitOfWork(prisma);
      const handler = new RepayLoanCommandHandler(uow);

      const result = await handler.handle({ companyId, amount });

      res.json({
        message: `DEBT REPAYMENT COMPLETED: Settled $${result.payAmount.toFixed(2)} debt.`,
        remainingPrincipal: parseFloat(result.remainingPrincipal.toFixed(2)),
      });
    });
  } catch (error: any) {
    if (
      error.message.includes('NO_OUTSTANDING_DEBT') ||
      error.message.includes('INSUFFICIENT_LEGAL_FUNDS') ||
      error.message.includes('COMPANY_NOT_FOUND')
    ) {
      return res.status(400).json({ error: 'REPAYMENT_FAILED', message: error.message });
    }
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'SERVER_ERROR';
    res.status(statusCode).json({ error: errorCode, message: error.message });
  }
});

/**
 * POST /api/finance/marketing
 * Commissions an advertising campaign to temporarily boost corporate reputation score
 */
router.post('/marketing', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { campaignTier } = req.body; // 'LOCAL', 'NATIONAL', 'GLOBAL'

  if (!campaignTier) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Specify marketing campaignTier.' });
  }

  let cost = 10000.00;
  let boost = 100;
  let durationMinutes = 30;

  if (campaignTier === 'NATIONAL') {
    cost = 35000.00;
    boost = 250;
    durationMinutes = 60;
  } else if (campaignTier === 'GLOBAL') {
    cost = 80000.00;
    boost = 600;
    durationMinutes = 120;
  }

  const lockKey = `company:finance:${companyId}`;

  try {
    await LockService.withLock(lockKey, async () => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!company) {
        res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
        return;
      }

      if (Number(company.legalBalance) < cost) {
        res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: 'Insufficient clean cash to fund this marketing campaign.' });
        return;
      }

      const expiry = new Date(Date.now() + durationMinutes * 60 * 1000);

      await prisma.company.update({
        where: { id: companyId },
        data: {
          legalBalance: { decrement: cost },
          marketingRepBoost: boost,
          marketingExpiresAt: expiry,
        },
      });

      res.json({
        message: `SUCCESS: Funded ${campaignTier} marketing campaign. Granted +${boost} temporary Reputation boost!`,
        marketingRepBoost: boost,
        expiresAt: expiry,
      });
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'SERVER_ERROR';
    res.status(statusCode).json({ error: errorCode, message: error.message });
  }
});

/**
 * POST /api/finance/gold/trade
 * Buy or Sell gold from clean reserves
 */
router.post('/gold/trade', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { action, amountOunces } = req.body;

  if (!action || !amountOunces || amountOunces <= 0) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Specify action (BUY/SELL) and a positive amountOunces.' });
  }

  const lockKey = `company:finance:${companyId}`;

  try {
    await LockService.withLock(lockKey, async () => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!company) {
        res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
        return;
      }

      const totalValue = currentGoldPrice * amountOunces;

      if (action.toUpperCase() === 'BUY') {
        if (Number(company.legalBalance) < totalValue) {
          res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: `Insufficient clean cash. Cost of gold: $${totalValue.toFixed(2)}, Available: $${Number(company.legalBalance).toFixed(2)}` });
          return;
        }

        await prisma.company.update({
          where: { id: companyId },
          data: {
            legalBalance: { decrement: totalValue },
            goldStock: { increment: amountOunces },
          },
        });

        res.json({
          message: `SUCCESS: Purchased ${amountOunces.toFixed(2)} ounces of gold at $${currentGoldPrice.toFixed(2)}/oz.`,
          newGoldStock: company.goldStock + amountOunces,
        });

      } else if (action.toUpperCase() === 'SELL') {
        if (company.goldStock < amountOunces) {
          res.status(400).json({ error: 'INSUFFICIENT_GOLD', message: `You only own ${company.goldStock.toFixed(2)} oz of gold.` });
          return;
        }

        await prisma.company.update({
          where: { id: companyId },
          data: {
            legalBalance: { increment: totalValue },
            goldStock: { decrement: amountOunces },
          },
        });

        res.json({
          message: `SUCCESS: Sold ${amountOunces.toFixed(2)} ounces of gold at $${currentGoldPrice.toFixed(2)}/oz.`,
          newGoldStock: company.goldStock - amountOunces,
        });
      } else {
        res.status(400).json({ error: 'INVALID_ACTION', message: 'Action must be BUY or SELL.' });
      }
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'SERVER_ERROR';
    res.status(statusCode).json({ error: errorCode, message: error.message });
  }
});

export default router;
