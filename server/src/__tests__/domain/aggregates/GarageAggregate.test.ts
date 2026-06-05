import { GarageAggregate } from '../../../domain/aggregates/Garage';
import { Garage as PrismaGarage } from '@prisma/client';

describe('GarageAggregate', () => {
  const createMockGarageState = (overrides?: Partial<PrismaGarage>): PrismaGarage => {
    return {
      id: 'test-garage-1',
      companyId: 'test-company-1',
      city: 'Berlin',
      capacity: 3,
      upgradeLevel: 1,
      hasStashRoom: false,
      dieselStorage: 1000,
      maxDiesel: 5000,
      electricityStorage: 1000,
      maxElectricity: 1000,
      adblueStorage: 1000,
      maxAdblue: 500,
      co2Allowances: 1000,
      terminalLevel: 1,
      contrabandStorageA: 0,
      contrabandStorageB: 0,
      contrabandStorageC: 0,
      maxContrabandStash: 100,
      createdAt: new Date(),
      ...overrides,
    };
  };

  describe('consumeCommodities', () => {
    it('successfully deducts commodities for valid amounts', () => {
      const state = createMockGarageState();
      const garage = new GarageAggregate(state);

      garage.consumeCommodities({
        diesel: 100,
        electricity: 200,
        adblue: 50,
        co2: 150,
      });

      expect(garage.state.dieselStorage).toBe(900);
      expect(garage.state.electricityStorage).toBe(800);
      expect(garage.state.adblueStorage).toBe(950);
      expect(garage.state.co2Allowances).toBe(850);
    });

    it('deducting to exactly zero succeeds', () => {
      const state = createMockGarageState({
        dieselStorage: 500,
        electricityStorage: 500,
      });
      const garage = new GarageAggregate(state);

      garage.consumeCommodities({
        diesel: 500,
        electricity: 500,
      });

      expect(garage.state.dieselStorage).toBe(0);
      expect(garage.state.electricityStorage).toBe(0);
    });

    it('passing empty object or zero values does not mutate state', () => {
      const state = createMockGarageState();
      const garage = new GarageAggregate(state);

      garage.consumeCommodities({});
      garage.consumeCommodities({
        diesel: 0,
        electricity: 0,
        adblue: 0,
        co2: 0,
      });

      expect(garage.state.dieselStorage).toBe(1000);
      expect(garage.state.electricityStorage).toBe(1000);
      expect(garage.state.adblueStorage).toBe(1000);
      expect(garage.state.co2Allowances).toBe(1000);
    });

    it('throws error when diesel storage is depleted', () => {
      const state = createMockGarageState({ dieselStorage: 50 });
      const garage = new GarageAggregate(state);

      expect(() => {
        garage.consumeCommodities({ diesel: 100 });
      }).toThrow(/STORAGE_DEPLETED: Out of Diesel fuel in terminal Berlin/);
    });

    it('throws error when electricity storage is depleted', () => {
      const state = createMockGarageState({ electricityStorage: 50 });
      const garage = new GarageAggregate(state);

      expect(() => {
        garage.consumeCommodities({ electricity: 100 });
      }).toThrow(/STORAGE_DEPLETED: Out of Electricity charge in terminal Berlin/);
    });

    it('throws error when adblue storage is depleted', () => {
      const state = createMockGarageState({ adblueStorage: 50 });
      const garage = new GarageAggregate(state);

      expect(() => {
        garage.consumeCommodities({ adblue: 100 });
      }).toThrow(/STORAGE_DEPLETED: Out of AdBlue in terminal Berlin/);
    });

    it('throws error when co2 allowances are insufficient', () => {
      const state = createMockGarageState({ co2Allowances: 50 });
      const garage = new GarageAggregate(state);

      expect(() => {
        garage.consumeCommodities({ co2: 100 });
      }).toThrow(/STORAGE_DEPLETED: Insufficient CO2 Allowances in terminal Berlin/);
    });

    it('fails atomically without mutating state if one commodity deduction fails', () => {
      const state = createMockGarageState({
        dieselStorage: 1000,
        adblueStorage: 50,
      });
      const garage = new GarageAggregate(state);

      // Attempt to deduct valid diesel but invalid adblue
      expect(() => {
        garage.consumeCommodities({
          diesel: 500, // This is valid
          adblue: 100, // This should fail
        });
      }).toThrow(/STORAGE_DEPLETED: Out of AdBlue in terminal Berlin/);

      // Verify NO state was mutated because it failed before applying modifications
      expect(garage.state.dieselStorage).toBe(1000);
      expect(garage.state.adblueStorage).toBe(50);
    });
  });
});
