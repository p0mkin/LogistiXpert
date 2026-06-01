import { PrismaClient } from '@prisma/client';
import { AnalyticsService } from './analytics.service';

const prisma = new PrismaClient();

export interface CheckpointDefinition {
  name: string;
  alertLevel: number; // 1 to 10
  scannerType: 'VISUAL' | 'XRAY' | 'K9';
  hasK9: boolean;
}

export class BorderService {
  /**
   * Automatically re-binds a truck to owned garages upon delivery arrivals
   */
  public static async handleTerminalRebinding(
    tx: any,
    truckId: string,
    companyId: string,
    destinationCity: string,
    previousGarageId: string
  ): Promise<string> {
    // 1. Find if there is an owned garage in the destinationCity.
    const destGarage = await tx.garage.findFirst({
      where: { companyId, city: destinationCity },
    });

    if (!destGarage) {
      return `Destination terminal in ${destinationCity} is not owned. Truck remains bound to previous terminal.`;
    }

    if (destGarage.id === previousGarageId) {
      return `Truck is already bound to terminal in destination city ${destinationCity}.`;
    }

    // 2. Count trucks currently assigned to it
    const assignedTrucksCount = await tx.truck.count({
      where: { garageId: destGarage.id },
    });

    if (assignedTrucksCount >= destGarage.capacity) {
      return `Destination terminal in ${destinationCity} is full (capacity ${destGarage.capacity}/${destGarage.capacity}). Truck remains bound to previous terminal.`;
    }

    // 3. Update truck's garageId to destGarage.id
    await tx.truck.update({
      where: { id: truckId },
      data: { garageId: destGarage.id },
    });

    return `Truck successfully re-bound to owned destination terminal in ${destinationCity}.`;
  }

  /**
   * Main mathematical risk and clearance engine
   */
  static async calculateClearance(
    truckId: string,
    checkpoint: CheckpointDefinition
  ): Promise<{
    cleared: boolean;
    roll: number;
    detectionProbability: number;
    penalties?: {
      bustedContraband: boolean;
      fineAmount: number;
      reputationLoss: number;
      policeHeatIncrease: number;
      impoundDays: number;
    };
  }> {
    // 1. Load the truck and active route state
    const truck = await prisma.truck.findUnique({
      where: { id: truckId },
      include: { company: true, activeRoute: { include: { contrabandJob: true } } },
    });

    if (!truck) {
      throw new Error('TRUCK_NOT_FOUND');
    }

    const route = truck.activeRoute;
    const job = route?.contrabandJob;

    // If there is no contraband on the route, they clear automatically with 0 risk.
    if (!job) {
      return { cleared: true, roll: 0, detectionProbability: 0 };
    }

    // 2. Extract truck modifications
    const mod = truck.fuelTankMod; // STOCK, FALSE_BOTTOM, CHASSIS_CAVITY
    const shielding = truck.scannerShielding; // 0 to 5 level

    // 3. Algorithm: Calculate Risk Probability
    // base_risk = checkpoint alert level * 10 (scale 10% - 100%)
    let baseRisk = checkpoint.alertLevel * 10;

    // Apply modifiers based on truck configuration
    let modReduction = 0;
    if (mod === 'FALSE_BOTTOM') {
      modReduction += 25; // 25% lower visual/volume profiles
    } else if (mod === 'CHASSIS_CAVITY') {
      modReduction += 15; // 15% lower profiles
    }

    // Lead-shielding blocks scans
    modReduction += shielding * 10; // up to 50% block

    // Contraband density modifier
    let contrabandRisk = job.riskMultiplier * 12; // up to 60% added risk

    // Checkpoint scanner details
    let scannerPenalty = 0;
    if (checkpoint.scannerType === 'XRAY' && shielding === 0) {
      scannerPenalty += 20; // Unshielded cargo in X-Ray zone
    }
    if (checkpoint.hasK9 && job.cargoClass === 'CLASS_B') {
      scannerPenalty += 25; // Dogs easily sniff out Class B drugs
    }

    // Combine probabilities, clamped between 5% and 95%
    let detectionProbability = baseRisk - modReduction + contrabandRisk + scannerPenalty;
    detectionProbability = Math.min(Math.max(detectionProbability, 5), 95);

    // 4. Roll the dice
    const roll = Math.random() * 100;
    const cleared = roll > detectionProbability;

    // 5. Build penalty pipeline on bust
    if (!cleared) {
      // Scale penalties by the contraband class
      let baseFine = 5000;
      let baseRepLoss = 20;
      let baseHeat = 15;
      let impoundDays = 3;

      if (job.cargoClass === 'CLASS_B') {
        baseFine = 15000;
        baseRepLoss = 50;
        baseHeat = 30;
        impoundDays = 7;
      } else if (job.cargoClass === 'CLASS_C') {
        baseFine = 50000;
        baseRepLoss = 150;
        baseHeat = 60;
        impoundDays = 14;
      }

      const fineAmount = baseFine * (1 + checkpoint.alertLevel * 0.1);

      return {
        cleared: false,
        roll,
        detectionProbability,
        penalties: {
          bustedContraband: true,
          fineAmount,
          reputationLoss: baseRepLoss,
          policeHeatIncrease: baseHeat,
          impoundDays,
        },
      };
    }

    return { cleared: true, roll, detectionProbability };
  }

