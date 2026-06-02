import { Garage as PrismaGarage } from '@prisma/client';

export class GarageAggregate {
  constructor(public readonly state: PrismaGarage) {}

  public get id(): string { return this.state.id; }

  /**
   * Safely deducts diesel, electricity, or CO2 allowances, completely blocking negative balances
   */
  public consumeCommodities(deductions: {
    diesel?: number;
    electricity?: number;
    adblue?: number;
    co2?: number;
  }): void {
    if (deductions.diesel && this.state.dieselStorage < deductions.diesel) {
      throw new Error(`STORAGE_DEPLETED: Out of Diesel fuel in terminal ${this.state.city}.`);
    }
    if (deductions.electricity && this.state.electricityStorage < deductions.electricity) {
      throw new Error(`STORAGE_DEPLETED: Out of Electricity charge in terminal ${this.state.city}.`);
    }
    if (deductions.adblue && this.state.adblueStorage < deductions.adblue) {
      throw new Error(`STORAGE_DEPLETED: Out of AdBlue in terminal ${this.state.city}.`);
    }
    if (deductions.co2 && this.state.co2Allowances < deductions.co2) {
      throw new Error(`STORAGE_DEPLETED: Insufficient CO2 Allowances in terminal ${this.state.city}.`);
    }

    // Apply safe modifications
    if (deductions.diesel) this.state.dieselStorage -= deductions.diesel;
    if (deductions.electricity) this.state.electricityStorage -= deductions.electricity;
    if (deductions.adblue) this.state.adblueStorage -= deductions.adblue;
    if (deductions.co2) this.state.co2Allowances -= deductions.co2;
  }
}
