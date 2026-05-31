"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Apply authorization globally
router.use(auth_1.authenticateJWT);
// 1. GET ALL USER DRIVERS
router.get('/', async (req, res) => {
    const userId = req.user.id;
    try {
        const drivers = await prisma.driver.findMany({
            where: { ownerId: userId },
            include: { assignedTruck: true },
        });
        res.json(drivers);
    }
    catch (error) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve driver roster.' });
    }
});
// 2. HIRE A NEW DRIVER (starter recruitment fee)
router.post('/hire', async (req, res) => {
    const userId = req.user.id;
    const { name } = req.body;
    const recruitmentCost = 2500; // $2500 legal cash
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.legalBalance.toNumber() < recruitmentCost) {
            return res.status(400).json({
                error: 'INSUFFICIENT_FUNDS',
                message: `Hiring a new driver card costs $${recruitmentCost} Clean Cash.`,
            });
        }
        // Generate random stats
        const traits = ['BALANCED', 'LEAD_FOOT', 'SLEEP_DEPRIVED', 'LOYAL', 'CHARISMATIC'];
        const randomTrait = traits[Math.floor(Math.random() * traits.length)];
        const charisma = Math.floor(Math.random() * 12) + 5; // 5 to 16
        const loyalty = Math.floor(Math.random() * 50) + 40; // 40 to 90
        const firstNames = ['Jonas', 'Andrius', 'Pavel', 'Krzysztof', 'Dmitry', 'Stanislaw', 'Janis', 'Toomas'];
        const lastNames = ['Kazlauskas', 'Kowalski', 'Petrov', 'Novak', 'Sabonis', 'Ozols', 'Ligi', 'Ivanov'];
        const generatedName = name || `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
        const newDriver = await prisma.$transaction(async (tx) => {
            // Deduct hiring cost
            await tx.user.update({
                where: { id: userId },
                data: { legalBalance: { decrement: recruitmentCost } },
            });
            return await tx.driver.create({
                data: {
                    ownerId: userId,
                    name: generatedName,
                    trait: randomTrait,
                    charisma,
                    loyalty,
                    fatigue: 0,
                    tachoHours: 0.0,
                    isStimulated: false,
                },
            });
        });
        res.status(201).json({
            message: 'Driver hired successfully!',
            driver: newDriver,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to complete driver hiring contract.' });
    }
});
// 3. ORDER SHIFT REST ROTATION (Tacho & fatigue reset)
router.post('/:driverId/rest', async (req, res) => {
    const userId = req.user.id;
    const { driverId } = req.params;
    const { restLocation } = req.body; // 'SCHENGEN_GARAGE' or 'EAST_CABIN'
    try {
        const driver = await prisma.driver.findUnique({
            where: { id: driverId },
            include: { assignedTruck: { include: { activeRoute: true } } },
        });
        if (!driver || driver.ownerId !== userId) {
            return res.status(404).json({ error: 'DRIVER_NOT_FOUND', message: 'Driver card not found in your company roster.' });
        }
        if (driver.assignedTruck?.activeRoute) {
            return res.status(400).json({ error: 'DRIVER_ON_ROAD', message: 'Cannot order rest rotation while driver is dispatched on an active route.' });
        }
        const restFee = restLocation === 'SCHENGEN_GARAGE' ? 250 : 0; // Motels cost clean money, cabin rest is free
        const updated = await prisma.$transaction(async (tx) => {
            if (restFee > 0) {
                const user = await tx.user.findUnique({ where: { id: userId } });
                if (!user || user.legalBalance.toNumber() < restFee) {
                    throw new Error('INSUFFICIENT_REST_FUNDS');
                }
                await tx.user.update({
                    where: { id: userId },
                    data: { legalBalance: { decrement: restFee } },
                });
            }
            const driverUpdate = await tx.driver.update({
                where: { id: driverId },
                data: {
                    fatigue: 0,
                    tachoHours: 0.0,
                    isStimulated: false, // Wipes chemical effects
                },
            });
            // If they rested in the Cabin in the East, there is a minor cargo theft/tampering roll!
            let logDesc = `Rested in Schengen Motel. Tachometer card reset to 0.0h. Fatigue cleared. Cost: $${restFee} Clean Cash.`;
            if (restLocation === 'EAST_CABIN') {
                const stolenRoll = Math.random() < 0.15; // 15% chance of minor parts/fuel siphoning
                logDesc = 'Rested free in cabin sleep in Eastern zone. Fatigue cleared.';
                if (stolenRoll && driver.assignedTruckId) {
                    logDesc += ' WARNING: Fuel tank siphoned while sleeping! -50L fuel.';
                    await tx.truckHistory.create({
                        data: {
                            truckId: driver.assignedTruckId,
                            eventType: 'THEFT',
                            description: 'Fuel tank siphoned and siphoned locks damaged while driver slept in cabin.',
                        },
                    });
                }
            }
            if (driver.assignedTruckId) {
                await tx.truckHistory.create({
                    data: {
                        truckId: driver.assignedTruckId,
                        eventType: 'DRIVER_REST',
                        description: logDesc,
                    },
                });
            }
            return driverUpdate;
        });
        res.json({
            message: 'Driver rested successfully. Tacho logs and fatigue cleared!',
            driver: updated,
        });
    }
    catch (error) {
        if (error.message === 'INSUFFICIENT_REST_FUNDS') {
            return res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: 'You do not have enough Clean Cash to pay motel rest fees.' });
        }
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to process driver rest order.' });
    }
});
// 4. ADMINISTER STIMULANT ("Pop Pills" fatigue override)
router.post('/:driverId/stimulate', async (req, res) => {
    const userId = req.user.id;
    const { driverId } = req.params;
    const chemicalCost = 500; // $500 black market cash
    try {
        const driver = await prisma.driver.findUnique({
            where: { id: driverId },
        });
        if (!driver || driver.ownerId !== userId) {
            return res.status(404).json({ error: 'DRIVER_NOT_FOUND', message: 'Driver card not found.' });
        }
        // Substance usage requirements: driver must be LOYAL or have at least 60 Loyalty
        if (driver.loyalty < 60 && driver.trait !== 'LOYAL') {
            // Driver rejects the illegal stimulant order!
            const loyaltyPenalty = 15;
            await prisma.driver.update({
                where: { id: driverId },
                data: { loyalty: { decrement: loyaltyPenalty } },
            });
            return res.status(403).json({
                error: 'DRIVER_REJECTED_SUBSTANCE',
                message: `Driver ${driver.name} is not loyal enough and REJECTED your order to use illegal stimulants! Loyalty decreased by ${loyaltyPenalty}.`,
            });
        }
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.blackMarketBalance.toNumber() < chemicalCost) {
            return res.status(400).json({
                error: 'INSUFFICIENT_BLACK_MARKET_FUNDS',
                message: `Chemical stimulants cost $${chemicalCost} Black Market proceeds.`,
            });
        }
        // Apply substance chemical boosting!
        const updated = await prisma.$transaction(async (tx) => {
            // Deduct black market cash
            await tx.user.update({
                where: { id: userId },
                data: { blackMarketBalance: { decrement: chemicalCost } },
            });
            // Reduce fatigue by 50% and set stimulated state
            const driverUpdate = await tx.driver.update({
                where: { id: driverId },
                data: {
                    fatigue: Math.max(driver.fatigue - 50, 0),
                    isStimulated: true,
                    loyalty: Math.min(driver.loyalty + 5, 100), // minor loyalty spike from "perks"
                },
            });
            if (driver.assignedTruckId) {
                await tx.truckHistory.create({
                    data: {
                        truckId: driver.assignedTruckId,
                        eventType: 'SUBSTANCE_ADMINISTERED',
                        description: `Ordered driver to administer chemical stimulants to suppress fatigue. Fatigue reduced by 50%. ERRATIC SPEED ACTIVE. Cost: $${chemicalCost} (Black Market Cash).`,
                    },
                });
            }
            return driverUpdate;
        });
        res.json({
            message: `Fatigue successfully suppressed! Driver ${driver.name} is stimulated and alert.`,
            driver: updated,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to process driver stimulant administration.' });
    }
});
exports.default = router;