  /**
   * Applies the penalties inside an ACID transaction
   */
  static async applyBustPenalties(
    truckId: string,
    penalties: {
      fineAmount: number;
      reputationLoss: number;
      policeHeatIncrease: number;
      impoundDays: number;
    }
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const truck = await tx.truck.findUnique({
        where: { id: truckId },
        include: { activeRoute: true, garage: true },
      });

      if (!truck || !truck.activeRoute) return;

      const companyId = truck.companyId;
      const releaseDate = new Date();
      releaseDate.setDate(releaseDate.getDate() + penalties.impoundDays);

      // 1. Charge fine (deduct legal balance, can go negative = bankrupt threat)
      // and update stats
      await tx.company.update({
        where: { id: companyId },
        data: {
          legalBalance: { decrement: penalties.fineAmount },
          reputationScore: { decrement: penalties.reputationLoss },
          policeHeat: { increment: penalties.policeHeatIncrease },
        },
      });

      // Record daily fine expense
      await AnalyticsService.recordTransaction(
        tx,
        companyId,
        truck.garageId,
        truck.garage.city,
        'EXPENSE_BRIBES_FINES',
        penalties.fineAmount
      );

      // 2. Impound truck
      await tx.truck.update({
        where: { id: truckId },
        data: {
          isImpounded: true,
          impoundReleaseAt: releaseDate,
        },
      });

      // 3. Clear active route (the job is canceled and cargo confiscated)
      await tx.activeRoute.delete({
        where: { id: truck.activeRoute.id },
      });

      // 4. Log vehicle history
      await tx.truckHistory.create({
        data: {
          truckId,
          eventType: 'BORDER_BUST',
          description: `Busted smuggling at border crossing. Vehicle impounded for ${penalties.impoundDays} days. Fine of $${penalties.fineAmount} charged. Heat increased by ${penalties.policeHeatIncrease}.`,
        },
      });
    });
  }

  /**
   * Processes successful clearance payouts
   */
  static async applyClearanceSuccess(truckId: string): Promise<{ payout: number }> {
    return await prisma.$transaction(async (tx) => {
      const truck = await tx.truck.findUnique({
        where: { id: truckId },
        include: { company: true, garage: true, activeRoute: { include: { contrabandJob: true, legalContract: true, clanContract: true } } },
      });

      if (!truck || !truck.activeRoute) {
        throw new Error('NO_ACTIVE_ROUTE');
      }

      const route = truck.activeRoute;
      let payout = 0;
      let payoutLog = '';

      const kgDelivered = AnalyticsService.getCargoWeight(truck.tier);
      await AnalyticsService.recordTransaction(
        tx,
        truck.companyId,
        truck.garageId,
        truck.garage.city,
        'ROUTE_COMPLETED',
        0,
        kgDelivered
      );

      if (route.contrabandJob) {
        // Smuggling Payout (goes to black market balance)
        payout = route.contrabandJob.payoutBlack.toNumber();
        await tx.company.update({
          where: { id: truck.companyId },
          data: {
            blackMarketBalance: { increment: payout },
            reputationScore: { increment: Math.floor(route.contrabandJob.riskMultiplier * 10) },
          },
        });
        payoutLog = `Successfully smuggled contraband to ${route.contrabandJob.destination}. Payout: $${payout} (Black Market Cash).`;

        await AnalyticsService.recordTransaction(
          tx,
          truck.companyId,
          truck.garageId,
          truck.garage.city,
          'REVENUE_BLACK',
          payout
        );
      } else if (route.legalContract) {
        // Legal Payout (goes to legal balance)
        payout = route.legalContract.payoutLegal.toNumber();
        // Apply R&D packing buff (+5% per level, up to +15% payout)
        if (truck.company.resAdvancedPacking > 0) {
          payout = payout * (1.0 + truck.company.resAdvancedPacking * 0.05);
        }
        await tx.company.update({
          where: { id: truck.companyId },
          data: {
            legalBalance: { increment: payout },
          },
        });
        payoutLog = `Delivered legal cargo to ${route.legalContract.destination}. Payout: $${payout.toFixed(2)} (Legal Cash).`;

        await AnalyticsService.recordTransaction(
          tx,
          truck.companyId,
          truck.garageId,
          truck.garage.city,
          'REVENUE_LEGAL',
          payout
        );
      } else if (route.clanContract) {
        // Clan Payout
        const payoutLegal = route.clanContract.payoutLegal.toNumber();
        const payoutBlack = route.clanContract.payoutBlack.toNumber();
        payout = payoutLegal + payoutBlack;
        await tx.company.update({
          where: { id: truck.companyId },
          data: {
            legalBalance: { increment: payoutLegal },
            blackMarketBalance: { increment: payoutBlack },
          },
        });
        payoutLog = `Delivered clan cargo to ${route.clanContract.destination}. Payout: $${payoutLegal} Legal, $${payoutBlack} Black.`;

        if (payoutLegal > 0) {
          await AnalyticsService.recordTransaction(
            tx,
            truck.companyId,
            truck.garageId,
            truck.garage.city,
            'REVENUE_LEGAL',
            payoutLegal
          );
        }
        if (payoutBlack > 0) {
          await AnalyticsService.recordTransaction(
            tx,
            truck.companyId,
            truck.garageId,
            truck.garage.city,
            'REVENUE_BLACK',
            payoutBlack
          );
        }
      }

      // Add mileage to truck & wear and tear
      const distance = route.legalContract?.distanceKm || route.clanContract?.distanceKm || 350; // default 350km if not found
      const newMileage = truck.mileage + distance;
      
      // Calculate wear based on mileage and chassis mods
      let wearPercent = Math.max(Math.floor(distance / 100), 2);
      if (truck.fuelTankMod === 'CHASSIS_CAVITY') {
        wearPercent = Math.floor(wearPercent * 1.3); // heavier chassis wears tires and engine faster
      }

      // Apply Starting HQ road wear modifiers
      let roadWearMod = 1.0;
      switch (truck.company.jurisdiction) {
        case 'SCANDINAVIA': roadWearMod = 0.60; break;
        case 'GERMANY': roadWearMod = 0.70; break;
        case 'BALTICS': roadWearMod = 1.00; break;
        case 'BELARUS': roadWearMod = 1.35; break;
      }
      wearPercent = Math.max(1, Math.round(wearPercent * roadWearMod));

      const newEngine = Math.max(truck.engineHealth - wearPercent, 0);
      const newTires = Math.max(truck.tireWear - wearPercent, 0);

      await tx.truck.update({
        where: { id: truckId },
        data: {
          mileage: newMileage,
          engineHealth: newEngine,
          tireWear: newTires,
        },
      });

      // Get destination city for terminal re-binding
      let destinationCity = '';
      if (route.contrabandJob) {
        destinationCity = route.contrabandJob.destination;
      } else if (route.legalContract) {
        destinationCity = route.legalContract.destination;
      } else if (route.clanContract) {
        destinationCity = route.clanContract.destination;
      }

      let rebindMsg = '';
      if (destinationCity) {
        rebindMsg = await BorderService.handleTerminalRebinding(
          tx,
          truckId,
          truck.companyId,
          destinationCity,
          truck.garageId
        );
      }

      // Clear active route
      await tx.activeRoute.delete({
        where: { id: route.id },
      });

      // Write truck history
      await tx.truckHistory.create({
        data: {
          truckId,
          eventType: 'JOB_DELIVERY',
          description: `${payoutLog} Driven ${distance} km. Engine wear: -${wearPercent}%, Tire wear: -${wearPercent}%. ${rebindMsg}`.trim(),
        },
      });

      return { payout };
    });
  }

  /**
   * Processes an interactive bribe attempt
   */
  static async applyBribeAttempt(
    truckId: string,
    bribeAmount: number
  ): Promise<{
    success: boolean;
    roll: number;
    chance: number;
    payout?: number;
    penalties?: any;
  }> {
    return await prisma.$transaction(async (tx) => {
      const truck = await tx.truck.findUnique({
        where: { id: truckId },
        include: { company: true, garage: true, activeRoute: { include: { driver: true, contrabandJob: true } } },
      });

      if (!truck || !truck.activeRoute || !truck.activeRoute.contrabandJob) {
        throw new Error('NO_ACTIVE_SMUGGLE_ROUTE');
      }

      const route = truck.activeRoute;
      const job = route.contrabandJob!;  // guarded above: !truck.activeRoute.contrabandJob
      const driver = route.driver!;      // driver is always present on an active route
      const company = truck.company;

      // Ensure company has enough clean cash to pay the bribe
      if (company.legalBalance.toNumber() < bribeAmount) {
        throw new Error('INSUFFICIENT_LEGAL_FUNDS');
      }

      // Calculate success chance:
      // Base: 20%
      // + bribe weight: up to 50%
      // + driver charisma: 1.5% per point (up to 30%)
      // - global police heat: 0.3% per point (up to -30%)
      const maxBribeScale = Math.max(1000, job.payoutBlack.toNumber() * 0.25);
      const bribeWeight = Math.min((bribeAmount / maxBribeScale) * 50, 50);
      const charismaWeight = driver.charisma * 1.5;
      const heatWeight = company.policeHeat * 0.3;

      let chance = 20 + bribeWeight + charismaWeight - heatWeight;
      if (driver.loyalty < 40) {
        chance -= 15;
      }
      chance = Math.min(Math.max(chance, 5), 90);

      const roll = Math.random() * 100;
      const success = roll <= chance;

      // Charge the bribe immediately
      await tx.company.update({
        where: { id: company.id },
        data: {
          legalBalance: { decrement: bribeAmount },
        },
      });

      // Record bribe expense
      await AnalyticsService.recordTransaction(
        tx,
        company.id,
        truck.garageId,
        truck.garage.city,
        'EXPENSE_BRIBES_FINES',
        bribeAmount
      );

      if (success) {
        const payout = job.payoutBlack.toNumber();
        await tx.company.update({
          where: { id: company.id },
          data: {
            blackMarketBalance: { increment: payout },
            reputationScore: { increment: Math.floor(job.riskMultiplier * 12) },
          },
        });

        // Record successful completion and payout revenue
        const kgDelivered = AnalyticsService.getCargoWeight(truck.tier);
        await AnalyticsService.recordTransaction(
          tx,
          company.id,
          truck.garageId,
          truck.garage.city,
          'ROUTE_COMPLETED',
          0,
          kgDelivered
        );

        await AnalyticsService.recordTransaction(
          tx,
          company.id,
          truck.garageId,
          truck.garage.city,
          'REVENUE_BLACK',
          payout
        );

        // RE-BINDING LOGIC!
        const rebindMsg = await BorderService.handleTerminalRebinding(
          tx,
          truckId,
          truck.companyId,
          job.destination,
          truck.garageId
        );

        // Clear active route
        await tx.activeRoute.delete({
          where: { id: route.id },
        });

        // Log history
        await tx.truckHistory.create({
          data: {
            truckId,
            eventType: 'BORDER_CLEAR',
            description: `Successfully bribed customs officer with $${bribeAmount}. Driver: ${driver.name}. Cargo delivered, payout: $${payout} BM. ${rebindMsg}`.trim(),
          },
        });

        return { success: true, roll, chance, payout };
      } else {
        // Bribe failed
        let baseFine = bribeAmount * 2;
        let baseRepLoss = 40;
        let baseHeat = 25;
        let impoundDays = 6;

        if (job.cargoClass === 'CLASS_B') {
          baseFine += 20000;
          baseRepLoss += 40;
          baseHeat += 20;
          impoundDays += 4;
        } else if (job.cargoClass === 'CLASS_C') {
          baseFine += 60000;
          baseRepLoss += 100;
          baseHeat += 40;
          impoundDays += 8;
        }

        const penalties = {
          bustedContraband: true,
          fineAmount: baseFine,
          reputationLoss: baseRepLoss,
          policeHeatIncrease: baseHeat,
          impoundDays,
        };

        const releaseDate = new Date();
        releaseDate.setDate(releaseDate.getDate() + penalties.impoundDays);

        // Deduct balance and update stats
        await tx.company.update({
          where: { id: company.id },
          data: {
            legalBalance: { decrement: penalties.fineAmount },
            reputationScore: { decrement: penalties.reputationLoss },
            policeHeat: { increment: penalties.policeHeatIncrease },
          },
        });

        // Record fail fine expense
        await AnalyticsService.recordTransaction(
          tx,
          company.id,
          truck.garageId,
          truck.garage.city,
          'EXPENSE_BRIBES_FINES',
          penalties.fineAmount
        );

        // Impound truck
        await tx.truck.update({
          where: { id: truckId },
          data: {
            isImpounded: true,
            impoundReleaseAt: releaseDate,
          },
        });

        // Clear active route
        await tx.activeRoute.delete({
          where: { id: route.id },
        });

        // Log history
        await tx.truckHistory.create({
          data: {
            truckId,
            eventType: 'BORDER_BUST',
            description: `Bribery failed! $${bribeAmount} lost. Officer called backup. Fine of $${penalties.fineAmount} charged. Vehicle impounded for ${penalties.impoundDays} days.`,
          },
        });

        return { success: false, roll, chance, penalties };
      }
    });
  }

  /**
   * Processes a breakthrough run attempt
   */
  static async applyBorderRun(
    truckId: string
  ): Promise<{
    success: boolean;
    roll: number;
    chance: number;
    damagePercent?: number;
    payout?: number;
    penalties?: any;
  }> {
    return await prisma.$transaction(async (tx) => {
      const truck = await tx.truck.findUnique({
        where: { id: truckId },
        include: { company: true, garage: true, activeRoute: { include: { driver: true, contrabandJob: true } } },
      });

      if (!truck || !truck.activeRoute || !truck.activeRoute.contrabandJob) {
        throw new Error('NO_ACTIVE_SMUGGLE_ROUTE');
      }

      const route = truck.activeRoute;
      const job = route.contrabandJob!;  // guarded above: !truck.activeRoute.contrabandJob
      const driver = route.driver!;      // driver is always present on an active route
      const company = truck.company;

      // Calculate success chance:
      // Base: 15%
      // + Engine: up to 30%
      // + Driver trait LEAD_FOOT: 25%
      // - Global heat: 0.4% per point
      let traitBonus = 0;
      if (driver.trait === 'LEAD_FOOT') {
        traitBonus += 25;
      }
      const engineBonus = (truck.engineHealth / 100) * 30;
      const heatPenalty = company.policeHeat * 0.4;

      let chance = 15 + engineBonus + traitBonus - heatPenalty;
      chance = Math.min(Math.max(chance, 5), 85);

      const roll = Math.random() * 100;
      const success = roll <= chance;

      if (success) {
        const payout = job.payoutBlack.toNumber();
        await tx.company.update({
          where: { id: company.id },
          data: {
            blackMarketBalance: { increment: payout },
            reputationScore: { increment: Math.floor(job.riskMultiplier * 15) },
            policeHeat: { increment: 30 }, // massive chase alert
          },
        });

        // Record successful run completion and payout revenue
        const kgDelivered = AnalyticsService.getCargoWeight(truck.tier);
        await AnalyticsService.recordTransaction(
          tx,
          company.id,
          truck.garageId,
          truck.garage.city,
          'ROUTE_COMPLETED',
          0,
          kgDelivered
        );

        await AnalyticsService.recordTransaction(
          tx,
          company.id,
          truck.garageId,
          truck.garage.city,
          'REVENUE_BLACK',
          payout
        );

        // RE-BINDING LOGIC!
        const rebindMsg = await BorderService.handleTerminalRebinding(
          tx,
          truckId,
          truck.companyId,
          job.destination,
          truck.garageId
        );

        // Add wear & tear from running the border barricades
        const newEngine = Math.max(truck.engineHealth - 15, 0);
        const newTires = Math.max(truck.tireWear - 20, 0);
        await tx.truck.update({
          where: { id: truckId },
          data: {
            engineHealth: newEngine,
            tireWear: newTires,
          },
        });

        // Clear active route
        await tx.activeRoute.delete({
          where: { id: route.id },
        });

        // Log history
        await tx.truckHistory.create({
          data: {
            truckId,
            eventType: 'BORDER_RUN_SUCCESS',
            description: `Broke through customs barricades! High speed chase ensued. Engine wear: -15%, Tire wear: -20%. Police Heat increased by +30. Cargo delivered, payout: $${payout} BM. ${rebindMsg}`.trim(),
          },
        });

        return { success: true, roll, chance, payout };
      } else {
        // Barricade crash
        const damagePercent = Math.floor(Math.random() * 30) + 50; // 50% - 80% damage
        const newEngine = Math.max(truck.engineHealth - damagePercent, 5);
        const newTires = Math.max(truck.tireWear - damagePercent, 5);

        // Update truck damage
        const releaseDate = new Date();
        const impoundDays = 12; // long impound
        releaseDate.setDate(releaseDate.getDate() + impoundDays);

        await tx.truck.update({
          where: { id: truckId },
          data: {
            engineHealth: newEngine,
            tireWear: newTires,
            isImpounded: true,
            impoundReleaseAt: releaseDate,
          },
        });

        const penalties = {
          bustedContraband: true,
          fineAmount: 40000, // heavy fine for breaching gate
          reputationLoss: 80,
          policeHeatIncrease: 40,
          impoundDays,
        };

        // Deduct balance and update stats
        await tx.company.update({
          where: { id: company.id },
          data: {
            legalBalance: { decrement: penalties.fineAmount },
            reputationScore: { decrement: penalties.reputationLoss },
            policeHeat: { increment: penalties.policeHeatIncrease },
          },
        });

        // Record crash fine expense
        await AnalyticsService.recordTransaction(
          tx,
          company.id,
          truck.garageId,
          truck.garage.city,
          'EXPENSE_BRIBES_FINES',
          penalties.fineAmount
        );

        // Clear active route
        await tx.activeRoute.delete({
          where: { id: route.id },
        });

        // Log history
        await tx.truckHistory.create({
          data: {
            truckId,
            eventType: 'BORDER_RUN_FAIL',
            description: `Gate run failed! Crashed into steel barricades. Engine & Tires took ${damagePercent}% structural damage. Fine of $${penalties.fineAmount} charged. Vehicle impounded for ${impoundDays} days.`,
          },
        });

        return { success: false, roll, chance, damagePercent, penalties };
      }
    });
  }
}
