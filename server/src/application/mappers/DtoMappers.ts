import { CompanyAggregate } from '../../domain/aggregates/Company';

export interface CompanyValuationDto {
  valuation: number;
  totalShares: number;
  sharePrice: number;
  legalBalance: number;
  blackMarketBalance: number;
  reputationScore: number;
  policeHeat: number;
  activeDebtPrincipal: number;
}

export class DtoMappers {
  /**
   * Translates internal domain aggregates to client-facing contract objects,
   * avoiding structural leaks and sanitizing sensitive database details
   */
  public static toValuationDto(company: CompanyAggregate, valuation: number): CompanyValuationDto {
    const sharePrice = company.state.totalShares === 0 ? 0 : valuation / company.state.totalShares;
    return {
      valuation: parseFloat(valuation.toFixed(2)),
      totalShares: company.state.totalShares,
      sharePrice: parseFloat(sharePrice.toFixed(4)),
      legalBalance: parseFloat(company.legalBalance.toFixed(2)),
      blackMarketBalance: parseFloat(company.blackMarketBalance.toFixed(2)),
      reputationScore: company.state.reputationScore,
      policeHeat: company.state.policeHeat,
      activeDebtPrincipal: parseFloat(company.activeDebtPrincipal.toFixed(2)),
    };
  }
}
