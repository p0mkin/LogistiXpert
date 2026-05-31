"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DispatchSimulationService = void 0;
const client_1 = require("@prisma/client");
const websocket_1 = require("../websocket");
const border_service_1 = require("./border.service");
const prisma = new client_1.PrismaClient();
class DispatchSimulationService {
    static isRunning = false;
    static intervalId = null;
    // Real-world tick frequency (runs every 3 seconds)
    static TICK_INTERVAL_MS = 3000;
    /**
     * Starts the main background simulation loop
     */
    static startTicker() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        console.log(`[Simulator] Starting main active fleet routing ticker (Ticks every ${this.TICK_INTERVAL_MS / 1000}s)...`);
        this.intervalId = setInterval(async () => {
            try {
                await this.processSimulationTick();
            }
            catch (error) {
                console.error('[Simulator] Error processing routing simulation tick:', error);
            }
        }, this.TICK_INTERVAL_MS);
    }
    /**
     * Main simulation processing cycle
     */
    static async processSimulationTick() {
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
        if (activeRoutes.length === 0)
            return;
        for (const route of activeRoutes) {
            try {
                const driver = route.driver;
                const truck = route.truck;
                const isSmuggling = route.contrabandJobId !== null;
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
                            await tx.user.update({
                                where: { id: route.userId },
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
                        websocket_1.GameWebSocketServer.sendToUser(route.userId, 'alert:weigh_station_fine', {
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
                        websocket_1.GameWebSocketServer.sendToUser(route.userId, 'alert:driver_wreck', {
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
                            await tx.user.update({
                                where: { id: route.userId },
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
                        websocket_1.GameWebSocketServer.sendToUser(route.userId, 'alert:driver_snitched', {
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
                        websocket_1.GameWebSocketServer.sendToUser(route.userId, 'alert:engine_breakdown', {
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
                if (driver.trait === 'LEAD_FOOT')
                    progressStep += 2.0;
                if (driver.isStimulated)
                    progressStep += 3.5; // pills give a massive boost!
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
                    websocket_1.GameWebSocketServer.sendToUser(route.userId, 'border:inspection_event', {
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
                    const payoutResult = await border_service_1.BorderService.applyClearanceSuccess(truck.id);
                    websocket_1.GameWebSocketServer.sendToUser(route.userId, 'route:completed', {
                        truckId: truck.id,
                        payout: payoutResult.payout,
                        message: 'Cargo successfully delivered. Fleet truck returned to garage slots!',
                    });
                    console.log(`[Simulator] Route ${route.id} reached 100%. Payout cleared successfully.`);
                }
                else {
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
                }
            }
            catch (innerError) {
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
exports.DispatchSimulationService = DispatchSimulationService;
