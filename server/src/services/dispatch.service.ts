import { PrismaClient, RouteStage, Prisma } from '@prisma/client';
import { GameWebSocketServer } from '../websocket';
import { BorderService } from './border.service';
import { ClanService } from './clan.service';
import { PrismaUnitOfWork } from '../infrastructure/persistence/PrismaUnitOfWork';
import { GenericDomainEvent } from '../domain/events/DomainEvents';

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
    const uow = new PrismaUnitOfWork(prisma);

    // 1. Fetch active routes that are NOT paused under customs custom border inspects
    const activeRoutes = await uow.activeRouteRepository.getRoutesForSimulation();

    if (activeRoutes.length === 0) return;

    for (const route of activeRoutes) {
      try {
        await uow.run(async (txUow) => {
          // 1. Refetch the active route aggregate inside the transaction:
          const routeAgg = await txUow.activeRouteRepository.getById(route.id);
          if (!routeAgg) return;

          // 2. Fetch company and garage aggregates inside the transaction:
          const companyAgg = await txUow.companyRepository.getById(routeAgg.state.companyId);
          if (!companyAgg) return;

          const garageAgg = await txUow.garageRepository.getById(routeAgg.state.truck.garageId);
          if (!garageAgg) return;

          const driver = routeAgg.state.driver;
          const truck = routeAgg.state.truck;
          const isSmuggling = routeAgg.state.contrabandJobId !== null;
          const isEV = truck.model.toLowerCase().includes('ev') || truck.model.toLowerCase().includes('electric');

          // Apply starting HQ / Jurisdiction modifiers
          let roadWearMod = 1.0;
          let fatigueMod = 1.0;
          let bribeMod = 1.0;
          let loadingSpeedMod = 1.0;
          let qualityFineMod = 1.0;

          switch (companyAgg.state.jurisdiction) {
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
          if (routeAgg.state.stage === 'LOADING') {
            let loadingSpeed = 20.0 * (1.0 + (garageAgg.state.terminalLevel - 1) * 0.25) * (1.0 + companyAgg.state.resTerminalLogistics * 0.10) * loadingSpeedMod;
            if (isSmuggling) {
              loadingSpeed = 5.0; // contraband is slow/covert
            }

            const newProgress = Math.min(routeAgg.state.progressPct + loadingSpeed, 100.0);

            if (newProgress >= 100.0) {
              routeAgg.state.progressPct = 0.0;
              routeAgg.state.stage = 'TRANSIT';
              await txUow.activeRouteRepository.save(routeAgg);

              txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'route:stage_update', {
                routeId: routeAgg.id,
                stage: 'TRANSIT',
                message: `LOADING COMPLETE: Truck ${truck.model} is loaded and has departed for ${routeAgg.state.legalContract?.destination || routeAgg.state.contrabandJob?.destination}!`,
              }));
            } else {
              routeAgg.state.progressPct = newProgress;
              await txUow.activeRouteRepository.save(routeAgg);

              txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'route:progress', {
                routeId: routeAgg.id,
                truckId: truck.id,
                truckModel: truck.model,
                driverName: driver.name,
                progressPct: newProgress,
                stage: 'LOADING',
                message: `Loading cargo... ${newProgress.toFixed(1)}%`,
              }));
            }
            return; // skip transit logic for this tick
          }

          // ======================================================================
          // STAGE 3: UNLOADING (POST-ARRIVAL)
          // ======================================================================
          if (routeAgg.state.stage === 'UNLOADING') {
            let unloadingSpeed = 20.0 * (1.0 + (garageAgg.state.terminalLevel - 1) * 0.25) * (1.0 + companyAgg.state.resTerminalLogistics * 0.10) * loadingSpeedMod;
            if (isSmuggling) {
              unloadingSpeed = 5.0;
            }

            const newProgress = Math.min(routeAgg.state.progressPct + unloadingSpeed, 100.0);

            if (newProgress >= 100.0) {
              // Success! Complete route and distribute payout
              const payoutResult = await BorderService.applyClearanceSuccess(truck.id, txUow.rawClient);

              // If it was a Clan contract, record the contribution
              if (routeAgg.state.clanContractId) {
                const contributionVolume = routeAgg.state.legalContract ? routeAgg.state.legalContract.distanceKm : 350.0;
                await ClanService.recordContribution(routeAgg.state.clanContractId, routeAgg.state.companyId, contributionVolume, txUow.rawClient);
              }

              txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'route:completed', {
                truckId: truck.id,
                payout: payoutResult.payout,
                message: `UNLOADING COMPLETE: Cargo successfully delivered! $${payoutResult.payout.toFixed(2)} credited to balances.`,
              }));
            } else {
              routeAgg.state.progressPct = newProgress;
              await txUow.activeRouteRepository.save(routeAgg);

              txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'route:progress', {
                routeId: routeAgg.id,
                truckId: truck.id,
                truckModel: truck.model,
                driverName: driver.name,
                progressPct: newProgress,
                stage: 'UNLOADING',
                message: `Unloading cargo... ${newProgress.toFixed(1)}%`,
              }));
            }
            return; // skip transit logic
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

          const origin = routeAgg.state.legalContract?.origin || routeAgg.state.contrabandJob?.origin || 'Riga';
          const destination = routeAgg.state.legalContract?.destination || routeAgg.state.contrabandJob?.destination || 'Warsaw';
          const isFerryRoute = ferryRoutes.some(fr => (fr.o.toLowerCase() === origin.toLowerCase() && fr.d.toLowerCase() === destination.toLowerCase()));

          // Segments between 30% and 80% are on water for ferry routes
          const isCurrentlyFerrySegment = isFerryRoute && (routeAgg.state.progressPct >= 30.0 && routeAgg.state.progressPct <= 80.0);

          let isFerryTransitStarted = false;
          if (isCurrentlyFerrySegment && !routeAgg.state.isFerryTransit) {
            isFerryTransitStarted = true;
          }

          // 1. Charge Ferry Ticket Fee ONCE upon entering the ferry
          if (isFerryTransitStarted) {
            let ticketFee = 1200;
            const t = truck.tier.toUpperCase();
            if (t.includes('VAN')) ticketFee = 500;
            else if (t.includes('ARTICULATED') || t.includes('SUPER_HEAVY')) ticketFee = 2500;

            await txUow.rawClient.company.update({
              where: { id: routeAgg.state.companyId },
              data: { legalBalance: { decrement: ticketFee } },
            });
            await txUow.rawClient.truckHistory.create({
              data: {
                truckId: truck.id,
                eventType: 'FERRY_TICKET',
                description: `FERRY BOOKING: Booked ferry from ${origin} to ${destination}. Ticket cost: $${ticketFee} Clean Cash.`,
              },
            });

            txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'dispatch:ferry_boarded', {
              routeId: routeAgg.id,
              ticketFee,
              message: `FERRY BOARDED: Paid $${ticketFee} ticket fee. Sailing from ${origin} to ${destination}...`,
            }));
          }

          // 2. Compute fuel/elec/adblue/co2 needs
          let totalDistance = 350.0;
          if (routeAgg.state.legalContract) {
            totalDistance = routeAgg.state.legalContract.distanceKm;
          } else if (routeAgg.state.clanContract) {
            totalDistance = routeAgg.state.clanContract.distanceKm;
          } else if (routeAgg.state.contrabandJob) {
            totalDistance = 350.0;
          }

          let truck_speed_kmh = 80.0;
          if (driver.trait === 'LEAD_FOOT') truck_speed_kmh *= 1.15;
          if (driver.isStimulated) truck_speed_kmh *= 1.20;

          const tick_distance = 0.6 * truck_speed_kmh;
          const distanceThisTick = tick_distance;

          const deductions = routeAgg.calculateTickDeductions(distanceThisTick);

          // Deduct commodities inside transaction (if not on Ferry)
          if (!isCurrentlyFerrySegment) {
            garageAgg.consumeCommodities({
              diesel: deductions.dieselNeeded > 0 ? deductions.dieselNeeded : undefined,
              electricity: deductions.electricityNeeded > 0 ? deductions.electricityNeeded : undefined,
              adblue: deductions.adblueNeeded > 0 ? deductions.adblueNeeded : undefined,
              co2: deductions.co2Needed > 0 ? deductions.co2Needed : undefined,
            });

            await txUow.garageRepository.save(garageAgg);

            // Broadcast updated capacities post-commit
            txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'garage:stock_update', {
              garageId: truck.garageId,
              dieselStorage: Math.max(0, garageAgg.state.dieselStorage),
              electricityStorage: Math.max(0, garageAgg.state.electricityStorage),
              adblueStorage: Math.max(0, garageAgg.state.adblueStorage),
              co2Allowances: Math.max(0, garageAgg.state.co2Allowances),
            }));
          }

          if (routeAgg.state.isPaused) {
            routeAgg.state.isPaused = false;
          }

          // 3. Digital Tachograph Checks & Fatigue
          const isSchengenPath = !(origin === 'Minsk' || origin === 'Brest' || destination === 'Minsk' || destination === 'Brest' || companyAgg.state.jurisdiction === 'BELARUS');

          if (isSchengenPath && driver.tachoHours > 10.0 && !isCurrentlyFerrySegment) {
            const weighStationTrap = Math.random() < (0.08 * qualityFineMod); // Germany scales trigger chance
            if (weighStationTrap) {
              const fine = 1000;
              const heat = 5;

              await txUow.rawClient.company.update({
                where: { id: routeAgg.state.companyId },
                data: {
                  legalBalance: { decrement: fine },
                  policeHeat: { increment: heat },
                },
              });
              await txUow.rawClient.truckHistory.create({
                data: {
                  truckId: truck.id,
                  eventType: 'TACHO_FINE',
                  description: `Flagged at weigh toll. Driver ${driver.name} exceeded Schengen 10h tacho limits. Fined $${fine} Clean Cash. Police Heat +${heat}.`,
                },
              });

              txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'alert:weigh_station_fine', {
                truckId: truck.id,
                driverName: driver.name,
                fine,
                message: `WARNING: Weigh station fine issued for Tachograph violations on Truck ${truck.model}!`,
              }));
            }
          }

          // 4. Fatigue Micro-Sleep Check
          if (driver.fatigue > 80 && !isCurrentlyFerrySegment) {
            const wreckRoll = Math.random() < 0.03;
            if (wreckRoll) {
              const dmgEngine = 40;
              const dmgTires = 30;

              truck.engineHealth = Math.max(truck.engineHealth - dmgEngine, 0);
              truck.tireWear = Math.max(truck.tireWear - dmgTires, 0);

              await txUow.rawClient.truck.update({
                where: { id: truck.id },
                data: {
                  engineHealth: truck.engineHealth,
                  tireWear: truck.tireWear,
                },
              });

              await txUow.activeRouteRepository.delete(routeAgg.id);

              await txUow.rawClient.truckHistory.create({
                data: {
                  truckId: truck.id,
                  eventType: 'ACCIDENT_WRECK',
                  description: `CRASH REPORT: Driver ${driver.name} fell asleep at the wheel (Fatigue: ${driver.fatigue}%). Route aborted.`,
                },
              });

              txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'alert:driver_wreck', {
                truckId: truck.id,
                driverName: driver.name,
                message: `FATAL WRECK: Driver ${driver.name} crashed due to extreme fatigue! Route aborted.`,
              }));
              return; // abort rest of simulation tick for this route
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

              await txUow.rawClient.company.update({
                where: { id: routeAgg.state.companyId },
                data: {
                  legalBalance: { decrement: bustFine },
                  reputationScore: { decrement: bustRep },
                  policeHeat: { increment: bustHeat },
                },
              });

              await txUow.rawClient.truck.update({
                where: { id: truck.id },
                data: {
                  isImpounded: true,
                  impoundReleaseAt: releaseDate,
                },
              });

              await txUow.activeRouteRepository.delete(routeAgg.id);

              await txUow.rawClient.truckHistory.create({
                data: {
                  truckId: truck.id,
                  eventType: 'DRIVER_SNITCH',
                  description: `TRAITOR ALERT: Driver ${driver.name} snitched on contraband cargo.`,
                },
              });

              txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'alert:driver_snitched', {
                truckId: truck.id,
                driverName: driver.name,
                message: `BETRAYAL: ${driver.name} snitched and called police! Route busted.`,
              }));
              return; // abort route
            }
          }

          // 6. Engine breakdowns
          if (truck.engineHealth < 15 && !isCurrentlyFerrySegment) {
            const breakdown_roll = Math.random();
            const breakdown_threshold = ((15 - truck.engineHealth) / 15) * 0.05;
            if (breakdown_roll < breakdown_threshold) {
              const newEngineHealth = Math.max(truck.engineHealth - 20, 1);

              await txUow.rawClient.truck.update({
                where: { id: truck.id },
                data: { engineHealth: newEngineHealth },
              });

              await txUow.activeRouteRepository.delete(routeAgg.id);

              await txUow.rawClient.truckHistory.create({
                data: {
                  truckId: truck.id,
                  eventType: 'ENGINE_BREAKDOWN',
                  description: `BREAKDOWN: Engine failure near ${routeAgg.state.currentCity}.`,
                },
              });

              txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'alert:engine_breakdown', {
                truckId: truck.id,
                message: `ENGINE FAILURE: ${truck.model} broke down near ${routeAgg.state.currentCity}.`,
              }));
              return; // abort route
            }
          }

          // 6.5. Weather Transitions (Only on land)
          let currentWeather = routeAgg.state.currentWeather;
          if (!isCurrentlyFerrySegment) {
            if (currentWeather === 'CLEAR') {
              // 5% chance of weather hazard transition
              if (Math.random() < 0.05) {
                const newWeather = Math.random() < 0.6 ? 'THICK_FOG' : 'ICE_STORM';
                currentWeather = newWeather;
                routeAgg.state.currentWeather = newWeather;
                await txUow.activeRouteRepository.save(routeAgg);

                txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'dispatch:weather_update', {
                  routeId: routeAgg.id,
                  weather: newWeather,
                  message: `WEATHER HAZARD ALERT: Route from ${origin} to ${destination} is hit by sudden ${newWeather === 'THICK_FOG' ? 'Thick Fog' : 'Ice Storm'}!`,
                }));
              }
            } else {
              // 20% chance of clearing
              if (Math.random() < 0.20) {
                const oldWeather = currentWeather;
                currentWeather = 'CLEAR';
                routeAgg.state.currentWeather = 'CLEAR';
                await txUow.activeRouteRepository.save(routeAgg);

                txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'dispatch:weather_update', {
                  routeId: routeAgg.id,
                  weather: 'CLEAR',
                  message: `WEATHER REPORT: The ${oldWeather === 'THICK_FOG' ? 'Thick Fog' : 'Ice Storm'} has cleared. Skies are bright and clear again!`,
                }));
              }
            }
          }

          // 7. Progress Increment calculations
          let progressStep = Math.max(0.1, Math.min(100.0, (tick_distance / totalDistance) * 100.0));

          // Apply Weather Hazard & Autopilot Policies on Speed & Cosmetic Wear
          let cosmeticDamage = 0;
          let routeStatusMessage = '';

          if (currentWeather === 'THICK_FOG') {
            if (routeAgg.state.autopilotPolicy === 'SAFE') {
              // Safe driver pulls over completely
              progressStep = 0.0;
              routeStatusMessage = 'FOG DELAY: Safe autopilot pulled over to wait out thick fog.';
            } else if (routeAgg.state.autopilotPolicy === 'AVERAGE') {
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
            } else if (routeAgg.state.autopilotPolicy === 'GREEDY') {
              // speeds through fog, normal progress or +10%
              progressStep *= 1.1;
              routeStatusMessage = 'FOG SPEEDING: Greedy autopilot speeds through thick fog, risking crash!';
              // 15% accident risk
              if (Math.random() < 0.15) {
                const dmgEngine = 25;
                const dmgTires = 20;
                const dmgCosmetic = 30;

                await txUow.rawClient.truck.update({
                  where: { id: truck.id },
                  data: {
                    engineHealth: Math.max(truck.engineHealth - dmgEngine, 1),
                    tireWear: Math.max(truck.tireWear - dmgTires, 1),
                    cosmeticHealth: Math.max(truck.cosmeticHealth - dmgCosmetic, 0),
                  },
                });

                await txUow.activeRouteRepository.delete(routeAgg.id);

                await txUow.rawClient.truckHistory.create({
                  data: {
                    truckId: truck.id,
                    eventType: 'ACCIDENT_WRECK',
                    description: `FOG ACCIDENT: Greedy driver crashed in thick fog. Engine: -${dmgEngine}%, Tires: -${dmgTires}%, Cosmetic: -${dmgCosmetic}%. Route aborted.`,
                  },
                });

                txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'alert:driver_wreck', {
                  truckId: truck.id,
                  driverName: driver.name,
                  message: `CRASH IN FOG: Driver ${driver.name} crashed in thick fog under Greedy autopilot! Route aborted.`,
                }));
                return; // Skip rest of simulation tick
              }
            }
          } else if (currentWeather === 'ICE_STORM') {
            if (routeAgg.state.autopilotPolicy === 'SAFE') {
              // Crawls cautious, 0 cosmetic wear
              progressStep *= 0.25;
              routeStatusMessage = 'ICE STORM: Safe autopilot crawls cautiously. Cosmetic health preserved.';
            } else if (routeAgg.state.autopilotPolicy === 'AVERAGE') {
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
            } else if (routeAgg.state.autopilotPolicy === 'GREEDY') {
              // normal speed, high cosmetic wear
              cosmeticDamage = 4;
              routeStatusMessage = 'ICE STORM SPEEDING: Greedy autopilot speeds on black ice! High cosmetic wear.';
              // 5% slide off road
              if (Math.random() < 0.05) {
                progressStep = 0.0;
                const dmgEngine = 15;
                const dmgTires = 15;

                await txUow.rawClient.truck.update({
                  where: { id: truck.id },
                  data: {
                    engineHealth: Math.max(truck.engineHealth - dmgEngine, 1),
                    tireWear: Math.max(truck.tireWear - dmgTires, 1),
                  },
                });

                await txUow.rawClient.truckHistory.create({
                  data: {
                    truckId: truck.id,
                    eventType: 'SLID_OFF_ROAD',
                    description: `ICE SLIDE: Greedy driver slid off icy road. Engine: -15%, Tires: -15%. Route delayed.`,
                  },
                });

                txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'alert:ice_slide', {
                  truckId: truck.id,
                  message: `ICE SLIDE: Truck ${truck.model} slid off icy road! Physical wear sustained, route delayed.`,
                }));
              }
            }
          }

          // Apply cosmetic damage if any
          if (cosmeticDamage > 0) {
            truck.cosmeticHealth = Math.max(0, truck.cosmeticHealth - cosmeticDamage);
          }

          const newProgress = Math.min(routeAgg.state.progressPct + progressStep, 100.0);

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

          if (currentWeather === 'THICK_FOG' && routeAgg.state.autopilotPolicy === 'SAFE') {
            newFatigue = Math.max(0, driver.fatigue - 2);
            newTacho = driver.tachoHours; // resting, no tacho increase
          }

          if (isCurrentlyFerrySegment) {
            newFatigue = Math.max(0, driver.fatigue - 6);
            newTacho = 0.0; // tacho cools down back to 0.0
          }

          driver.fatigue = newFatigue;
          driver.tachoHours = newTacho;

          // Border crossing check (smuggling only)
          const crossedBorderThreshold = routeAgg.state.progressPct < 50.0 && newProgress >= 50.0;

          if (isSmuggling && crossedBorderThreshold && !isCurrentlyFerrySegment) {
            const checkpoint = {
              name: 'Brest Border Terminal',
              alertLevel: 4, // 1 to 10 severity
              scannerType: 'XRAY' as const,
              hasK9: true,
            };

            if (routeAgg.state.autopilotPolicy === 'SAFE') {
              // SAFE submits to scanning automatically!
              const result = await BorderService.calculateClearance(truck.id, checkpoint, txUow.rawClient);
              if (result.cleared) {
                const successResult = await BorderService.applyClearanceSuccess(truck.id, txUow.rawClient);
                txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'border:cleared', {
                  truckId: truck.id,
                  roll: result.roll,
                  probability: result.detectionProbability,
                  payout: successResult.payout,
                  message: `AUTOPILOT CLEARANCE: Safe driver submitted to customs scanning and successfully cleared! Delivery completed. Payout: $${successResult.payout.toFixed(2)}BM.`,
                }));
                txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'dispatch:autopilot_resolution', {
                  routeId: routeAgg.id,
                  policy: 'SAFE',
                  action: 'CLEARANCE',
                  success: true,
                  message: `Safe Autopilot submitted to border scanning and successfully cleared!`,
                }));
              } else {
                const penalties = result.penalties!;
                await BorderService.applyBustPenalties(truck.id, penalties, txUow.rawClient);
                txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'border:bust', {
                  truckId: truck.id,
                  roll: result.roll,
                  probability: result.detectionProbability,
                  penalties,
                  message: `AUTOPILOT BUST: Safe driver submitted to customs scanning but was busted! Vehicle impounded and fined.`,
                }));
                txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'dispatch:autopilot_resolution', {
                  routeId: routeAgg.id,
                  policy: 'SAFE',
                  action: 'CLEARANCE',
                  success: false,
                  message: `Safe Autopilot was busted during mandatory border scanning scan!`,
                }));
              }
              return; // route resolved

            } else if (routeAgg.state.autopilotPolicy === 'AVERAGE') {
              // Pays 15% bribe of black market payout if legal balance is sufficient
              const bribeAmount = Math.floor((routeAgg.state.contrabandJob?.payoutBlack?.toNumber() ?? 0) * 0.15);
              const legalBalance = Number(companyAgg.state.legalBalance);

              if (legalBalance >= bribeAmount) {
                const result = await BorderService.applyBribeAttempt(truck.id, bribeAmount, txUow.rawClient);
                if (result.success) {
                  txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'border:bribe_success', {
                    truckId: truck.id,
                    bribeAmount,
                    roll: result.roll,
                    chance: result.chance,
                    payout: result.payout,
                    message: `AUTOPILOT BRIBE: Average driver successfully bribed officer with $${bribeAmount}. Cargo delivered! Payout: $${result.payout} BM.`,
                  }));
                  txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'dispatch:autopilot_resolution', {
                    routeId: routeAgg.id,
                    policy: 'AVERAGE',
                    action: 'BRIBE',
                    success: true,
                    message: `Average Autopilot paid $${bribeAmount} bribe and successfully cleared!`,
                  }));
                } else {
                  const penalties = result.penalties!;
                  txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'border:bribe_fail', {
                    truckId: truck.id,
                    bribeAmount,
                    roll: result.roll,
                    chance: result.chance,
                    penalties,
                    message: `AUTOPILOT BRIBE FAIL: Average driver tried to bribe officer with $${bribeAmount} but failed! Officer pocketed bribe and impounded truck.`,
                  }));
                  txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'dispatch:autopilot_resolution', {
                    routeId: routeAgg.id,
                    policy: 'AVERAGE',
                    action: 'BRIBE',
                    success: false,
                    message: `Average Autopilot bribery check failed! Truck was impounded.`,
                  }));
                }
              } else {
                // Fallback to safe scanning!
                const result = await BorderService.calculateClearance(truck.id, checkpoint, txUow.rawClient);
                if (result.cleared) {
                  const successResult = await BorderService.applyClearanceSuccess(truck.id, txUow.rawClient);
                  txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'border:cleared', {
                    truckId: truck.id,
                    roll: result.roll,
                    probability: result.detectionProbability,
                    payout: successResult.payout,
                    message: `AUTOPILOT CLEARANCE: Average driver had insufficient clean cash for bribe ($${bribeAmount}), submitted to scanning instead, and cleared!`,
                  }));
                  txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'dispatch:autopilot_resolution', {
                    routeId: routeAgg.id,
                    policy: 'AVERAGE',
                    action: 'CLEARANCE_FALLBACK',
                    success: true,
                    message: `Average Autopilot lacked bribe funds. Scanned and cleared!`,
                  }));
                } else {
                  const penalties = result.penalties!;
                  await BorderService.applyBustPenalties(truck.id, penalties, txUow.rawClient);
                  txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'border:bust', {
                    truckId: truck.id,
                    roll: result.roll,
                    probability: result.detectionProbability,
                    penalties,
                    message: `AUTOPILOT BUST: Average driver had insufficient clean cash for bribe ($${bribeAmount}), scanned instead, and was busted!`,
                  }));
                  txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'dispatch:autopilot_resolution', {
                    routeId: routeAgg.id,
                    policy: 'AVERAGE',
                    action: 'CLEARANCE_FALLBACK',
                    success: false,
                    message: `Average Autopilot lacked bribe funds. Scanned and busted!`,
                  }));
                }
              }
              return; // route resolved

            } else if (routeAgg.state.autopilotPolicy === 'GREEDY') {
              // Run gate automatically!
              const result = await BorderService.applyBorderRun(truck.id, txUow.rawClient);
              if (result.success) {
                txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'border:run_success', {
                  truckId: truck.id,
                  roll: result.roll,
                  chance: result.chance,
                  payout: result.payout,
                  message: `AUTOPILOT BORDER RUN: Greedy driver successfully broke through customs gates! Payout: $${result.payout} BM.`,
                }));
                txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'dispatch:autopilot_resolution', {
                  routeId: routeAgg.id,
                  policy: 'GREEDY',
                  action: 'BORDER_RUN',
                  success: true,
                  message: `Greedy Autopilot ran the customs crossing barricades successfully!`,
                }));
              } else {
                const penalties = result.penalties!;
                txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'border:run_fail', {
                  truckId: truck.id,
                  roll: result.roll,
                  chance: result.chance,
                  damagePercent: result.damagePercent,
                  penalties,
                  message: `AUTOPILOT RUN FAIL: Greedy driver crashed into customs steel barricades and was busted!`,
                }));
                txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'dispatch:autopilot_resolution', {
                  routeId: routeAgg.id,
                  policy: 'GREEDY',
                  action: 'BORDER_RUN',
                  success: false,
                  message: `Greedy Autopilot gate-run attempt failed with steel crash!`,
                }));
              }
              return; // route resolved
            }
          }

          // Transition to UNLOADING stage upon reaching destination (100% transit)
          if (newProgress >= 100.0) {
            routeAgg.state.progressPct = 0.0;
            routeAgg.state.stage = 'UNLOADING';
            routeAgg.state.isFerryTransit = false;
            await txUow.activeRouteRepository.save(routeAgg);

            txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'route:stage_update', {
              routeId: routeAgg.id,
              stage: 'UNLOADING',
              message: `ARRIVED: Truck ${truck.model} has arrived at destination city ${destination} and has begun unloading cargo!`,
            }));
          } else {
            // Standard progress updates
            routeAgg.state.progressPct = newProgress;
            routeAgg.state.isFerryTransit = isCurrentlyFerrySegment;
            await txUow.activeRouteRepository.save(routeAgg);

            let displayMsg = isCurrentlyFerrySegment ? `Sailing on ferry crossing... ${newProgress.toFixed(1)}%` : `Driving... ${newProgress.toFixed(1)}%`;
            if (routeStatusMessage) {
              displayMsg = `${routeStatusMessage} ${displayMsg}`;
            }

            txUow.addDomainEvent(new GenericDomainEvent(routeAgg.state.companyId, 'route:progress', {
              routeId: routeAgg.id,
              progressPct: newProgress,
              stage: 'TRANSIT',
              driverFatigue: newFatigue,
              driverTachoHours: parseFloat(newTacho.toFixed(1)),
              isFerryTransit: isCurrentlyFerrySegment,
              currentWeather,
              cosmeticHealth: truck.cosmeticHealth,
              message: displayMsg,
            }));
          }
        });
      } catch (err: any) {
        if (err.message && err.message.includes('STORAGE_DEPLETED')) {
          try {
            await uow.run(async (pausedTxUow) => {
              const r = await pausedTxUow.activeRouteRepository.getById(route.id);
              if (r && !r.state.isPaused) {
                r.state.isPaused = true;
                await pausedTxUow.activeRouteRepository.save(r);

                pausedTxUow.addDomainEvent(new GenericDomainEvent(r.state.companyId, 'dispatch:no_fuel_alert', {
                  routeId: r.id,
                  truckId: r.state.truck.id,
                  truckModel: r.state.truck.model,
                  driverName: r.state.driver.name,
                  isEV: r.state.truck.model.toLowerCase().includes('ev') || r.state.truck.model.toLowerCase().includes('electric'),
                  message: `ALERT: Route paused! Home garage runs dry of required fuel or CO2 allowances.`,
                }));
              }
            });
          } catch (pauseErr) {
            console.error(`[Simulator] Failed to pause route ${route.id} after storage depletion:`, pauseErr);
          }
        } else {
          console.error(`[Simulator] Failed to process route listing ${route.id}:`, err);
        }
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
