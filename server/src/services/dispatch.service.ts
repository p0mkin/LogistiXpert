import { PrismaClient, RouteStage } from '@prisma/client';
import { GameWebSocketServer } from '../websocket';
import { BorderService } from './border.service';
import { ClanService } from './clan.service';

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
        clanContract: true,
      },
    });

    if (activeRoutes.length === 0) return;

    for (const route of activeRoutes) {
      try {
        const driver = route.driver;
        const truck = route.truck;
        const isSmuggling = route.contrabandJobId !== null;
        const isEV = truck.model.toLowerCase().includes('ev') || truck.model.toLowerCase().includes('electric');

        // Fetch company details
        const company = await prisma.company.findUnique({
          where: { id: route.companyId },
        });
        if (!company) continue;

        // Fetch garage details
        const garage = await prisma.garage.findUnique({
          where: { id: truck.garageId },
        });
        if (!garage) continue;

        // Apply starting HQ / Jurisdiction modifiers
        let roadWearMod = 1.0;
        let fatigueMod = 1.0;
        let bribeMod = 1.0;
        let loadingSpeedMod = 1.0;
        let qualityFineMod = 1.0;

        switch (company.jurisdiction) {
          case 'SCANDINAVIA':
            roadWearMod = 0.60;
            fatigueMod = 0.85; // fatigue rises 15% slower
            bribeMod = 1.50;
            break;
          case 'GERMANY':
            roadWearMod = 0.70;
            bribeMod = 1.30;
            loadingSpeedMod = 1.15; // 15% faster loading/unloading
            qualityFineMod = 2.00; // double risk of weigh tolls under 80% health
            break;
          case 'BALTICS':
            roadWearMod = 1.00;
            bribeMod = 1.00;
            break;
          case 'BELARUS':
            roadWearMod = 1.35;
            bribeMod = 0.50; // cheap bribes
            break;
        }

        // ======================================================================
        // STAGE 1: LOADING (PRE-DEPARTURE)
        // ======================================================================
        if (route.stage === 'LOADING') {
          let loadingSpeed = 20.0 * (1.0 + (garage.terminalLevel - 1) * 0.25) * (1.0 + company.resTerminalLogistics * 0.10) * loadingSpeedMod;
          if (isSmuggling) {
            loadingSpeed = 5.0; // contraband is slow/covert
          }

          const newProgress = Math.min(route.progressPct + loadingSpeed, 100.0);

          if (newProgress >= 100.0) {
            await prisma.activeRoute.update({
              where: { id: route.id },
              data: {
                progressPct: 0.0,
                stage: 'TRANSIT',
              },
            });

            GameWebSocketServer.sendToCompany(route.companyId, 'route:stage_update', {
              routeId: route.id,
              stage: 'TRANSIT',
              message: `LOADING COMPLETE: Truck ${truck.model} is loaded and has departed for ${route.legalContract?.destination || route.contrabandJob?.destination}!`,
            });
          } else {
            await prisma.activeRoute.update({
              where: { id: route.id },
              data: { progressPct: newProgress },
            });

            GameWebSocketServer.sendToCompany(route.companyId, 'route:progress', {
              routeId: route.id,
              truckId: truck.id,
              truckModel: truck.model,
              driverName: driver.name,
              progressPct: newProgress,
              stage: 'LOADING',
              message: `Loading cargo... ${newProgress.toFixed(1)}%`,
            });
          }
          continue; // skip other transit logic for this tick
        }

        // ======================================================================
        // STAGE 3: UNLOADING (POST-ARRIVAL)
        // ======================================================================
        if (route.stage === 'UNLOADING') {
          let unloadingSpeed = 20.0 * (1.0 + (garage.terminalLevel - 1) * 0.25) * (1.0 + company.resTerminalLogistics * 0.10) * loadingSpeedMod;
          if (isSmuggling) {
            unloadingSpeed = 5.0;
          }

          const newProgress = Math.min(route.progressPct + unloadingSpeed, 100.0);

          if (newProgress >= 100.0) {
            // Success! Complete route and distribute payout
            const payoutResult = await BorderService.applyClearanceSuccess(truck.id);

            // If it was a Clan contract, record the contribution
            if (route.clanContractId) {
              const contributionVolume = route.legalContract ? route.legalContract.distanceKm : 350.0;
              await ClanService.recordContribution(route.clanContractId, route.companyId, contributionVolume);
            }

            GameWebSocketServer.sendToCompany(route.companyId, 'route:completed', {
              truckId: truck.id,
              payout: payoutResult.payout,
              message: `UNLOADING COMPLETE: Cargo successfully delivered! $${payoutResult.payout.toFixed(2)} credited to balances.`,
            });
          } else {
            await prisma.activeRoute.update({
              where: { id: route.id },
              data: { progressPct: newProgress },
            });

            GameWebSocketServer.sendToCompany(route.companyId, 'route:progress', {
              routeId: route.id,
              truckId: truck.id,
              truckModel: truck.model,
              driverName: driver.name,
              progressPct: newProgress,
              stage: 'UNLOADING',
              message: `Unloading cargo... ${newProgress.toFixed(1)}%`,
            });
          }
          continue; // skip transit logic
        }

        // ======================================================================
        // STAGE 2: TRANSIT (ON THE ROAD / SEAS)
        // ======================================================================
        
        // Check if ferry route segment
        const ferryRoutes = [
          { o: 'Tallinn', d: 'Stockholm' }, { o: 'Stockholm', d: 'Tallinn' },
          { o: 'Helsinki', d: 'Tallinn' }, { o: 'Tallinn', d: 'Helsinki' },
          { o: 'Gdansk', d: 'Nynäshamn' }, { o: 'Nynäshamn', d: 'Gdansk' },
          { o: 'Riga', d: 'Stockholm' }, { o: 'Stockholm', d: 'Riga' }
        ];

        const origin = route.legalContract?.origin || route.contrabandJob?.origin || 'Riga';
        const destination = route.legalContract?.destination || route.contrabandJob?.destination || 'Warsaw';
        const isFerryRoute = ferryRoutes.some(fr => (fr.o.toLowerCase() === origin.toLowerCase() && fr.d.toLowerCase() === destination.toLowerCase()));

        // Segments between 30% and 80% are on water for ferry routes
        const isCurrentlyFerrySegment = isFerryRoute && (route.progressPct >= 30.0 && route.progressPct <= 80.0);

        let isFerryTransitStarted = false;
        if (isCurrentlyFerrySegment && !route.isFerryTransit) {
          isFerryTransitStarted = true;
        }

        // 1. Charge Ferry Ticket Fee ONCE upon entering the ferry
        if (isFerryTransitStarted) {
          let ticketFee = 1200;
          const t = truck.tier.toUpperCase();
          if (t.includes('VAN')) ticketFee = 500;
          else if (t.includes('ARTICULATED') || t.includes('SUPER_HEAVY')) ticketFee = 2500;

          await prisma.$transaction(async (tx) => {
            await tx.company.update({
              where: { id: route.companyId },
              data: { legalBalance: { decrement: ticketFee } },
            });
            await tx.truckHistory.create({
              data: {
                truckId: truck.id,
                eventType: 'FERRY_TICKET',
                description: `FERRY BOOKING: Booked ferry from ${origin} to ${destination}. Ticket cost: $${ticketFee} Clean Cash.`,
              },
            });
          });

          GameWebSocketServer.sendToCompany(route.companyId, 'dispatch:ferry_boarded', {
            routeId: route.id,
            ticketFee,
            message: `FERRY BOARDED: Paid $${ticketFee} ticket fee. Sailing from ${origin} to ${destination}...`,
          });
        }

        // 2. Compute fuel/elec/adblue/co2 needs
        let initialStep = 10.0;
        if (driver.trait === 'LEAD_FOOT') initialStep += 2.0;
        if (driver.isStimulated) initialStep += 3.5;

        const totalDistance = route.legalContract ? route.legalContract.distanceKm : 350.0;
        const distanceThisTick = (initialStep / 100.0) * totalDistance;

        // Apply R&D aerodynamics buff (-4% drag/consumption per level, up to -12%)
        const aerodynamicsBuff = 1.0 - (company.resAerodynamics * 0.04);

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
          electricityNeeded = distanceThisTick * 1.5 * totalModifier * aerodynamicsBuff;
        } else {
          dieselNeeded = distanceThisTick * 0.35 * totalModifier * aerodynamicsBuff;
          adblueNeeded = distanceThisTick * 0.03 * totalModifier * aerodynamicsBuff;
          co2Needed = dieselNeeded * 0.00268; // Tons
        }

        // PAUSE fuel deductions completely if crossing on a Ferry
        if (isCurrentlyFerrySegment) {
          electricityNeeded = 0;
          dieselNeeded = 0;
          adblueNeeded = 0;
          co2Needed = 0;
        }

        const hasEnoughFuel = (
          isEV ? (garage.electricityStorage >= electricityNeeded)
               : (garage.dieselStorage >= dieselNeeded && garage.adblueStorage >= adblueNeeded && garage.co2Allowances >= co2Needed)
        );

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
            message: `ALERT: Route paused! Home garage runs dry of required fuel or CO2 allowances.`,
          });
          continue;
        }

        // Deduct commodities inside transaction (if not on Ferry)
        if (!isCurrentlyFerrySegment && (electricityNeeded > 0 || dieselNeeded > 0)) {
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

          // Broadcast updated capacities
          GameWebSocketServer.sendToCompany(route.companyId, 'garage:stock_update', {
            garageId: truck.garageId,
            dieselStorage: Math.max(0, garage.dieselStorage - dieselNeeded),
            electricityStorage: Math.max(0, garage.electricityStorage - electricityNeeded),
            adblueStorage: Math.max(0, garage.adblueStorage - adblueNeeded),
            co2Allowances: Math.max(0, garage.co2Allowances - co2Needed),
          });
        }

        // 3. Digital Tachograph Checks & Fatigue
        const isSchengenPath = !(origin === 'Minsk' || origin === 'Brest' || destination === 'Minsk' || destination === 'Brest' || company.jurisdiction === 'BELARUS');

        if (isSchengenPath && driver.tachoHours > 10.0 && !isCurrentlyFerrySegment) {
          const weighStationTrap = Math.random() < (0.08 * qualityFineMod); // Germany scales trigger chance
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

        // 4. Fatigue Micro-Sleep Check
        if (driver.fatigue > 80 && !isCurrentlyFerrySegment) {
          const wreckRoll = Math.random() < 0.03;
          if (wreckRoll) {
            const dmgEngine = 40;
            const dmgTires = 30;

            await prisma.$transaction(async (tx) => {
              await tx.truck.update({
                where: { id: truck.id },
                data: {
                  engineHealth: Math.max(truck.engineHealth - dmgEngine, 0),
                  tireWear: Math.max(truck.tireWear - dmgTires, 0),
                },
              });
              await tx.activeRoute.delete({ where: { id: route.id } });
              await tx.truckHistory.create({
                data: {
                  truckId: truck.id,
                  eventType: 'ACCIDENT_WRECK',
                  description: `CRASH REPORT: Driver ${driver.name} fell asleep at the wheel (Fatigue: ${driver.fatigue}%). Route aborted.`,
                },
              });
            });

            GameWebSocketServer.sendToCompany(route.companyId, 'alert:driver_wreck', {
              truckId: truck.id,
              driverName: driver.name,
              message: `FATAL WRECK: Driver ${driver.name} crashed due to extreme fatigue! Route aborted.`,
            });
            continue;
          }
        }

        // 5. Driver snitch checking (smuggling only)
        if (isSmuggling && driver.loyalty < 30 && driver.fatigue > 60 && driver.trait !== 'LOYAL' && !isCurrentlyFerrySegment) {
          const snitch_roll = Math.random();
          const snitch_threshold = ((30 - driver.loyalty) / 100) * 0.04;
          if (snitch_roll < snitch_threshold) {
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
                  description: `TRAITOR ALERT: Driver ${driver.name} snitched on contraband cargo.`,
                },
              });
            });

            GameWebSocketServer.sendToCompany(route.companyId, 'alert:driver_snitched', {
              truckId: truck.id,
              driverName: driver.name,
              message: `BETRAYAL: ${driver.name} snitched and called police! Route busted.`,
            });
            continue;
          }
        }

        // 6. Engine breakdowns
        if (truck.engineHealth < 15 && !isCurrentlyFerrySegment) {
          const breakdown_roll = Math.random();
          const breakdown_threshold = ((15 - truck.engineHealth) / 15) * 0.05;
          if (breakdown_roll < breakdown_threshold) {
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
                  description: `BREAKDOWN: Engine failure near ${route.currentCity}.`,
                },
              });
            });

            GameWebSocketServer.sendToCompany(route.companyId, 'alert:engine_breakdown', {
              truckId: truck.id,
              message: `ENGINE FAILURE: ${truck.model} broke down near ${route.currentCity}.`,
            });
            continue;
          }
        }

        // 6.5. Weather Transitions (Only on land)
        let currentWeather = route.currentWeather;
        if (!isCurrentlyFerrySegment) {
          if (currentWeather === 'CLEAR') {
            // 5% chance of weather hazard transition
            if (Math.random() < 0.05) {
              const newWeather = Math.random() < 0.6 ? 'THICK_FOG' : 'ICE_STORM';
              currentWeather = newWeather;
              await prisma.activeRoute.update({
                where: { id: route.id },
                data: { currentWeather: newWeather },
              });
              GameWebSocketServer.sendToCompany(route.companyId, 'dispatch:weather_update', {
                routeId: route.id,
                weather: newWeather,
                message: `WEATHER HAZARD ALERT: Route from ${origin} to ${destination} is hit by sudden ${newWeather === 'THICK_FOG' ? 'Thick Fog' : 'Ice Storm'}!`,
              });
            }
          } else {
            // 20% chance of clearing
            if (Math.random() < 0.20) {
              const oldWeather = currentWeather;
              currentWeather = 'CLEAR';
              await prisma.activeRoute.update({
                where: { id: route.id },
                data: { currentWeather: 'CLEAR' },
              });
              GameWebSocketServer.sendToCompany(route.companyId, 'dispatch:weather_update', {
                routeId: route.id,
                weather: 'CLEAR',
                message: `WEATHER REPORT: The ${oldWeather === 'THICK_FOG' ? 'Thick Fog' : 'Ice Storm'} has cleared. Skies are bright and clear again!`,
              });
            }
          }
        }

        // 7. Progress Increment calculations
        let progressStep = 10.0;
        if (driver.trait === 'LEAD_FOOT') progressStep += 2.0;
        if (driver.isStimulated) progressStep += 3.5;

        // Apply Weather Hazard & Autopilot Policies on Speed & Cosmetic Wear
        let cosmeticDamage = 0;
        let routeStatusMessage = '';

        if (currentWeather === 'THICK_FOG') {
          if (route.autopilotPolicy === 'SAFE') {
            // Safe driver pulls over completely
            progressStep = 0.0;
            routeStatusMessage = 'FOG DELAY: Safe autopilot pulled over to wait out thick fog.';
          } else if (route.autopilotPolicy === 'AVERAGE') {
            // average driver rolls loyalty + charisma skill check
            const skillScore = (driver.charisma * 5 + driver.loyalty) / 2;
            const roll = Math.random() * 100;
            if (roll < skillScore) {
              progressStep *= 0.6; // slightly slower
              routeStatusMessage = `FOG NAVIGATED: Skill check succeeded (${roll.toFixed(1)} < ${skillScore.toFixed(1)}). Average autopilot driving moderately in fog.`;
            } else {
              progressStep *= 0.15; // crawl
              routeStatusMessage = `FOG STRUGGLE: Skill check failed (${roll.toFixed(1)} >= ${skillScore.toFixed(1)}). Average autopilot forced to crawl.`;
            }
          } else if (route.autopilotPolicy === 'GREEDY') {
            // speeds through fog, normal progress or +10%
            progressStep *= 1.1;
            routeStatusMessage = 'FOG SPEEDING: Greedy autopilot speeds through thick fog, risking crash!';
            // 15% accident risk
            if (Math.random() < 0.15) {
              const dmgEngine = 25;
              const dmgTires = 20;
              const dmgCosmetic = 30;

              await prisma.$transaction(async (tx) => {
                await tx.truck.update({
                  where: { id: truck.id },
                  data: {
                    engineHealth: Math.max(truck.engineHealth - dmgEngine, 1),
                    tireWear: Math.max(truck.tireWear - dmgTires, 1),
                    cosmeticHealth: Math.max(truck.cosmeticHealth - dmgCosmetic, 0),
                  },
                });
                await tx.activeRoute.delete({ where: { id: route.id } });
                await tx.truckHistory.create({
                  data: {
                    truckId: truck.id,
                    eventType: 'ACCIDENT_WRECK',
                    description: `FOG ACCIDENT: Greedy driver crashed in thick fog. Engine: -${dmgEngine}%, Tires: -${dmgTires}%, Cosmetic: -${dmgCosmetic}%. Route aborted.`,
                  },
                });
              });

              GameWebSocketServer.sendToCompany(route.companyId, 'alert:driver_wreck', {
                truckId: truck.id,
                driverName: driver.name,
                message: `CRASH IN FOG: Driver ${driver.name} crashed in thick fog under Greedy autopilot! Route aborted.`,
              });
              continue; // Skip rest of simulation tick
            }
          }
        } else if (currentWeather === 'ICE_STORM') {
          if (route.autopilotPolicy === 'SAFE') {
            // Crawls cautious, 0 cosmetic wear
            progressStep *= 0.25;
            routeStatusMessage = 'ICE STORM: Safe autopilot crawls cautiously. Cosmetic health preserved.';
          } else if (route.autopilotPolicy === 'AVERAGE') {
            const skillScore = (driver.charisma * 5 + driver.loyalty) / 2;
            const roll = Math.random() * 100;
            if (roll < skillScore) {
              progressStep *= 0.6;
              cosmeticDamage = 1;
              routeStatusMessage = `ICE STORM: Skill check succeeded (${roll.toFixed(1)} < ${skillScore.toFixed(1)}). Average autopilot driving moderately, minor cosmetic wear.`;
            } else {
              progressStep *= 0.3;
              cosmeticDamage = 2;
              routeStatusMessage = `ICE STORM: Skill check failed (${roll.toFixed(1)} >= ${skillScore.toFixed(1)}). Average autopilot crawling, normal cosmetic wear.`;
            }
          } else if (route.autopilotPolicy === 'GREEDY') {
            // normal speed, high cosmetic wear
            cosmeticDamage = 4;
            routeStatusMessage = 'ICE STORM SPEEDING: Greedy autopilot speeds on black ice! High cosmetic wear.';
            // 5% slide off road
            if (Math.random() < 0.05) {
              progressStep = 0.0;
              const dmgEngine = 15;
              const dmgTires = 15;

              await prisma.$transaction(async (tx) => {
                await tx.truck.update({
                  where: { id: truck.id },
                  data: {
                    engineHealth: Math.max(truck.engineHealth - dmgEngine, 1),
                    tireWear: Math.max(truck.tireWear - dmgTires, 1),
                  },
                });
                await tx.truckHistory.create({
                  data: {
                    truckId: truck.id,
                    eventType: 'SLID_OFF_ROAD',
                    description: `ICE SLIDE: Greedy driver slid off icy road. Engine: -15%, Tires: -15%. Route delayed.`,
                  },
                });
              });

              GameWebSocketServer.sendToCompany(route.companyId, 'alert:ice_slide', {
                truckId: truck.id,
                message: `ICE SLIDE: Truck ${truck.model} slid off icy road! Physical wear sustained, route delayed.`,
              });
            }
          }
        }

        // Apply cosmetic damage if any
        if (cosmeticDamage > 0) {
          await prisma.truck.update({
            where: { id: truck.id },
            data: { cosmeticHealth: Math.max(0, truck.cosmeticHealth - cosmeticDamage) },
          });
        }

        const newProgress = Math.min(route.progressPct + progressStep, 100.0);

        // Fatigue and Tachograph updates
        let fatigueIncrement = 2;
        if (driver.tachoHours > 10.0 && isSchengenPath) {
          fatigueIncrement = 6;
        }
        if (driver.isStimulated) {
          fatigueIncrement = 1;
        }

        // Apply starting HQ fatigue modifier
        fatigueIncrement = Math.max(1, Math.round(fatigueIncrement * fatigueMod));

        // If crossing on Ferry, fatigue cools down (-6% per tick) and tacho resets back to 0.0
        let newFatigue = Math.min(driver.fatigue + fatigueIncrement, 100);
        let newTacho = driver.tachoHours + 0.3;

        if (currentWeather === 'THICK_FOG' && route.autopilotPolicy === 'SAFE') {
          newFatigue = Math.max(0, driver.fatigue - 2);
          newTacho = driver.tachoHours; // resting, no tacho increase
        }

        if (isCurrentlyFerrySegment) {
          newFatigue = Math.max(0, driver.fatigue - 6);
          newTacho = 0.0; // tacho cools down back to 0.0
        }

        // Border crossing check (smuggling only)
        const crossedBorderThreshold = route.progressPct < 50.0 && newProgress >= 50.0;

        if (isSmuggling && crossedBorderThreshold && !isCurrentlyFerrySegment) {
          const checkpoint = {
            name: 'Brest Border Terminal',
            alertLevel: 4, // 1 to 10 severity
            scannerType: 'XRAY' as const,
            hasK9: true,
          };

          if (route.autopilotPolicy === 'SAFE') {
            // SAFE submits to scanning automatically!
            const result = await BorderService.calculateClearance(truck.id, checkpoint);
            if (result.cleared) {
              const successResult = await BorderService.applyClearanceSuccess(truck.id);
              GameWebSocketServer.sendToCompany(route.companyId, 'border:cleared', {
                truckId: truck.id,
                roll: result.roll,
                probability: result.detectionProbability,
                payout: successResult.payout,
                message: `AUTOPILOT CLEARANCE: Safe driver submitted to customs scanning and successfully cleared! Delivery completed. Payout: $${successResult.payout.toFixed(2)}BM.`,
              });
              GameWebSocketServer.sendToCompany(route.companyId, 'dispatch:autopilot_resolution', {
                routeId: route.id,
                policy: 'SAFE',
                action: 'CLEARANCE',
                success: true,
                message: `Safe Autopilot submitted to border scanning and successfully cleared!`,
              });
            } else {
              const penalties = result.penalties!;
              await BorderService.applyBustPenalties(truck.id, penalties);
              GameWebSocketServer.sendToCompany(route.companyId, 'border:bust', {
                truckId: truck.id,
                roll: result.roll,
                probability: result.detectionProbability,
                penalties,
                message: `AUTOPILOT BUST: Safe driver submitted to customs scanning but was busted! Vehicle impounded and fined.`,
              });
              GameWebSocketServer.sendToCompany(route.companyId, 'dispatch:autopilot_resolution', {
                routeId: route.id,
                policy: 'SAFE',
                action: 'CLEARANCE',
                success: false,
                message: `Safe Autopilot was busted during mandatory border scanning scan!`,
              });
            }
            continue; // skip rest of tick (route completed/deleted)

          } else if (route.autopilotPolicy === 'AVERAGE') {
            // Pays 15% bribe of black market payout if legal balance is sufficient
            const bribeAmount = Math.floor((route.contrabandJob?.payoutBlack?.toNumber() ?? 0) * 0.15);
            const legalBalance = Number(company.legalBalance);

            if (legalBalance >= bribeAmount) {
              const result = await BorderService.applyBribeAttempt(truck.id, bribeAmount);
              if (result.success) {
                GameWebSocketServer.sendToCompany(route.companyId, 'border:bribe_success', {
                  truckId: truck.id,
                  bribeAmount,
                  roll: result.roll,
                  chance: result.chance,
                  payout: result.payout,
                  message: `AUTOPILOT BRIBE: Average driver successfully bribed officer with $${bribeAmount}. Cargo delivered! Payout: $${result.payout} BM.`,
                });
                GameWebSocketServer.sendToCompany(route.companyId, 'dispatch:autopilot_resolution', {
                  routeId: route.id,
                  policy: 'AVERAGE',
                  action: 'BRIBE',
                  success: true,
                  message: `Average Autopilot paid $${bribeAmount} bribe and successfully cleared!`,
                });
              } else {
                const penalties = result.penalties!;
                GameWebSocketServer.sendToCompany(route.companyId, 'border:bribe_fail', {
                  truckId: truck.id,
                  bribeAmount,
                  roll: result.roll,
                  chance: result.chance,
                  penalties,
                  message: `AUTOPILOT BRIBE FAIL: Average driver tried to bribe officer with $${bribeAmount} but failed! Officer pocketed bribe and impounded truck.`,
                });
                GameWebSocketServer.sendToCompany(route.companyId, 'dispatch:autopilot_resolution', {
                  routeId: route.id,
                  policy: 'AVERAGE',
                  action: 'BRIBE',
                  success: false,
                  message: `Average Autopilot bribery check failed! Truck was impounded.`,
                });
              }
            } else {
              // Fallback to safe scanning!
              const result = await BorderService.calculateClearance(truck.id, checkpoint);
              if (result.cleared) {
                const successResult = await BorderService.applyClearanceSuccess(truck.id);
                GameWebSocketServer.sendToCompany(route.companyId, 'border:cleared', {
                  truckId: truck.id,
                  roll: result.roll,
                  probability: result.detectionProbability,
                  payout: successResult.payout,
                  message: `AUTOPILOT CLEARANCE: Average driver had insufficient clean cash for bribe ($${bribeAmount}), submitted to scanning instead, and cleared!`,
                });
                GameWebSocketServer.sendToCompany(route.companyId, 'dispatch:autopilot_resolution', {
                  routeId: route.id,
                  policy: 'AVERAGE',
                  action: 'CLEARANCE_FALLBACK',
                  success: true,
                  message: `Average Autopilot lacked bribe funds. Scanned and cleared!`,
                });
              } else {
                const penalties = result.penalties!;
                await BorderService.applyBustPenalties(truck.id, penalties);
                GameWebSocketServer.sendToCompany(route.companyId, 'border:bust', {
                  truckId: truck.id,
                  roll: result.roll,
                  probability: result.detectionProbability,
                  penalties,
                  message: `AUTOPILOT BUST: Average driver had insufficient clean cash for bribe ($${bribeAmount}), scanned instead, and was busted!`,
                });
                GameWebSocketServer.sendToCompany(route.companyId, 'dispatch:autopilot_resolution', {
                  routeId: route.id,
                  policy: 'AVERAGE',
                  action: 'CLEARANCE_FALLBACK',
                  success: false,
                  message: `Average Autopilot lacked bribe funds. Scanned and busted!`,
                });
              }
            }
            continue; // route resolved

          } else if (route.autopilotPolicy === 'GREEDY') {
            // Run gate automatically!
            const result = await BorderService.applyBorderRun(truck.id);
            if (result.success) {
              GameWebSocketServer.sendToCompany(route.companyId, 'border:run_success', {
                truckId: truck.id,
                roll: result.roll,
                chance: result.chance,
                payout: result.payout,
                message: `AUTOPILOT BORDER RUN: Greedy driver successfully broke through customs gates! Payout: $${result.payout} BM.`,
              });
              GameWebSocketServer.sendToCompany(route.companyId, 'dispatch:autopilot_resolution', {
                routeId: route.id,
                policy: 'GREEDY',
                action: 'BORDER_RUN',
                success: true,
                message: `Greedy Autopilot ran the customs crossing barricades successfully!`,
              });
            } else {
              const penalties = result.penalties!;
              GameWebSocketServer.sendToCompany(route.companyId, 'border:run_fail', {
                truckId: truck.id,
                roll: result.roll,
                chance: result.chance,
                damagePercent: result.damagePercent,
                penalties,
                message: `AUTOPILOT RUN FAIL: Greedy driver crashed into customs steel barricades and was busted!`,
              });
              GameWebSocketServer.sendToCompany(route.companyId, 'dispatch:autopilot_resolution', {
                routeId: route.id,
                policy: 'GREEDY',
                action: 'BORDER_RUN',
                success: false,
                message: `Greedy Autopilot gate-run attempt failed with steel crash!`,
              });
            }
            continue; // route resolved
          }
        }

        // Transition to UNLOADING stage upon reaching destination (100% transit)
        if (newProgress >= 100.0) {
          await prisma.activeRoute.update({
            where: { id: route.id },
            data: {
              progressPct: 0.0,
              stage: 'UNLOADING',
              isFerryTransit: false,
            },
          });

          GameWebSocketServer.sendToCompany(route.companyId, 'route:stage_update', {
            routeId: route.id,
            stage: 'UNLOADING',
            message: `ARRIVED: Truck ${truck.model} has arrived at destination city ${destination} and has begun unloading cargo!`,
          });
        } else {
          // Standard progress updates
          await prisma.$transaction(async (tx) => {
            await tx.activeRoute.update({
              where: { id: route.id },
              data: {
                progressPct: newProgress,
                isFerryTransit: isCurrentlyFerrySegment,
              },
            });
            await tx.driver.update({
              where: { id: driver.id },
              data: { fatigue: newFatigue, tachoHours: newTacho },
            });
          });

          let displayMsg = isCurrentlyFerrySegment ? `Sailing on ferry crossing... ${newProgress.toFixed(1)}%` : `Driving... ${newProgress.toFixed(1)}%`;
          if (routeStatusMessage) {
            displayMsg = `${routeStatusMessage} ${displayMsg}`;
          }

          GameWebSocketServer.sendToCompany(route.companyId, 'route:progress', {
            routeId: route.id,
            progressPct: newProgress,
            stage: 'TRANSIT',
            driverFatigue: newFatigue,
            driverTachoHours: parseFloat(newTacho.toFixed(1)),
            isFerryTransit: isCurrentlyFerrySegment,
            currentWeather,
            cosmeticHealth: Math.max(0, truck.cosmeticHealth - cosmeticDamage),
            message: displayMsg,
          });
        }

      } catch (err) {
        console.error(`[Simulator] Failed to process route listing ${route.id}:`, err);
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
