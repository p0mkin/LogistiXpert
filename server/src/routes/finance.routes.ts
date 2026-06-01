import { Router, Response } from 'express';
import { PrismaClient, Jurisdiction } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import { FinanceService, currentGoldPrice, currentC500Index } from '../services/finance.service';
import { LockService } from '../services/lock.service';

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
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
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
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
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
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/finance/trade
 * Buy or Sell shares of a public competitor
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
      const targetCompany = await prisma.company.findUnique({
        where: { id: targetCompanyId },
      });

      const buyerCompany = await prisma.company.findUnique({
        where: { id: buyerCompanyId },
      });

      if (!targetCompany || !buyerCompany) {
        res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Buyer or target company not found.' });
        return;
      }

      if (!targetCompany.isPublic) {
        res.status(400).json({ error: 'NOT_PUBLIC', message: 'Target company is not publicly traded.' });
        return;
      }

      const targetValuation = await FinanceService.calculateCompanyValuation(targetCompanyId);
      const sharePrice = targetValuation / targetCompany.totalShares;
      const totalCost = sharePrice * sharesAmount;

      // Anti-Manipulation check: Sibling Clan wash-trading penalty
      const sameClan = buyerCompany.clanId && buyerCompany.clanId === targetCompany.clanId;
      const taxRateMultiplier = sameClan ? 1.50 : 1.00; // 50% extra tax on intra-clan trades

      if (action.toUpperCase() === 'BUY') {
        // Ownership Limit cap: No company can own > 49% of another company's shares
        const existingHolding = await prisma.companyShare.findUnique({
          where: { companyId_ownerCompanyId: { companyId: targetCompanyId, ownerCompanyId: buyerCompanyId } },
        });

        const currentSharesOwned = existingHolding ? existingHolding.shares : 0;
        const newSharesOwned = currentSharesOwned + sharesAmount;

        if (newSharesOwned > targetCompany.totalShares * 0.49) {
          res.status(400).json({
            error: 'OWNERSHIP_LIMIT_EXCEEDED',
            message: `Hostile Takeover Shield: You cannot own more than 49% of another company's total outstanding shares.`,
          });
          return;
        }

        const finalCost = totalCost * taxRateMultiplier;

        if (Number(buyerCompany.legalBalance) < finalCost) {
          res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: `Insufficient clean cash. Cost: $${finalCost.toFixed(2)}, Available: $${Number(buyerCompany.legalBalance).toFixed(2)}` });
          return;
        }

        await prisma.$transaction(async (tx) => {
          // Deduct cost
          await tx.company.update({
            where: { id: buyerCompanyId },
            data: { legalBalance: { decrement: finalCost } },
          });

          // Upsert holdings
          await tx.companyShare.upsert({
            where: { companyId_ownerCompanyId: { companyId: targetCompanyId, ownerCompanyId: buyerCompanyId } },
            update: {
              shares: { increment: sharesAmount },
              avgPurchasePrice: (existingHolding ? (Number(existingHolding.avgPurchasePrice) * currentSharesOwned + totalCost) / newSharesOwned : sharePrice),
              purchasedAt: new Date(),
            },
            create: {
              companyId: targetCompanyId,
              ownerCompanyId: buyerCompanyId,
              shares: sharesAmount,
              avgPurchasePrice: sharePrice,
              purchasedAt: new Date(),
            },
          });
        });

        res.json({
          message: `SUCCESS: Purchased ${sharesAmount} shares of ${targetCompany.name} at $${sharePrice.toFixed(4)}/share.`,
          sharesOwned: newSharesOwned,
        });

      } else if (action.toUpperCase() === 'SELL') {
        const existingHolding = await prisma.companyShare.findUnique({
          where: { companyId_ownerCompanyId: { companyId: targetCompanyId, ownerCompanyId: buyerCompanyId } },
        });

        if (!existingHolding || existingHolding.shares < sharesAmount) {
          res.status(400).json({ error: 'INSUFFICIENT_SHARES', message: 'You do not own enough shares to execute this sale.' });
          return;
        }

        // Capital Gains Tax Calculation
        let capGainsRate = 0.25; // default Baltics standard long-term
        const holdsShortTerm = Date.now() - new Date(existingHolding.purchasedAt).getTime() < 10 * 60 * 1000; // 10 minutes short-term day-trading

        const jurisdiction = buyerCompany.jurisdiction;
        if (holdsShortTerm) {
          // Short-Term heavy surcharges
          if (jurisdiction === Jurisdiction.SCANDINAVIA) capGainsRate = 0.45;
          else if (jurisdiction === Jurisdiction.GERMANY) capGainsRate = 0.40;
          else if (jurisdiction === Jurisdiction.BALTICS) capGainsRate = 0.25;
          else capGainsRate = 0.15; // Belarus
        } else {
          // Long-Term standard
          if (jurisdiction === Jurisdiction.SCANDINAVIA) capGainsRate = 0.30;
          else if (jurisdiction === Jurisdiction.GERMANY) capGainsRate = 0.25;
          else if (jurisdiction === Jurisdiction.BALTICS) capGainsRate = 0.19;
          else capGainsRate = 0.10; // Belarus
        }

        const profit = Math.max(0, (sharePrice - Number(existingHolding.avgPurchasePrice)) * sharesAmount);
        const tax = profit * capGainsRate;
        const netCredit = totalCost - tax;

        await prisma.$transaction(async (tx) => {
          // Increment legal balance
          await tx.company.update({
            where: { id: buyerCompanyId },
            data: { legalBalance: { increment: netCredit } },
          });

          // Decrement holdings
          if (existingHolding.shares === sharesAmount) {
            await tx.companyShare.delete({
              where: { id: existingHolding.id },
            });
          } else {
            await tx.companyShare.update({
              where: { id: existingHolding.id },
              data: { shares: { decrement: sharesAmount } },
            });
          }
        });

        res.json({
          message: `SUCCESS: Sold ${sharesAmount} shares of ${targetCompany.name} at $${sharePrice.toFixed(4)}/share.`,
          profit: parseFloat(profit.toFixed(2)),
          taxCharged: parseFloat(tax.toFixed(2)),
          netProceeds: parseFloat(netCredit.toFixed(2)),
          holdingPeriod: holdsShortTerm ? 'SHORT_TERM_DAY_TRADE' : 'LONG_TERM_STABLE',
        });
      } else {
        res.status(400).json({ error: 'INVALID_ACTION', message: 'Action must be BUY or SELL.' });
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
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
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/finance/loans/borrow
 * Borrows funds from the bank using corporate reputation and assets as collateral
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
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        include: { trucks: true, garages: true },
      });

      if (!company) {
        res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
        return;
      }

      // Calculate collateral
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
      const creditCeiling = (assetsValue * 0.5) + (effectiveRep * 2000.00);

      const currentPrincipal = Number(company.activeDebtPrincipal);
      const newPrincipal = currentPrincipal + amount;

      if (newPrincipal > creditCeiling) {
        res.status(400).json({
          error: 'CREDIT_LIMIT_EXCEEDED',
          message: `Your credit limit of $${creditCeiling.toFixed(2)} is insufficient. Max borrow available: $${Math.max(0, creditCeiling - currentPrincipal).toFixed(2)}`,
        });
        return;
      }

      // Dynamic Interest Rate APR scales with new borrowing status
      const activeAPR = Math.max(4.5, 26.0 - (effectiveRep * 0.04));

      await prisma.company.update({
        where: { id: companyId },
        data: {
          activeDebtPrincipal: newPrincipal,
          activeDebtInterest: activeAPR,
          legalBalance: { increment: amount },
        },
      });

      res.json({
        message: `FINANCING APPROVED: Borrowed $${amount.toFixed(2)} Clean Cash.`,
        activeDebtPrincipal: parseFloat(newPrincipal.toFixed(2)),
        activeDebtInterest: parseFloat(activeAPR.toFixed(2)),
      });
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/finance/loans/repay
 * Repays outstanding debt principal using clean legal cash
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
      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!company) {
        res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
        return;
      }

      const currentDebt = Number(company.activeDebtPrincipal);
      if (currentDebt <= 0) {
        res.status(400).json({ error: 'NO_DEBT', message: 'Your company has no outstanding active debts.' });
        return;
      }

      const payAmount = Math.min(amount, currentDebt);
      const balance = Number(company.legalBalance);

      if (balance < payAmount) {
        res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: 'Insufficient clean legal cash to settle debt.' });
        return;
      }

      const remainingDebt = currentDebt - payAmount;

      await prisma.company.update({
        where: { id: companyId },
        data: {
          activeDebtPrincipal: remainingDebt,
          legalBalance: { decrement: payAmount },
        },
      });

      res.json({
        message: `DEBT REPAYMENT COMPLETED: Settled $${payAmount.toFixed(2)} debt.`,
        remainingPrincipal: parseFloat(remainingDebt.toFixed(2)),
      });
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
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
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
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
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

export default router;
