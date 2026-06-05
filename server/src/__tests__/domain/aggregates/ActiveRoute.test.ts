import { ActiveRouteAggregate } from '../../../domain/aggregates/ActiveRoute';

describe('ActiveRouteAggregate', () => {
  // Factory function to create mock states easily
  const createMockState = (overrides: any = {}) => {
    return {
      id: 'test-route-id',
      isFerryTransit: false,
      progressPct: 0,
      truck: {
        model: 'Standard Diesel',
        fuelTankMod: 'STANDARD',
      },
      driver: {
        trait: 'NONE',
      },
      company: {
        resAerodynamics: 0,
      },
      ...overrides,
    };
  };

  describe('calculateTickDeductions()', () => {
    it('should calculate base deductions for a Diesel truck', () => {
      const state = createMockState();
      const route = new ActiveRouteAggregate(state as any);

      const distance = 10;
      const result = route.calculateTickDeductions(distance);

      expect(result.electricityNeeded).toBe(0);
      expect(result.dieselNeeded).toBeCloseTo(3.5); // 10 * 0.35
      expect(result.adblueNeeded).toBeCloseTo(0.3); // 10 * 0.03
      expect(result.co2Needed).toBeCloseTo(3.5 * 0.00268);
      expect(result.isCurrentlyFerry).toBe(false);
    });

    it('should calculate base deductions for an EV truck', () => {
      const state = createMockState({
        truck: { model: 'Tesla Semi EV', fuelTankMod: 'STANDARD' }
      });
      const route = new ActiveRouteAggregate(state as any);

      const distance = 10;
      const result = route.calculateTickDeductions(distance);

      expect(result.electricityNeeded).toBeCloseTo(15.0); // 10 * 1.5
      expect(result.dieselNeeded).toBe(0);
      expect(result.adblueNeeded).toBe(0);
      expect(result.co2Needed).toBe(0);
      expect(result.isCurrentlyFerry).toBe(false);
    });

    describe('Modifiers and Branch Logic', () => {
    it('should pause deductions on Ferry transit (isFerryTransit = true)', () => {
      const state = createMockState({ isFerryTransit: true });
      const route = new ActiveRouteAggregate(state as any);

      const result = route.calculateTickDeductions(10);
      expect(result).toEqual({ electricityNeeded: 0, dieselNeeded: 0, adblueNeeded: 0, co2Needed: 0, isCurrentlyFerry: true });
    });

    it('should pause deductions on Ferry transit via progress bounds (exact boundaries)', () => {
      // 30% bound
      let state = createMockState({ progressPct: 30.0 });
      let route = new ActiveRouteAggregate(state as any);
      let result = route.calculateTickDeductions(10);
      expect(result.isCurrentlyFerry).toBe(true);
      expect(result.dieselNeeded).toBe(0);

      // 80% bound
      state = createMockState({ progressPct: 80.0 });
      route = new ActiveRouteAggregate(state as any);
      result = route.calculateTickDeductions(10);
      expect(result.isCurrentlyFerry).toBe(true);

      // Outside bounds
      state = createMockState({ progressPct: 29.9 });
      route = new ActiveRouteAggregate(state as any);
      result = route.calculateTickDeductions(10);
      expect(result.isCurrentlyFerry).toBe(false);
      expect(result.dieselNeeded).toBeGreaterThan(0);

      state = createMockState({ progressPct: 80.1 });
      route = new ActiveRouteAggregate(state as any);
      result = route.calculateTickDeductions(10);
      expect(result.isCurrentlyFerry).toBe(false);
      expect(result.dieselNeeded).toBeGreaterThan(0);
    });

    it('should apply aerodynamics buff correctly', () => {
      // 1.0 - (resAerodynamics * 0.04) -> 1.0 - (10 * 0.04) = 0.6 modifier
      const state = createMockState({ company: { resAerodynamics: 10 } });
      const route = new ActiveRouteAggregate(state as any);

      const distance = 10;
      const result = route.calculateTickDeductions(distance);

      expect(result.dieselNeeded).toBeCloseTo(3.5 * 0.6);
    });

    it('should apply legal contract weight factor (e.g. STEEL_COILS = 1.5)', () => {
      const state = createMockState({ legalContract: { cargoType: 'STEEL_COILS' } });
      const route = new ActiveRouteAggregate(state as any);

      const distance = 10;
      const result = route.calculateTickDeductions(distance);

      expect(result.dieselNeeded).toBeCloseTo(3.5 * 1.5);
    });

    it('should apply contraband contract weight factor (e.g. CLASS_A = 0.9)', () => {
      const state = createMockState({ contrabandJob: { cargoClass: 'CLASS_A' } });
      const route = new ActiveRouteAggregate(state as any);

      const distance = 10;
      const result = route.calculateTickDeductions(distance);

      expect(result.dieselNeeded).toBeCloseTo(3.5 * 0.9);
    });

    it('should apply driver trait LEAD_FOOT factor (1.1)', () => {
      const state = createMockState({ driver: { trait: 'LEAD_FOOT' } });
      const route = new ActiveRouteAggregate(state as any);

      const distance = 10;
      const result = route.calculateTickDeductions(distance);

      expect(result.dieselNeeded).toBeCloseTo(3.5 * 1.1);
    });

    it('should apply truck mod CHASSIS_CAVITY factor (1.1)', () => {
      const state = createMockState({ truck: { model: 'Standard Diesel', fuelTankMod: 'CHASSIS_CAVITY' } });
      const route = new ActiveRouteAggregate(state as any);

      const distance = 10;
      const result = route.calculateTickDeductions(distance);

      expect(result.dieselNeeded).toBeCloseTo(3.5 * 1.1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero cargo weight / empty route correctly', () => {
      // Neither legalContract nor contrabandJob exists. Weight factor defaults to 1.0.
      const state = createMockState();
      const route = new ActiveRouteAggregate(state as any);

      const distance = 10;
      const result = route.calculateTickDeductions(distance);

      // Expected diesel is base (3.5) with no other modifiers
      expect(result.dieselNeeded).toBeCloseTo(3.5);
    });

    it('should calculate stacked modifiers correctly', () => {
      // Stack: LEAD_FOOT (1.1), CHASSIS_CAVITY (1.1), STEEL_COILS (1.5), and resAerodynamics of 5 (0.8 buff)
      // Modifiers should multiply: weight (1.5) * driver (1.1) * truck (1.1) = 1.815 total modifier
      // Aerodynamics: 1.0 - (5 * 0.04) = 0.8
      // Final calc for 10 distance: 10 * 0.35 * 1.815 * 0.8 = 5.082
      const state = createMockState({
        driver: { trait: 'LEAD_FOOT' },
        truck: { model: 'Standard Diesel', fuelTankMod: 'CHASSIS_CAVITY' },
        legalContract: { cargoType: 'STEEL_COILS' },
        company: { resAerodynamics: 5 },
      });
      const route = new ActiveRouteAggregate(state as any);

      const distance = 10;
      const result = route.calculateTickDeductions(distance);

      expect(result.dieselNeeded).toBeCloseTo(5.082);
    });

    it('should not allow values to go negative due to massive aerodynamics buff', () => {
      // If resAerodynamics >= 25, buff calculation: 1.0 - (25 * 0.04) = 0.0
      // Current implementation simply multiplies. We should ensure it doesn't give negative fuel,
      // but if the buff is > 25, the code would actually calculate a negative number if left unchecked.
      // E.g., resAerodynamics = 30 -> 1.0 - (30 * 0.04) = -0.2
      // Let's test how it currently behaves and expect it to not give negative fuel (it should bottom out at 0, although current logic might not check it, we will see).

      const state = createMockState({
        company: { resAerodynamics: 30 }
      });
      const route = new ActiveRouteAggregate(state as any);

      const distance = 10;
      const result = route.calculateTickDeductions(distance);

      // The current implementation in ActiveRoute.ts simply calculates: 1.0 - (30 * 0.04) = -0.2
      // So dieselNeeded will be negative. The prompt asks to ensure values don't go negative or behave unexpectedly.
      // If it currently does go negative, we will catch it here, and expect it to be 0 or handle it correctly.

      // Let's write the test to expect 0, which might fail if the implementation lacks a floor.
      expect(result.dieselNeeded).toBeGreaterThanOrEqual(0);
      expect(result.electricityNeeded).toBeGreaterThanOrEqual(0);
    });
  });
});
});
