import { PrismaClient, Jurisdiction, RouteStage } from '@prisma/client';
import { GameWebSocketServer } from '../websocket';
import { LockService } from './lock.service';
import { AnalyticsService } from './analytics.service';

const prisma = new PrismaClient();

// In-memory Gold Price and C500 Stock Index
export let currentGoldPrice = 2000.00; // USD per ounce
export let currentC500Index = 1000.00; // Base points

export class FinanceService {
  private static isRunning = false;
  private static intervalId: NodeJS.Timeout | null = null;
  private static TICK_INTERVAL_MS = 10000; // Runs every 10 seconds

  /**
   * Starts the background corporate financial, interest, and gold ticker
   */
  static startTicker() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[Finance] Starting dynamic financial ticker (Accrues interest, gold drift, foreclosure checks every ${this.TICK_INTERVAL_MS / 1000}s)...`);

    this.intervalId = setInterval(async () => {
      try {
        await this.processFinancialTick();
      } catch (error) {
        console.error('[Finance] Error processing financial tick:', error);
      }
    }, this.TICK_INTERVAL_MS);
  }

  /**
   * Main financial processing tick
   */
  private static async processFinancialTick() {
    // 1. DRIFT GOLD PRICES (Random-Walk)
    const drift = (Math.random() - 0.5) * 40.0; // max +/- $20 fluctuation
    currentGoldPrice = Math.max(1000.00, Math.min(5000.00, currentGoldPrice + drift));

    // Broadcast gold price update
    GameWebSocketServer.broadcast('market:gold_update', {
      goldPrice: parseFloat(currentGoldPrice.toFixed(2)),
    });

    // 2. FETCH ALL ACTIVE COMPANIES
    const companies = await prisma.company.findMany({
      include: {
        trucks: true,
        garages: true,
        fronts: true,
      },
    });

    if (companies.length === 0) return;

    // 3. COMPUTE STOCK INDEX (C500)
    const valuations: { companyId: string; valuation: number }[] = [];

    for (const company of companies) {
      try {
        const val = await this.calculateCompanyValuation(company.id);
        valuations.push({ companyId: company.id, valuation: val });
      } catch (err) {
        console.error(`[Finance] Error calculating valuation for company ${company.id}:`, err);
      }
    }

    // Sort valuations descending
    valuations.sort((a, b) => b.valuation - a.valuation);
    const topValuations = valuations.slice(0, 5);
    const avgTopVal = topValuations.reduce((sum, item) => sum + item.valuation, 0) / Math.max(1, topValuations.length);
    currentC500Index = Math.max(100.0, avgTopVal / 5000.0); // scaled base factor

    GameWebSocketServer.broadcast('market:c500_update', {
      c500Index: parseFloat(currentC500Index.toFixed(2)),
      topCompanies: topValuations,
    });

    // 4. ACCRUE DEBT INTEREST & RUN FORECLOSURE CHECKS
    for (const company of companies) {
      const lockKey = `company:finance:${company.id}`;
      await LockService.withLock(lockKey, async () => {
        const updatedCompany = await prisma.company.findUnique({
          where: { id: company.id },
          include: { trucks: true, garages: true, fronts: true },
        });

        if (!updatedCompany) return;

        let currentLegal = Number(updatedCompany.legalBalance);
        let currentPrincipal = Number(updatedCompany.activeDebtPrincipal);

        // A. ACCRUE DEBT INTEREST
        if (currentPrincipal > 0) {
          // Accelerated APR tick: Clean interest cost calculated as: (Principal * APR%) / 1000
          // This gives a noticeable but highly balanced realtime burn rate (e.g. $10 on $100k loan at 10% APR per tick)
          const interestAPR = updatedCompany.activeDebtInterest;
          const interestTick = (currentPrincipal * (interestAPR / 100.0)) / 1000.0;

          currentLegal -= interestTick;

          // Deduct from database
          await prisma.$transaction(async (tx) => {
            await tx.company.update({
              where: { id: company.id },
              data: {
                legalBalance: currentLegal,
              },
            });

            await AnalyticsService.recordTransaction(
              tx,
              company.id,
              null,
              null,
              'EXPENSE_INTEREST',
              interestTick
            );
          });

          // Send balance update to company members
          GameWebSocketServer.sendToCompany(company.id, 'company:balance_update', {
            legalBalance: parseFloat(currentLegal.toFixed(2)),
            blackMarketBalance: parseFloat(Number(updatedCompany.blackMarketBalance).toFixed(2)),
            message: `Paid outstanding loan interest tick of $${interestTick.toFixed(2)} Clean Cash.`,
          });
        }

        // B. RUN INSOLVENCY / FORECLOSURE ENGINES
        const valuation = valuations.find(v => v.companyId === company.id)?.valuation || 50000.00;
        const dynamicInsolvencyLimit = -(10000.00 + valuation * 0.20);

        if (currentLegal < dynamicInsolvencyLimit) {
          // Breached limits!
          if (!updatedCompany.warningInsolventAt) {
            // Initiate Warning State
            const warningTime = new Date();
            await prisma.company.update({
              where: { id: company.id },
              data: { warningInsolventAt: warningTime },
            });

            GameWebSocketServer.sendToCompany(company.id, 'finance:insolvency_warning', {
              insolvencyLimit: parseFloat(dynamicInsolvencyLimit.toFixed(2)),
              currentBalance: parseFloat(currentLegal.toFixed(2)),
              warningExpiresInMinutes: 10,
              message: `WARNING: Insolvency Alert! Your company has breached its dynamic debt limit of $${dynamicInsolvencyLimit.toFixed(2)}. You have 10 minutes to return above the threshold or the creditor banks will repossess your newest truck!`,
            });
          } else {
            // Already in Warning State, check duration
            const warningStart = new Date(updatedCompany.warningInsolventAt).getTime();
            const warningGracePeriodMs = 10 * 60 * 1000; // 10 minutes of active gameplay
            
            if (Date.now() - warningStart > warningGracePeriodMs) {
              // Grace period expired! Repo a truck!
              await this.triggerForeclosureRepossession(updatedCompany.id);
            }
          }
        } else {
          // Back in safety, clear warning
          if (updatedCompany.warningInsolventAt) {
            await prisma.company.update({
              where: { id: company.id },
              data: { warningInsolventAt: null },
            });

            GameWebSocketServer.sendToCompany(company.id, 'finance:insolvency_resolved', {
              message: `DEBT WARNING RESOLVED: Legal cash balance is back above the dynamic insolvency safety line.`,
            });
          }
        }
      }).catch((lockErr) => {
        // Log and proceed, do not crash ticker
        console.warn(`[Finance Ticker] Locked company ${company.id} skipped this tick: ${lockErr.message}`);
      });
    }
  }

  /**
   * Calculates the true dynamic valuation of a company
   */
  static async calculateCompanyValuation(companyId: string, txClient?: any): Promise<number> {
    const client = txClient || prisma;
    const company = await client.company.findUnique({
      where: { id: companyId },
      select: {
        legalBalance: true,
        blackMarketBalance: true,
        activeDebtPrincipal: true,
        reputationScore: true,
        resTerminalLogistics: true,
        resAerodynamics: true,
        resAdvancedPacking: true,
        resECURemapping: true,
        resCoopCapacity: true,
        trucks: {
          select: {
            manufacturer: true,
            tier: true,
            engineHealth: true,
            cosmeticHealth: true,
          },
        },
        garages: {
          select: {
            upgradeLevel: true,
            terminalLevel: true,
          },
        },
        _count: {
          select: { fronts: true },
        },
      },
    });

    if (!company) return 0;

    // 1. Legal & Black market cash reserves
    const cash = Number(company.legalBalance) + Number(company.blackMarketBalance);

    // 2. Garages Asset value (base $150k + $50k per upgrade level)
    let garagesValue = 0;
    for (const garage of company.garages) {
      garagesValue += 150000.00 + (garage.upgradeLevel - 1) * 50000.00;
      garagesValue += garage.terminalLevel * 15000.00; // worker speeds add book value
    }

    // 3. Front Business cash laundering value
    // Handle both _count (Prisma select) or fronts (raw mock arrays) for test compatibility
    const frontsCount = company._count ? company._count.fronts : (company.fronts?.length || 0);
    const frontsValue = frontsCount * 80000.00;

    // 4. Depreciated Trucks Asset value
    let trucksValue = 0;
    for (const truck of company.trucks) {
      const retail = this.getTruckRetailValue(truck.manufacturer, truck.tier);
      const engineDeprec = (100 - truck.engineHealth) / 200.0;
      const cosmeticDeprec = (100 - truck.cosmeticHealth) / 400.0;
      const depreciated = retail * Math.max(0.1, 1.0 - engineDeprec - cosmeticDeprec); // wear & cosmetic depreciation
      trucksValue += depreciated;
    }

    // 5. Deduct outstanding loan principal
    const outstandingDebt = Number(company.activeDebtPrincipal);

    // 6. Corporate Reputation multiplier + R&D investments value
    const reputationAsset = company.reputationScore * 1000.00;
    const rdInvestmentValue = (
      company.resTerminalLogistics +
      company.resAerodynamics +
      company.resAdvancedPacking +
      company.resECURemapping +
      company.resCoopCapacity
    ) * 25000.00;

    const netValuation = cash + garagesValue + frontsValue + trucksValue + reputationAsset + rdInvestmentValue - outstandingDebt;
    return Math.max(10000.00, netValuation); // Floor at $10k minimal valuation
  }

  /**
   * Helper to retrieve static retail brand costs
   */
  static getTruckRetailValue(manufacturer: string, tier: string): number {
    const m = manufacturer.toLowerCase();
    const t = tier.toUpperCase();

    let basePrice = 100000.00;

    if (m === 'moose') {
      if (t.includes('VAN')) basePrice = 35000;
      else if (t.includes('MEDIUM')) basePrice = 85000;
      else if (t.includes('HEAVY')) basePrice = 120000;
      else if (t.includes('ARTICULATED')) basePrice = 190000;
      else basePrice = 280000; // SUPER_HEAVY
    } else if (m === 'scarfia') {
      if (t.includes('VAN')) basePrice = 40000;
      else if (t.includes('MEDIUM')) basePrice = 100000;
      else if (t.includes('HEAVY')) basePrice = 140000;
      else if (t.includes('ARTICULATED')) basePrice = 220000;
      else basePrice = 310000;
    } else if (m === 'guy') {
      if (t.includes('VAN')) basePrice = 30000;
      else if (t.includes('MEDIUM')) basePrice = 80000;
      else if (t.includes('HEAVY')) basePrice = 110000;
      else if (t.includes('ARTICULATED')) basePrice = 175000;
      else basePrice = 260000;
    } else if (m === 'myrcedez') {
      if (t.includes('VAN')) basePrice = 45000;
      else if (t.includes('MEDIUM')) basePrice = 95000;
      else if (t.includes('HEAVY')) basePrice = 135000;
      else if (t.includes('ARTICULATED')) basePrice = 210000;
      else basePrice = 300000;
    } else if (m === 'tesio') {
      if (t.includes('HEAVY')) basePrice = 250000; // Electric Rigids
      else basePrice = 380000; // Electric Articulateds
    } else if (m === 'lion') {
      if (t.includes('VAN')) basePrice = 30000;
      else basePrice = 70000; // Rigid Medium
    } else if (m === 'drasia') {
      if (t.includes('MEDIUM')) basePrice = 25000;
      else basePrice = 45000; // Rigid Heavy
    }

    return basePrice;
  }

  /**
   * Repossesses the company's newest collateral trucks and schedules forced auctions
   */
  private static async triggerForeclosureRepossession(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { trucks: true },
    });

    if (!company || company.trucks.length === 0) return;

    // Find the newest trucks (purchased last, highest collateral value)
    const sortedTrucks = [...company.trucks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    // Select the first newest truck
    const truckToForeclose = sortedTrucks[0];

    console.log(`[Finance] Foreclosure Triggered: Seizing truck ${truckToForeclose.model} (${truckToForeclose.id}) from company ${companyId}`);

    // Cascade Cleanup on the selected truck:
    // 1. Cancel active routes
    await prisma.activeRoute.deleteMany({
      where: { truckId: truckToForeclose.id },
    });

    // 2. Unassign driver
    await prisma.driver.updateMany({
      where: { assignedTruckId: truckToForeclose.id },
      data: { assignedTruckId: null },
    });

    // 3. Move truck into forced auction
    const retail = this.getTruckRetailValue(truckToForeclose.manufacturer, truckToForeclose.tier);
    const depreciatedValue = retail * (1.0 - (100 - truckToForeclose.engineHealth) / 200.0);
    const smartPriceFloor = depreciatedValue * 0.85;

    const auctionDurationMs = 15 * 60 * 1000; // strict 15 minutes minimum duration
    const expiry = new Date(Date.now() + auctionDurationMs);

    // Create the System-Forced Foreclosure Auction
    const auction = await prisma.auctionListing.create({
      data: {
        truckId: truckToForeclose.id,
        sellerCompanyId: companyId,
        startingPrice: smartPriceFloor,
        currentBid: smartPriceFloor,
        reservePrice: smartPriceFloor,
        buyoutPrice: depreciatedValue,
        isForeclosed: true,
        expiresAt: expiry,
      },
    });

    // Reset warning insolvency to give them fresh air for other trucks
    await prisma.company.update({
      where: { id: companyId },
      data: { warningInsolventAt: null },
    });

    // Dispatch WebSocket notifications
    GameWebSocketServer.sendToCompany(companyId, 'finance:foreclosure_alert', {
      truckId: truckToForeclose.id,
      model: truckToForeclose.model,
      vin: truckToForeclose.vin,
      auctionId: auction.id,
      startingPrice: smartPriceFloor,
      message: `BANK FORECLOSURE: The creditor bank has repossessed your newest vehicle ${truckToForeclose.model} (VIN: ${truckToForeclose.vin}) to cover unpaid debts. It has been placed on forced foreclosure auction with a smart reserve floor of $${smartPriceFloor.toFixed(2)}.`,
    });

    GameWebSocketServer.broadcast('auction:new_listing', {
      auctionId: auction.id,
      truckModel: truckToForeclose.model,
      startingPrice: smartPriceFloor,
      isForeclosed: true,
      expiresAt: expiry,
    });
  }

  /**
   * Periodic check called by auction sweeper watchdog to finalize foreclosed systems
   */
  static async settleForeclosedAuction(auctionId: string) {
    const auction = await prisma.auctionListing.findUnique({
      where: { id: auctionId },
      include: { truck: true },
    });

    if (!auction || auction.status !== 'ACTIVE') return;

    if (auction.highestBidderCompanyId) {
      // Foreclosed auction SOLD to another player! Settle standard transaction
      const finalPrice = Number(auction.currentBid);
      const buyerId = auction.highestBidderCompanyId;
      const sellerId = auction.sellerCompanyId; // The debtor company

      await prisma.$transaction(async (tx) => {
        // 1. Deduct funds from buyer
        await tx.company.update({
          where: { id: buyerId },
          data: { legalBalance: { decrement: finalPrice } },
        });

        // 2. Transfer truck ownership to buyer
        await tx.truck.update({
          where: { id: auction.truckId },
          data: { companyId: buyerId },
        });

        // 3. Add 100% of final funds to seller's legalBalance to clear debt
        await tx.company.update({
          where: { id: sellerId },
          data: { legalBalance: { increment: finalPrice } },
        });

        // 4. Record truck logs
        await tx.truckHistory.create({
          data: {
            truckId: auction.truckId,
            eventType: 'AUCTION_SALE',
            description: `BANK FORECLOSURE SETTLED: Sold to company ${buyerId} for $${finalPrice.toFixed(2)}. Out of foreclosure.`,
          },
        });

        // 5. Close Listing
        await tx.auctionListing.update({
          where: { id: auction.id },
          data: { status: 'CLOSED_SOLD', settledAt: new Date() },
        });
      });

      GameWebSocketServer.sendToCompany(sellerId, 'finance:foreclosure_settled', {
        amountSettle: finalPrice,
        message: `DEBT CREDITED: Your foreclosed truck was sold at auction for $${finalPrice.toFixed(2)}. This amount was credited to your corporate balance.`,
      });

    } else {
      // UNSOLD! Falls back to automated bank buyback buy-out at 80% depreciated value
      const buybackAmount = Number(auction.startingPrice) * (0.80 / 0.85); // equivalent to 80% depreciated value
      const sellerId = auction.sellerCompanyId;

      await prisma.$transaction(async (tx) => {
        // 1. Credit debtor company balance to restore sanity
        await tx.company.update({
          where: { id: sellerId },
          data: { legalBalance: { increment: buybackAmount } },
        });

        // 2. Remove the truck from existence (liquidated/crushed/reclaimed by bank)
        await tx.truck.delete({
          where: { id: auction.truckId },
        });

        // 3. Close and delete the listing
        await tx.auctionListing.delete({
          where: { id: auction.id },
        });
      });

      GameWebSocketServer.sendToCompany(sellerId, 'finance:foreclosure_settled', {
        amountSettle: buybackAmount,
        message: `BANK BUYBACK COMPLETED: No active bids were received. The bank liquidated and bought back the truck for $${buybackAmount.toFixed(2)}, which was credited to your corporate balance.`,
      });
    }
  }

  /**
   * Shuts down financial ticking loops
   */
  static stopTicker() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[Finance] Financial ticker suspended.');
  }
}
