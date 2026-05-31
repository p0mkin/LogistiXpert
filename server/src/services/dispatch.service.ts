import { PrismaClient } from '@prisma/client';
import { GameWebSocketServer } from '../websocket';
import { BorderService } from './border.service';

const prisma = new PrismaClient();

export class DispatchSimulationService {
  private static isRunning = false;
  private static intervalId: NodeJS.Timeout | null = null;
  
  // Real-world tick frequency (runs every 3 seconds)
  private static TICK_INTERVAL_MS = 3000;

  /**
   * Starts the main background simulation loop
   */
  static startTicker() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log(`[Simulator] Starting main active fleet routing ticker (Ticks every ${this.TICK_INTERVAL_MS / 1000}s)...`);
    
    this.intervalId = setInterval(async () => {
      try {
        await this.processSimulationTick();
      } catch (error) {
        console.error('[Simulator] Error processing routing simulation tick:', error);
      }
    }, this.TICK_INTERVAL_MS);
  }

  /**
   * Main simulation processing cycle
   */
  private static async processSimulationTick() {
    // 1. Fetch active routes that are NOT paused under customs custom border inspects
    const activeRoutes = await prisma.activeRoute.findMany({
      where: { isUnderBorderCheck: false },
      include: {
        driver: true,
        truck: true,
        legalContract: true,
        contrabandJob: true,
      },
    });

    if (activeRoutes.length === 0) return;

    for (const route of activeRoutes) {
      try {
        const driver = route.driver;
        const truck = route.truck;
        const isSmuggling = route.contrabandJobId !== null;

        // ==========================================
        // 0. FUEL & CO2 CONSUMPTION CHECK
        // ==========================================
        const isEV = truck.model.toLowerCase().includes('ev') || truck.model.toLowerCase().includes('electric');
        
        let initialStep = 10.0;
        if (driver.trait === 'LEAD_FOOT') initialStep += 2.0;
        if (driver.isStimulated) initialStep += 3.5;

        const totalDistance = route.legalContract ? route.legalContract.distanceKm : 350.0;
        const distanceThisTick = (initialStep / 100.0) * totalDistance;

        let weightFactor = 1.0;
        if (route.legalContract) {
          switch (route.legalContract.cargoType) {
            case 'STEEL_COILS': weightFactor = 1.5; break;
            case 'TIMBER': weightFactor = 1.3; break;
            case 'AGRICULTURAL_MACHINERY': weightFactor = 1.2; break;
            case 'DAIRY_PRODUCTS': weightFactor = 1.1; break;
            case 'PHARMACEUTICALS': weightFactor = 1.0; break;
            case 'ELECTRONICS': weightFactor = 0.9; break;
          }
        } else if (route.contrabandJob) {
          switch (route.contrabandJob.cargoClass) {
            case 'CLASS_C': weightFactor = 1.4; break;
            case 'CLASS_B': weightFactor = 1.1; break;
            case 'CLASS_A': weightFactor = 0.9; break;
          }
        }

        const driverFactor = driver.trait === 'LEAD_FOOT' ? 1.1 : 1.0;
        const truckFactor = truck.fuelTankMod === 'CHASSIS_CAVITY' ? 1.1 : 1.0;
        const totalModifier = weightFactor * driverFactor * truckFactor;

        let electricityNeeded = 0;
        let dieselNeeded = 0;
        let adblueNeeded = 0;
        let co2Needed = 0;

        if (isEV) {
          electricityNeeded = distanceThisTick * 1.5 * totalModifier;
        } else {
          dieselNeeded = distanceThisTick * 0.35 * totalModifier;
          adblueNeeded = distanceThisTick * 0.03 * totalModifier;
          co2Needed = dieselNeeded * 0.00268; // Tons
        }

        const garage = await prisma.garage.findUnique({
          where: { id: truck.garageId },
        });

        const hasEnoughFuel = garage ? (
          isEV ? (garage.electricityStorage >= electricityNeeded)
               : (garage.dieselStorage >= dieselNeeded && garage.adblueStorage >= adblueNeeded && garage.co2Allowances >= co2Needed)
        ) : false;

        if (!hasEnoughFuel) {
          if (!route.isPaused) {
            await prisma.activeRoute.update({
              where: { id: route.id },
              data: { isPaused: true },
            });
          }

          GameWebSocketServer.sendToCompany(route.companyId, 'dispatch:no_fuel_alert', {
            routeId: route.id,
            truckId: truck.id,
            truckModel: truck.model,
            driverName: driver.name,
            isEV,
            requiredDiesel: parseFloat(dieselNeeded.toFixed(2)),
            requiredAdblue: parseFloat(adblueNeeded.toFixed(2)),
            requiredCo2: parseFloat(co2Needed.toFixed(4)),
            requiredElectricity: parseFloat(electricityNeeded.toFixed(2)),
            currentDiesel: garage ? parseFloat(garage.dieselStorage.toFixed(2)) : 0,
            currentAdblue: garage ? parseFloat(garage.adblueStorage.toFixed(2)) : 0,
            currentCo2: garage ? parseFloat(garage.co2Allowances.toFixed(4)) : 0,
            currentElectricity: garage ? parseFloat(garage.electricityStorage.toFixed(2)) : 0,
            message: `ALERT: Route paused! Home garage runs dry of required fuel or CO2 allowances for Truck ${truck.model}. Stockpile refuel needed.`,
          });

          continue; // Skip progression ticks for this route
        }

        // Deduct commodities inside transaction
        await prisma.$transaction(async (tx) => {
          const garageUpdateData: any = {};
          if (isEV) {
            garageUpdateData.electricityStorage = { decrement: electricityNeeded };
          } else {
            garageUpdateData.dieselStorage = { decrement: dieselNeeded };
            garageUpdateData.adblueStorage = { decrement: adblueNeeded };
            garageUpdateData.co2Allowances = { decrement: co2Needed };
          }

          await tx.garage.update({
            where: { id: truck.garageId },
            data: garageUpdateData,
          });

          if (route.isPaused) {
            await tx.activeRoute.update({
              where: { id: route.id },
              data: { isPaused: false },
            });
          }
        });

        // Broadcast updated stockpile capacities
        if (garage) {
          GameWebSocketServer.sendToCompany(route.companyId, 'garage:stock_update', {
            garageId: truck.garageId,
            dieselStorage: isEV ? garage.dieselStorage : Math.max(garage.dieselStorage - dieselNeeded, 0),
            electricityStorage: isEV ? Math.max(garage.electricityStorage - electricityNeeded, 0) : garage.electricityStorage,
            adblueStorage: isEV ? garage.adblueStorage : Math.max(garage.adblueStorage - adblueNeeded, 0),
            co2Allowances: isEV ? garage.co2Allowances : Math.max(garage.co2Allowances - co2Needed, 0),
          });
        }

        // ==========================================
        // A. SYSTEM REGULATORY CHECKS
        // ==========================================
        
        // 1. Digital Tachograph check (developed Schengen weigh tolls)
        // If driving legal/illegal cargo inside Schengen zone and exceeds 10 hours limit:
        let isSchengenPath = true; // default
        if (route.currentCity === 'Minsk' || route.currentCity === 'Brest') {
          isSchengenPath = false; // Belarus has no weigh tacho rules
        }

        if (isSchengenPath && driver.tachoHours > 10.0) {
          // 8% chance per tick of getting flagged at a weigh station / toll
          const weighStationTrap = Math.random() < 0.08;
          if (weighStationTrap) {
            const fine = 1000;
            const heat = 5;
            
            await prisma.$transaction(async (tx) => {
              await tx.company.update({
                where: { id: route.companyId },
                data: {
                  legalBalance: { decrement: fine },
                  policeHeat: { increment: heat },
                },
              });
              await tx.truckHistory.create({
                data: {
                  truckId: truck.id,
                  eventType: 'TACHO_FINE',
                  description: `Flagged at weigh toll. Driver ${driver.name} exceeded Schengen 10h tacho limits. Fined $${fine} Clean Cash. Police Heat +${heat}.`,
                },
              });
            });

            GameWebSocketServer.sendToCompany(route.companyId, 'alert:weigh_station_fine', {
              truckId: truck.id,
              driverName: driver.name,
              fine,
              message: `WARNING: Weigh station fine issued for Tachograph violations on Truck ${truck.model}!`,
            });
          }
        }

        // 2. Fatigue Micro-Sleep Wreck Check
        // If fatigue exceeds 80%, there is a small chance they fall asleep at the wheel!
        if (driver.fatigue > 80) {
          const wreckRoll = Math.random() < 0.03; // 3% wreck chance per tick
          if (wreckRoll) {
            const dmgEngine = 40;
            const dmgTires = 30;

            await prisma.$transaction(async (tx) => {
              // Damage truck
              await tx.truck.update({
                where: { id: truck.id },
                data: {
                  engineHealth: Math.max(truck.engineHealth - dmgEngine, 0),
                  tireWear: Math.max(truck.tireWear - dmgTires, 0),
                },
              });

              // Cancel route completely (cargo lost/wrecked)
              await tx.activeRoute.delete({ where: { id: route.id } });

              // Log wreck history
              await tx.truckHistory.create({
                data: {
                  truckId: truck.id,
                  eventType: 'ACCIDENT_WRECK',
                  description: `CRASH REPORT: Driver ${driver.name} fell asleep at the wheel (Fatigue: ${driver.fatigue}%). Route aborted. Engine Damage: -${dmgEngine}%, Tire Damage: -${dmgTires}%.`,
                },
              });
            });

            GameWebSocketServer.sendToCompany(route.companyId, 'alert:driver_wreck', {
              truckId: truck.id,
              driverName: driver.name,
              message: `FATAL WRECK: Driver ${driver.name} crashed due to extreme fatigue! Route aborted.`,
            });
            continue; // Skip rest of progression for this route
          }
        }

        // ==========================================
        // B. DRIVER LOYALTY / SNITCH CHECK
        // ==========================================
        // A low-loyalty smuggling driver under high fatigue may phone police.
        // Only triggers on contraband routes. Never fires if driver is Loyal trait.
        if (isSmuggling && driver.loyalty < 30 && driver.fatigue > 60 && driver.trait !== 'LOYAL') {
          const snitch_roll = Math.random();
          const snitch_threshold = (30 - driver.loyalty) / 100 * 0.04; // max ~1.2% per tick
          if (snitch_roll < snitch_threshold) {
            // Driver snitched — instant bust, severe penalties
            const bustFine = 25000;
            const bustHeat = 50;
            const bustRep = 80;
            const impoundDays = 10;
            const releaseDate = new Date();
            releaseDate.setDate(releaseDate.getDate() + impoundDays);

            await prisma.$transaction(async (tx) => {
              await tx.company.update({
                where: { id: route.companyId },
                data: {
                  legalBalance: { decrement: bustFine },
                  reputationScore: { decrement: bustRep },
                  policeHeat: { increment: bustHeat },
                },
              });
              await tx.truck.update({
                where: { id: truck.id },
                data: {
                  isImpounded: true,
                  impoundReleaseAt: releaseDate,
                },
              });
              await tx.activeRoute.delete({ where: { id: route.id } });
              await tx.truckHistory.create({
                data: {
                  truckId: truck.id,
                  eventType: 'DRIVER_SNITCH',
                  description: `TRAITOR ALERT: Driver ${driver.name} (Loyalty: ${driver.loyalty}) tipped off authorities about contraband cargo. Route busted. Fine: $${bustFine}. Police Heat: +${bustHeat}. Truck impounded ${impoundDays} days.`,
                },
              });
            });

            GameWebSocketServer.sendToCompany(route.companyId, 'alert:driver_snitched', {
              truckId: truck.id,
              driverName: driver.name,
              driverLoyalty: driver.loyalty,
              bustFine,
              bustHeat,
              impoundDays,
              message: `BETRAYAL: ${driver.name} called the police. Your contraband is seized. Truck impounded for ${impoundDays} days.`,
            });
            console.log(`[Simulator] Driver ${driver.name} snitched on route ${route.id}. Auto-bust triggered.`);
            continue; // route is dead
          }
        }

        // ==========================================
        // C. ENGINE BREAKDOWN CHECK
        // ==========================================
        // Very low engine health causes random mid-route failures.
        if (truck.engineHealth < 15) {
          const breakdown_roll = Math.random();
          const breakdown_threshold = ((15 - truck.engineHealth) / 15) * 0.05; // up to 5% per tick
          if (breakdown_roll < breakdown_threshold) {
            // Engine dies — route aborted, truck needs roadside repair
            await prisma.$transaction(async (tx) => {
              await tx.truck.update({
                where: { id: truck.id },
                data: { engineHealth: Math.max(truck.engineHealth - 20, 1) },
              });
              await tx.activeRoute.delete({ where: { id: route.id } });
              await tx.truckHistory.create({
                data: {
                  truckId: truck.id,
                  eventType: 'ENGINE_BREAKDOWN',
                  description: `BREAKDOWN: Engine failure mid-route (${truck.model} at ${route.currentCity}). Truck stranded. Route aborted. Emergency roadside repair required.`,
                },
              });
            });

            GameWebSocketServer.sendToCompany(route.companyId, 'alert:engine_breakdown', {
              truckId: truck.id,
              model: truck.model,
              engineHealth: Math.max(truck.engineHealth - 20, 1),
              lastCity: route.currentCity,
              message: `ENGINE FAILURE: ${truck.model} broke down near ${route.currentCity}. Route aborted. Use Emergency Repair.`,
            });
            console.log(`[Simulator] Engine breakdown for truck ${truck.id} on route ${route.id}.`);
            continue;
          }
        }

        // ==========================================
        // D. ROUTE PROGRESSION CALCS
        // ==========================================
        
        // Base increment: 10% progress per tick (sped up for awesome gaming sandbox simulation)
        let progressStep = 10.0;
        
        // Driver traits and substance boost modifiers
        if (driver.trait === 'LEAD_FOOT') progressStep += 2.0;
        if (driver.isStimulated) progressStep += 3.5; // pills give a massive boost!

        const newProgress = Math.min(route.progressPct + progressStep, 100.0);

        // Update driver stats: fatigue accumulates, tacho logs driving hours
        let fatigueIncrement = 2; // base
        if (driver.tachoHours > 10.0 && isSchengenPath) {
          fatigueIncrement = 6; // fatigue rate triples past limits!
        }
        if (driver.isStimulated) {
          fatigueIncrement = 1; // pills suppress fatigue rate!
        }

        const newFatigue = Math.min(driver.fatigue + fatigueIncrement, 100);
        
        // tacho card logs: 0.3h per tick
        const tachoStep = 0.3;
        const newTacho = driver.tachoHours + tachoStep;

        // ==========================================
        // C. BORDER CHECKPOINT CHECKS (Smuggling Pause)
        // ==========================================
        const crossedBorderThreshold = route.progressPct < 50.0 && newProgress >= 50.0;
        
        if (isSmuggling && crossedBorderThreshold) {
          // Pause the route and trigger Customs Checkpoint event!
          await prisma.$transaction(async (tx) => {
            await tx.activeRoute.update({
              where: { id: route.id },
              data: {
                progressPct: 50.0, // hold right at border crossing gate
                isUnderBorderCheck: true,
                currentCity: 'Brest Customs Crossing',
              },
            });
            
            await tx.driver.update({
              where: { id: driver.id },
              data: {
                fatigue: newFatigue,
                tachoHours: newTacho,
              },
            });
          });

          // Dispatch WebSocket event to client alert dashboard
          GameWebSocketServer.sendToCompany(route.companyId, 'border:inspection_event', {
            routeId: route.id,
            truckId: truck.id,
            driverId: driver.id,
            origin: route.currentCity,
            contrabandClass: route.contrabandJob?.cargoClass,
            message: 'BORDER PATROL ALERT: Truck held at Brest custom crossing gates. Inspecting cargo...',
          });

          console.log(`[Simulator] Smuggling route ${route.id} paused at border crossing gate. Client alert dispatched.`);
          continue; // held at border, skip completion checks
        }

        // ==========================================
        // D. TRANSIT RESOLUTIONS
        // ==========================================
        if (newProgress >= 100.0) {
          // Success delivery! Trigger payout loops
          const payoutResult = await BorderService.applyClearanceSuccess(truck.id);
          
          GameWebSocketServer.sendToCompany(route.companyId, 'route:completed', {
            truckId: truck.id,
            payout: payoutResult.payout,
            message: 'Cargo successfully delivered. Fleet truck returned to garage slots!',
          });
          
          console.log(`[Simulator] Route ${route.id} reached 100%. Payout cleared successfully.`);
        } else {
          // Standard progress update
          await prisma.$transaction(async (tx) => {
            await tx.activeRoute.update({
              where: { id: route.id },
              data: {
                progressPct: newProgress,
              },
            });
            
            await tx.driver.update({
              where: { id: driver.id },
              data: {
                fatigue: newFatigue,
                tachoHours: newTacho,
              },
            });
          });

          // Broadcast live telemetry to Godot client every tick
          GameWebSocketServer.sendToCompany(route.companyId, 'route:progress', {
            routeId: route.id,
            truckId: truck.id,
            truckModel: truck.model,
            driverId: driver.id,
            driverName: driver.name,
            progressPct: newProgress,
            driverFatigue: newFatigue,
            driverTachoHours: parseFloat(newTacho.toFixed(1)),
            driverIsStimulated: driver.isStimulated,
            currentCity: route.currentCity,
            engineHealth: truck.engineHealth,
            tireWear: truck.tireWear,
          });
        }

      } catch (innerError) {
        console.error(`[Simulator] Failed to process route listing ${route.id}:`, innerError);
      }
    }
  }

  /**
   * Safely shuts down the background loop
   */
  static stopTicker() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[Simulator] Simulation ticker suspended.');
  }
}
