import { ActiveRoute as PrismaRoute, Driver, Truck, Company, LegalContract, ContrabandJob, ClanContract } from '@prisma/client';

export class ActiveRouteAggregate {
  constructor(
    public readonly state: PrismaRoute & { 
      driver: Driver; 
      truck: Truck; 
      company: Company;
      legalContract?: LegalContract | null;
      contrabandJob?: ContrabandJob | null;
      clanContract?: ClanContract | null;
    }
  ) {}

  public get id(): string { return this.state.id; }
  public get isFerryTransit(): boolean { return this.state.isFerryTransit; }

  /**
   * Encapsulates transit and commodity mechanics during a simulation tick
   */
  public calculateTickDeductions(distanceThisTick: number): {
    electricityNeeded: number;
    dieselNeeded: number;
    adblueNeeded: number;
    co2Needed: number;
    isCurrentlyFerry: boolean;
  } {
    const isCurrentlyFerry = this.state.isFerryTransit || 
      (this.state.progressPct >= 30.0 && this.state.progressPct <= 80.0);

    // PAUSE fuel deductions completely if crossing on a Ferry
    if (isCurrentlyFerry) {
      return { electricityNeeded: 0, dieselNeeded: 0, adblueNeeded: 0, co2Needed: 0, isCurrentlyFerry: true };
    }

    const isEV = this.state.truck.model.toLowerCase().includes('ev') || 
                 this.state.truck.model.toLowerCase().includes('electric');

    const aerodynamicsBuff = Math.max(0, 1.0 - (this.state.company.resAerodynamics * 0.04));
    
    let weightFactor = 1.0;
    if (this.state.legalContract) {
      switch (this.state.legalContract.cargoType) {
        case 'STEEL_COILS': weightFactor = 1.5; break;
        case 'TIMBER': weightFactor = 1.3; break;
        case 'AGRICULTURAL_MACHINERY': weightFactor = 1.2; break;
        case 'DAIRY_PRODUCTS': weightFactor = 1.1; break;
        case 'PHARMACEUTICALS': weightFactor = 1.0; break;
        case 'ELECTRONICS': weightFactor = 0.9; break;
      }
    } else if (this.state.contrabandJob) {
      switch (this.state.contrabandJob.cargoClass) {
        case 'CLASS_C': weightFactor = 1.4; break;
        case 'CLASS_B': weightFactor = 1.1; break;
        case 'CLASS_A': weightFactor = 0.9; break;
      }
    }

    const driverFactor = this.state.driver.trait === 'LEAD_FOOT' ? 1.1 : 1.0;
    const truckFactor = this.state.truck.fuelTankMod === 'CHASSIS_CAVITY' ? 1.1 : 1.0;
    const totalModifier = weightFactor * driverFactor * truckFactor;

    let electricityNeeded = 0;
    let dieselNeeded = 0;
    let adblueNeeded = 0;
    let co2Needed = 0;

    if (isEV) {
      electricityNeeded = distanceThisTick * 1.5 * totalModifier * aerodynamicsBuff;
    } else {
      dieselNeeded = distanceThisTick * 0.35 * totalModifier * aerodynamicsBuff;
      adblueNeeded = distanceThisTick * 0.03 * totalModifier * aerodynamicsBuff;
      co2Needed = dieselNeeded * 0.00268; // CO2 Tons
    }

    return { electricityNeeded, dieselNeeded, adblueNeeded, co2Needed, isCurrentlyFerry: false };
  }
}
