import { Company as PrismaCompany, Garage, Truck, Jurisdiction, Prisma } from '@prisma/client';

export class CompanyAggregate {
  constructor(
    public readonly state: PrismaCompany & { garages: Garage[]; trucks: Truck[] }
  ) {}

  public get id(): string { return this.state.id; }
  public get legalBalance(): number { return Number(this.state.legalBalance); }
  public get blackMarketBalance(): number { return Number(this.state.blackMarketBalance); }
  public get activeDebtPrincipal(): number { return Number(this.state.activeDebtPrincipal); }

  /**
   * Enforces and calculates dynamic borrowing constraints
   */
  public calculateCreditStatus(): { creditCeiling: number; activeAPR: number; assetsValue: number } {
    let assetsValue = 0;
    for (const garage of this.state.garages) {
      assetsValue += 150000.00 + (garage.upgradeLevel - 1) * 50000.00 + garage.terminalLevel * 15000.00;
    }
    for (const truck of this.state.trucks) {
      // Basic retail valuations (Simulated values matching client metrics)
      const retail = truck.manufacturer === 'TesIo' ? 180000 : 120000;
      const engineDeprec = (100 - truck.engineHealth) / 200.0;
      const cosmeticDeprec = (100 - truck.cosmeticHealth) / 400.0;
      assetsValue += retail * Math.max(0.1, 1.0 - engineDeprec - cosmeticDeprec);
    }

    const effectiveRep = this.state.reputationScore + this.state.marketingRepBoost;
    const creditCeiling = (assetsValue * 0.5) + (effectiveRep * 2000.00);
    const activeAPR = Math.max(4.5, 26.0 - (effectiveRep * 0.04));

    return { creditCeiling, activeAPR, assetsValue };
  }

  /**
   * Enforces business constraints when borrowing clean cash
   */
  public borrow(amount: number): void {
    if (amount <= 0) throw new Error('Borrow amount must be positive.');
    
    const { creditCeiling, activeAPR } = this.calculateCreditStatus();
    const newPrincipal = this.activeDebtPrincipal + amount;

    if (newPrincipal > creditCeiling) {
      throw new Error(`CREDIT_LIMIT_EXCEEDED: Credit limit is $${creditCeiling.toFixed(2)}. Principal would rise to $${newPrincipal.toFixed(2)}.`);
    }

    this.state.activeDebtPrincipal = new Prisma.Decimal(newPrincipal);
    this.state.activeDebtInterest = activeAPR;
    this.state.legalBalance = new Prisma.Decimal(this.legalBalance + amount);
  }

  /**
   * Enforces rules around loan repayments
   */
  public repay(amount: number): number {
    if (amount <= 0) throw new Error('Repayment amount must be positive.');
    if (this.activeDebtPrincipal <= 0) throw new Error('NO_OUTSTANDING_DEBT');

    const payAmount = Math.min(amount, this.activeDebtPrincipal);
    if (this.legalBalance < payAmount) {
      throw new Error('INSUFFICIENT_LEGAL_FUNDS');
    }

    this.state.activeDebtPrincipal = new Prisma.Decimal(this.activeDebtPrincipal - payAmount);
    this.state.legalBalance = new Prisma.Decimal(this.legalBalance - payAmount);

    return payAmount;
  }

  /**
   * Enforces constraints on purchasing shares of competitors (Anti-Takeover & Wash-Trading)
   */
  public calculateStockPurchaseCost(
    targetCompany: { isPublic: boolean; totalShares: number; clanId: string | null; valuation: number },
    sharesAmount: number,
    existingSharesOwned: number
  ): { baseCost: number; finalCost: number; taxCharged: number } {
    if (!targetCompany.isPublic) throw new Error('TARGET_NOT_PUBLIC');

    const newSharesOwned = existingSharesOwned + sharesAmount;
    if (newSharesOwned > targetCompany.totalShares * 0.49) {
      throw new Error('HOSTILE_TAKEOVER_SHIELD_TRIGGERED: Cannot own > 49% of competitor shares.');
    }

    const sharePrice = targetCompany.valuation / targetCompany.totalShares;
    const baseCost = sharePrice * sharesAmount;

    // Sibling clan wash-trading multiplier
    const sameClan = this.state.clanId && this.state.clanId === targetCompany.clanId;
    const taxRateMultiplier = sameClan ? 1.50 : 1.00;
    const finalCost = baseCost * taxRateMultiplier;
    const taxCharged = finalCost - baseCost;

    if (this.legalBalance < finalCost) {
      throw new Error(`INSUFFICIENT_FUNDS: Cost is $${finalCost.toFixed(2)}, available balance is $${this.legalBalance.toFixed(2)}.`);
    }

    return { baseCost, finalCost, taxCharged };
  }

  /**
   * Safely deducts funds when purchasing competitor shares
   */
  public buyShares(cost: number): void {
    if (this.legalBalance < cost) {
      throw new Error(`INSUFFICIENT_FUNDS: Available balance is $${this.legalBalance.toFixed(2)}, but cost is $${cost.toFixed(2)}.`);
    }
    this.state.legalBalance = new Prisma.Decimal(this.legalBalance - cost);
  }

  /**
   * Safely adds net proceeds from selling competitor shares
   */
  public sellShares(netProceeds: number): void {
    if (netProceeds <= 0) throw new Error('Net proceeds must be positive.');
    this.state.legalBalance = new Prisma.Decimal(this.legalBalance + netProceeds);
  }

  /**
   * Encapsulates jurisdiction-specific capital gains tax calculation
   */
  public calculateCapitalGainsTax(
    purchaseDate: Date,
    sharesAmount: number,
    avgPurchasePrice: number,
    currentSharePrice: number
  ): { profit: number; tax: number; netProceeds: number; holdsShortTerm: boolean } {
    const holdsShortTerm = Date.now() - new Date(purchaseDate).getTime() < 10 * 60 * 1000; // 10 minutes short-term day-trading

    let capGainsRate = 0.25; // default Baltics standard long-term
    const jurisdiction = this.state.jurisdiction;

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

    const totalCost = currentSharePrice * sharesAmount;
    const profit = Math.max(0, (currentSharePrice - avgPurchasePrice) * sharesAmount);
    const tax = profit * capGainsRate;
    const netProceeds = totalCost - tax;

    return { profit, tax, netProceeds, holdsShortTerm };
  }
}

