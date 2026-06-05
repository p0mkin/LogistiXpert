import { DtoMappers } from '../../../application/mappers/DtoMappers';
import { CompanyAggregate } from '../../../domain/aggregates/Company';
import { Prisma, Jurisdiction, Company as PrismaCompany, Garage, Truck } from '@prisma/client';

// We need to mock @prisma/client similar to how other test files do
// because we are using classes like Prisma.Decimal and enums that
// get replaced by the jest.mock in other test files if ran in parallel,
// or we just define our own mock since we are running isolated
class MockDecimal {
  constructor(public val: number) {}
  toNumber() { return this.val; }
  toString() { return this.val.toString(); }
  toFixed(val: number) { return this.val.toFixed(val); }
}

describe('DtoMappers', () => {
  describe('toValuationDto', () => {
    // Helper to create a company state object
    const createCompanyState = (overrides: Partial<PrismaCompany & { garages: Garage[]; trucks: Truck[] }> = {}) => {
      return {
        id: 'company-123',
        name: 'Test Logistics',
        ownerId: 'owner-123',
        clanId: null,
        jurisdiction: Jurisdiction?.BALTICS || 'BALTICS',
        legalBalance: new MockDecimal(10000.50) as any,
        blackMarketBalance: new MockDecimal(5000.25) as any,
        activeDebtPrincipal: new MockDecimal(2000.00) as any,
        activeDebtInterest: 10.5,
        reputationScore: 85,
        marketingRepBoost: 0,
        policeHeat: 20,
        totalShares: 1000,
        isPublic: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        garages: [],
        trucks: [],
        ...overrides,
      } as PrismaCompany & { garages: Garage[]; trucks: Truck[] };
    };

    it('should correctly map a happy path company with positive balances and shares', () => {
      const state = createCompanyState();
      const company = new CompanyAggregate(state);
      const valuation = 150000;

      const dto = DtoMappers.toValuationDto(company, valuation);

      expect(dto).toEqual({
        valuation: 150000.00,
        totalShares: 1000,
        sharePrice: 150.0000,
        legalBalance: 10000.50,
        blackMarketBalance: 5000.25,
        reputationScore: 85,
        policeHeat: 20,
        activeDebtPrincipal: 2000.00,
      });
    });

    it('should handle zero shares gracefully (division by zero edge case)', () => {
      const state = createCompanyState({ totalShares: 0 });
      const company = new CompanyAggregate(state);
      const valuation = 150000;

      const dto = DtoMappers.toValuationDto(company, valuation);

      expect(dto.totalShares).toBe(0);
      expect(dto.sharePrice).toBe(0); // Should not be Infinity or NaN
      expect(dto.valuation).toBe(150000.00);
    });

    it('should map empty states correctly (zero balances, zero debt, empty arrays)', () => {
      const state = createCompanyState({
        legalBalance: new MockDecimal(0) as any,
        blackMarketBalance: new MockDecimal(0) as any,
        activeDebtPrincipal: new MockDecimal(0) as any,
        reputationScore: 0,
        policeHeat: 0,
        totalShares: 100, // Non-zero to test normal share price but with empty states
        garages: [],
        trucks: []
      });
      const company = new CompanyAggregate(state);
      const valuation = 0; // Zero valuation

      const dto = DtoMappers.toValuationDto(company, valuation);

      expect(dto).toEqual({
        valuation: 0,
        totalShares: 100,
        sharePrice: 0,
        legalBalance: 0,
        blackMarketBalance: 0,
        reputationScore: 0,
        policeHeat: 0,
        activeDebtPrincipal: 0,
      });
    });
  });
});
