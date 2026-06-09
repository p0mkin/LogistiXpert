import { ActiveRouteAggregate } from '../domain/aggregates/ActiveRoute';
import { ActiveRoute as PrismaRoute, Driver, Truck, Company, LegalContract, ContrabandJob } from '@prisma/client';

describe('ActiveRouteAggregate', () => {
  const defaultCompany = { resAerodynamics: 0 } as unknown as Company;
  const defaultDriver = { trait: 'NONE' } as unknown as Driver;
  const defaultTruck = { model: 'Diesel Truck', fuelTankMod: 'NONE' } as unknown as Truck;
  const defaultRoute = { id: 'route-1', isFerryTransit: false, progressPct: 0 } as unknown as PrismaRoute;

  const createAggregate = (overrides: Partial<PrismaRoute & { driver?: Partial<Driver>; truck?: Partial<Truck>; company?: Partial<Company>; legalContract?: Partial<LegalContract> | null; contrabandJob?: Partial<ContrabandJob> | null }>) => {
    return new ActiveRouteAggregate({
      ...defaultRoute,
      company: defaultCompany,
      driver: defaultDriver,
      truck: defaultTruck,
      ...overrides,
    } as any);
  };

  describe('calculateTickDeductions', () => {
    describe('Ferry Transit Edge Cases', () => {
      it('should pause deductions when explicitly on a ferry transit', () => {
        const route = createAggregate({ isFerryTransit: true, progressPct: 0 });
        const result = route.calculateTickDeductions(100);
        expect(result).toEqual({ electricityNeeded: 0, dieselNeeded: 0, adblueNeeded: 0, co2Needed: 0, isCurrentlyFerry: true });
      });

      it('should pause deductions when progress is exactly 30.0%', () => {
        const route = createAggregate({ isFerryTransit: false, progressPct: 30.0 });
        const result = route.calculateTickDeductions(100);
        expect(result.isCurrentlyFerry).toBe(true);
        expect(result.dieselNeeded).toBe(0);
      });

      it('should pause deductions when progress is exactly 80.0%', () => {
        const route = createAggregate({ isFerryTransit: false, progressPct: 80.0 });
        const result = route.calculateTickDeductions(100);
        expect(result.isCurrentlyFerry).toBe(true);
        expect(result.dieselNeeded).toBe(0);
      });

      it('should NOT pause deductions when progress is just below 30.0% (e.g., 29.9%)', () => {
        const route = createAggregate({ isFerryTransit: false, progressPct: 29.9 });
        const result = route.calculateTickDeductions(100);
        expect(result.isCurrentlyFerry).toBe(false);
        expect(result.dieselNeeded).toBeGreaterThan(0);
      });

      it('should NOT pause deductions when progress is just above 80.0% (e.g., 80.1%)', () => {
        const route = createAggregate({ isFerryTransit: false, progressPct: 80.1 });
        const result = route.calculateTickDeductions(100);
        expect(result.isCurrentlyFerry).toBe(false);
        expect(result.dieselNeeded).toBeGreaterThan(0);
      });

      it('should pause deductions when progress is mid-ferry (e.g., 50.0%)', () => {
        const route = createAggregate({ isFerryTransit: false, progressPct: 50.0 });
        const result = route.calculateTickDeductions(100);
        expect(result.isCurrentlyFerry).toBe(true);
        expect(result.dieselNeeded).toBe(0);
      });
    });

    describe('Fuel Calculation and Modifiers', () => {
      it('should calculate EV deductions correctly', () => {
        const route = createAggregate({ truck: { model: 'Tesla EV Truck' } });
        const result = route.calculateTickDeductions(100);

        // expected: 100 * 1.5 * 1.0 * 1.0 = 150
        expect(result.isCurrentlyFerry).toBe(false);
        expect(result.electricityNeeded).toBe(150);
        expect(result.dieselNeeded).toBe(0);
      });

      it('should calculate Diesel deductions correctly', () => {
        const route = createAggregate({ truck: { model: 'Standard Truck' } });
        const result = route.calculateTickDeductions(100);

        // expected diesel: 100 * 0.35 * 1.0 * 1.0 = 35
        // expected adblue: 100 * 0.03 * 1.0 * 1.0 = 3
        // expected co2: 35 * 0.00268 = 0.0938
        expect(result.isCurrentlyFerry).toBe(false);
        expect(result.electricityNeeded).toBe(0);
        expect(result.dieselNeeded).toBeCloseTo(35);
        expect(result.adblueNeeded).toBeCloseTo(3);
        expect(result.co2Needed).toBeCloseTo(0.0938);
      });

      it('should apply aerodynamics buff from company', () => {
        // aerodynamicsBuff = 1.0 - (5 * 0.04) = 0.8
        const route = createAggregate({ company: { resAerodynamics: 5 } });
        const result = route.calculateTickDeductions(100);

        // 100 * 0.35 * 0.8 = 28
        expect(result.dieselNeeded).toBeCloseTo(28);
      });

      it('should apply legal contract weight factor (STEEL_COILS = 1.5)', () => {
        const route = createAggregate({ legalContract: { cargoType: 'STEEL_COILS' } });
        const result = route.calculateTickDeductions(100);

        // 100 * 0.35 * 1.5 = 52.5
        expect(result.dieselNeeded).toBeCloseTo(52.5);
      });

      it('should apply contraband job weight factor (CLASS_C = 1.4)', () => {
        const route = createAggregate({ contrabandJob: { cargoClass: 'CLASS_C' } });
        const result = route.calculateTickDeductions(100);

        // 100 * 0.35 * 1.4 = 49.0
        expect(result.dieselNeeded).toBeCloseTo(49.0);
      });

      it('should apply driver and truck modifiers (LEAD_FOOT = 1.1, CHASSIS_CAVITY = 1.1)', () => {
        const route = createAggregate({
          driver: { trait: 'LEAD_FOOT' },
          truck: { model: 'Truck', fuelTankMod: 'CHASSIS_CAVITY' }
        });
        const result = route.calculateTickDeductions(100);

        // 100 * 0.35 * (1.0 * 1.1 * 1.1) = 0.35 * 1.21 * 100 = 42.35
        expect(result.dieselNeeded).toBeCloseTo(42.35);
      });
    });
  });
});
