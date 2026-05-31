"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Apply authentication globally
router.use(auth_1.authenticateJWT);
// 1. GET ALL ACTIVE DISPATCHED FLEET ROUTES
router.get('/active', async (req, res) => {
    const userId = req.user.id;
    try {
        const active = await prisma.activeRoute.findMany({
            where: { userId },
            include: {
                truck: true,
                driver: true,
                legalContract: true,
                contrabandJob: true,
            },
        });
        res.json(active);
    }
    catch (error) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve active routes.' });
    }
});
// GET AVAILABLE LEGAL CONTRACTS
router.get('/contracts/legal', async (req, res) => {
    try {
        const contracts = await prisma.legalContract.findMany();
        res.json(contracts);
    }
    catch (error) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve available legal contracts.' });
    }
});
// GET AVAILABLE CONTRABAND JOBS
router.get('/contracts/contraband', async (req, res) => {
    try {
        const jobs = await prisma.contrabandJob.findMany();
        res.json(jobs);
    }
    catch (error) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve available contraband jobs.' });
    }
});
// 2. DISPATCH A TRUCK ON A ROUTE CONTRACT
router.post('/launch', async (req, res) => {
    const userId = req.user.id;
    const { truckId, legalContractId, contrabandJobId } = req.body;
    if (!truckId || (!legalContractId && !contrabandJobId)) {
        return res.status(400).json({
            error: 'INVALID_INPUT',
            message: 'Must specify a truckId and either a legalContractId or contrabandJobId.',
        });
    }
    try {
        // 1. Verify truck ownership, check state
        const truck = await prisma.truck.findUnique({
            where: { id: truckId },
            include: { driver: true, activeRoute: true },
        });
        if (!truck || truck.ownerId !== userId) {
            return res.status(404).json({ error: 'TRUCK_NOT_FOUND', message: 'Truck not found in your fleet.' });
        }
        if (truck.isImpounded) {
            return res.status(400).json({ error: 'TRUCK_IMPOUNDED', message: 'Cannot dispatch a vehicle in police impound.' });
        }
        if (truck.activeRoute) {
            return res.status(400).json({ error: 'TRUCK_ACTIVE', message: 'This vehicle is already dispatched on a route.' });
        }
        // 2. Verify driver is assigned and fit
        const driver = truck.driver;
        if (!driver) {
            return res.status(400).json({
                error: 'NO_ASSIGNED_DRIVER',
                message: 'No driver is assigned to this truck. Assign a driver in fleet management first.',
            });
        }
        if (driver.fatigue >= 90) {
            return res.status(400).json({
                error: 'DRIVER_EXHAUSTED',
                message: `Driver ${driver.name} is too exhausted (Fatigue: ${driver.fatigue}%). Order them to rest first!`,
            });
        }
        // 3. Fetch contract details and calculate ETA
        let origin = '';
        let destination = '';
        let distanceKm = 300; // base default
        if (legalContractId) {
            const contract = await prisma.legalContract.findUnique({ where: { id: legalContractId } });
            if (!contract)
                return res.status(404).json({ error: 'CONTRACT_NOT_FOUND', message: 'Legal contract not found.' });
            origin = contract.origin;
            destination = contract.destination;
            distanceKm = contract.distanceKm;
        }
        else if (contrabandJobId) {
            const job = await prisma.contrabandJob.findUnique({ where: { id: contrabandJobId } });
            if (!job)
                return res.status(404).json({ error: 'JOB_NOT_FOUND', message: 'Underworld contraband contract not found.' });
            origin = job.origin;
            destination = job.destination;
            // standard distance calculation based on cities connection
            distanceKm = 350; // Brest/Minsk standard smuggles
        }
        // Base dispatch speed: 70 km/h
        let avgSpeed = 70.0;
        // Trait modifiers
        if (driver.trait === 'LEAD_FOOT')
            avgSpeed += 10.0; // +10 km/h
        if (driver.isStimulated)
            avgSpeed += 15.0; // pop pills speed boost!
        // Calculate real-world seconds for route transit (1 km = 1 real second for fast gameplay simulation!)
        const transitSeconds = distanceKm;
        const eta = new Date();
        eta.setSeconds(eta.getSeconds() + transitSeconds);
        // 4. Create Active Route inside database
        const activeRoute = await prisma.$transaction(async (tx) => {
            const route = await tx.activeRoute.create({
                data: {
                    userId,
                    truckId,
                    driverId: driver.id,
                    legalContractId: legalContractId || null,
                    contrabandJobId: contrabandJobId || null,
                    progressPct: 0.0,
                    eta,
                    currentCity: origin,
                    isUnderBorderCheck: false,
                },
            });
            // Log dispatch history
            const jobType = contrabandJobId ? 'UNDERWORLD SMUGGLING' : 'LEGAL CONTRACT';
            await tx.truckHistory.create({
                data: {
                    truckId,
                    eventType: 'ROUTE_DISPATCH',
                    description: `Dispatched on ${jobType} from ${origin} to ${destination} (${distanceKm} km). Estimated transit time: ${transitSeconds}s. Driver: ${driver.name}.`,
                },
            });
            return route;
        });
        res.status(201).json({
            message: 'Fleet truck dispatched successfully! Track progression in HUD.',
            route: activeRoute,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to dispatch route.' });
    }
});
exports.default = router;
