"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// ================================================================
// BREAKDOWN SEVERITY CALCULATION
// Returns cost multiplier based on engine + tire state
// ================================================================
function calcRepairCost(engineHealth, tireWear, distanceFromHub // km estimate from nearest repair hub
) {
    // Engine repair: $200 per % lost, minimum $500 floor
    const engineDamage = Math.max(100 - engineHealth, 0);
    const engineCost = Math.max(engineDamage * 200, 500);
    // Tire repair: $80 per % worn below 50 threshold, minimum $200
    const tireDamage = Math.max(50 - tireWear, 0);
    const tireCost = Math.max(tireDamage * 80, 200);
    // Tow truck: $3 per km from nearest hub (Baltic cities baseline ~100-400km)
    const towCost = Math.round(distanceFromHub * 3);
    const totalCost = engineCost + tireCost + towCost;
    let severity;
    if (engineHealth >= 70 && tireWear >= 40)
        severity = 'MINOR';
    else if (engineHealth >= 40 && tireWear >= 20)
        severity = 'MODERATE';
    else if (engineHealth >= 15 && tireWear >= 5)
        severity = 'SEVERE';
    else
        severity = 'CATASTROPHIC';
    return { engineCost, tireCost, towCost, totalCost, severity };
}
// Nearest hub distance lookup by last reported city
const CITY_TO_NEAREST_HUB_KM = {
    Tallinn: 0,
    Riga: 0,
    Vilnius: 0,
    Warsaw: 0,
    Gdansk: 0,
    Kaunas: 45,
    Minsk: 80,
    Brest: 120,
    Bialystok: 55,
    Siauliai: 90,
    Panevezys: 110,
    Hrodna: 145,
    Daugavpils: 95,
    Jelgava: 50,
    default: 200,
};
// ================================================================
// GET /api/breakdown/estimate/:truckId
// Returns repair cost estimate before the player commits to paying
// ================================================================
router.get('/estimate/:truckId', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { truckId } = req.params;
        const truck = await prisma.truck.findUnique({
            where: { id: truckId },
            include: { activeRoute: true },
        });
        if (!truck || truck.ownerId !== req.user.id) {
            return res.status(404).json({ error: 'TRUCK_NOT_FOUND' });
        }
        if (truck.isImpounded) {
            return res.status(400).json({
                error: 'TRUCK_IMPOUNDED',
                message: `Truck is impounded. Release date: ${truck.impoundReleaseAt?.toISOString() ?? 'unknown'}`,
            });
        }
        const lastCity = truck.activeRoute?.currentCity ?? 'default';
        const distanceKm = CITY_TO_NEAREST_HUB_KM[lastCity] ?? CITY_TO_NEAREST_HUB_KM['default'];
        const estimate = calcRepairCost(truck.engineHealth, truck.tireWear, distanceKm);
        return res.json({
            truckId,
            model: truck.model,
            engineHealth: truck.engineHealth,
            tireWear: truck.tireWear,
            lastCity,
            ...estimate,
        });
    }
    catch (err) {
        console.error('[Breakdown] Estimate error:', err);
        return res.status(500).json({ error: 'SERVER_ERROR' });
    }
});
// ================================================================
// POST /api/breakdown/roadside-repair
// Emergency in-field repair — costs more but fixes you in place
// Body: { truckId, repairEngine: boolean, repairTires: boolean }
// ================================================================
router.post('/roadside-repair', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { truckId, repairEngine = true, repairTires = true } = req.body;
        if (!truckId) {
            return res.status(400).json({ error: 'MISSING_TRUCK_ID' });
        }
        const result = await prisma.$transaction(async (tx) => {
            const truck = await tx.truck.findUnique({
                where: { id: truckId },
                include: { owner: true, activeRoute: true },
            });
            if (!truck || truck.ownerId !== req.user.id) {
                throw new Error('TRUCK_NOT_FOUND');
            }
            if (truck.isImpounded) {
                throw new Error('TRUCK_IMPOUNDED');
            }
            const lastCity = truck.activeRoute?.currentCity ?? 'default';
            const distanceKm = CITY_TO_NEAREST_HUB_KM[lastCity] ?? CITY_TO_NEAREST_HUB_KM['default'];
            const estimate = calcRepairCost(truck.engineHealth, truck.tireWear, distanceKm);
            // Roadside repair = 1.5x cost premium over shop repair (emergency call-out surcharge)
            const roadsidePremium = 1.5;
            let totalCharge = estimate.towCost; // Always pay tow regardless
            if (repairEngine)
                totalCharge += estimate.engineCost * roadsidePremium;
            if (repairTires)
                totalCharge += estimate.tireCost * roadsidePremium;
            if (truck.owner.legalBalance.toNumber() < totalCharge) {
                throw new Error('INSUFFICIENT_FUNDS');
            }
            // Apply repairs
            const newEngineHealth = repairEngine ? 100 : truck.engineHealth;
            const newTireWear = repairTires ? 100 : truck.tireWear;
            await tx.truck.update({
                where: { id: truckId },
                data: {
                    engineHealth: newEngineHealth,
                    tireWear: newTireWear,
                },
            });
            // Deduct charge from legal balance
            await tx.user.update({
                where: { id: req.user.id },
                data: {
                    legalBalance: { decrement: totalCharge },
                },
            });
            // Log the event
            const repairDesc = [];
            if (repairEngine)
                repairDesc.push(`Engine restored to 100%`);
            if (repairTires)
                repairDesc.push(`Tires restored to 100%`);
            await tx.truckHistory.create({
                data: {
                    truckId,
                    eventType: 'ROADSIDE_REPAIR',
                    description: `Emergency roadside repair near ${lastCity}. ${repairDesc.join(', ')}. Cost: $${totalCharge.toFixed(0)} (inc. tow surcharge).`,
                },
            });
            return {
                repaired: true,
                totalCharge,
                severity: estimate.severity,
                newEngineHealth,
                newTireWear,
                roadsidePremium: `+50% emergency surcharge applied`,
            };
        });
        return res.json(result);
    }
    catch (err) {
        if (['TRUCK_NOT_FOUND', 'TRUCK_IMPOUNDED', 'INSUFFICIENT_FUNDS'].includes(err.message)) {
            return res.status(400).json({ error: err.message });
        }
        console.error('[Breakdown] Roadside repair error:', err);
        return res.status(500).json({ error: 'SERVER_ERROR' });
    }
});
// ================================================================
// POST /api/breakdown/garage-repair
// Tow to nearest hub and repair at normal shop rates
// Cancels active route (must re-dispatch after)
// Body: { truckId, repairEngine: boolean, repairTires: boolean }
// ================================================================
router.post('/garage-repair', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { truckId, repairEngine = true, repairTires = true } = req.body;
        if (!truckId) {
            return res.status(400).json({ error: 'MISSING_TRUCK_ID' });
        }
        const result = await prisma.$transaction(async (tx) => {
            const truck = await tx.truck.findUnique({
                where: { id: truckId },
                include: { owner: true, activeRoute: { include: { contrabandJob: true } } },
            });
            if (!truck || truck.ownerId !== req.user.id) {
                throw new Error('TRUCK_NOT_FOUND');
            }
            if (truck.isImpounded) {
                throw new Error('TRUCK_IMPOUNDED');
            }
            const lastCity = truck.activeRoute?.currentCity ?? 'default';
            const distanceKm = CITY_TO_NEAREST_HUB_KM[lastCity] ?? CITY_TO_NEAREST_HUB_KM['default'];
            const estimate = calcRepairCost(truck.engineHealth, truck.tireWear, distanceKm);
            // Standard garage rates (no surcharge), but pay tow
            let totalCharge = estimate.towCost;
            if (repairEngine)
                totalCharge += estimate.engineCost;
            if (repairTires)
                totalCharge += estimate.tireCost;
            if (truck.owner.legalBalance.toNumber() < totalCharge) {
                throw new Error('INSUFFICIENT_FUNDS');
            }
            const newEngineHealth = repairEngine ? 100 : truck.engineHealth;
            const newTireWear = repairTires ? 100 : truck.tireWear;
            await tx.truck.update({
                where: { id: truckId },
                data: {
                    engineHealth: newEngineHealth,
                    tireWear: newTireWear,
                },
            });
            await tx.user.update({
                where: { id: req.user.id },
                data: {
                    legalBalance: { decrement: totalCharge },
                },
            });
            // If there was an active route, cancel it — cargo lost or returned
            let routeCanceled = false;
            let contrabandJettisoned = false;
            if (truck.activeRoute) {
                // Contraband is dumped (driver ditches it to avoid police when tow arrives)
                if (truck.activeRoute.contrabandJob) {
                    contrabandJettisoned = true;
                }
                await tx.activeRoute.delete({ where: { id: truck.activeRoute.id } });
                routeCanceled = true;
            }
            const repairDesc = [];
            if (repairEngine)
                repairDesc.push('Engine: 100%');
            if (repairTires)
                repairDesc.push('Tires: 100%');
            await tx.truckHistory.create({
                data: {
                    truckId,
                    eventType: 'GARAGE_REPAIR',
                    description: `Towed from ${lastCity} to nearest garage hub. ${repairDesc.join(', ')}. ${routeCanceled ? 'Active route CANCELED.' : ''} ${contrabandJettisoned ? '⚠️ Contraband jettisoned by driver before tow.' : ''} Total cost: $${totalCharge.toFixed(0)}.`,
                },
            });
            return {
                repaired: true,
                totalCharge,
                severity: estimate.severity,
                newEngineHealth,
                newTireWear,
                routeCanceled,
                contrabandJettisoned,
                warning: contrabandJettisoned
                    ? 'Driver ditched contraband before tow truck arrived. Cargo lost, no bust logged.'
                    : undefined,
            };
        });
        return res.json(result);
    }
    catch (err) {
        if (['TRUCK_NOT_FOUND', 'TRUCK_IMPOUNDED', 'INSUFFICIENT_FUNDS'].includes(err.message)) {
            return res.status(400).json({ error: err.message });
        }
        console.error('[Breakdown] Garage repair error:', err);
        return res.status(500).json({ error: 'SERVER_ERROR' });
    }
});
// ================================================================
// GET /api/breakdown/fleet-status
// Returns health summary for all player trucks — flags danger trucks
// ================================================================
router.get('/fleet-status', auth_1.authenticateJWT, async (req, res) => {
    try {
        const trucks = await prisma.truck.findMany({
            where: { ownerId: req.user.id },
            include: {
                activeRoute: { select: { currentCity: true, progressPct: true, eta: true } },
            },
        });
        const summary = trucks.map((truck) => {
            const lastCity = truck.activeRoute?.currentCity ?? 'garage';
            const distanceKm = CITY_TO_NEAREST_HUB_KM[lastCity] ?? CITY_TO_NEAREST_HUB_KM['default'];
            const { severity, totalCost } = calcRepairCost(truck.engineHealth, truck.tireWear, distanceKm);
            return {
                truckId: truck.id,
                model: truck.model,
                vin: truck.vin,
                engineHealth: truck.engineHealth,
                tireWear: truck.tireWear,
                isImpounded: truck.isImpounded,
                impoundReleaseAt: truck.impoundReleaseAt,
                currentCity: lastCity,
                progressPct: truck.activeRoute?.progressPct ?? null,
                eta: truck.activeRoute?.eta ?? null,
                breakdownRisk: severity,
                estimatedRepairCost: totalCost,
                // Alert flags
                engineAlert: truck.engineHealth < 30,
                tireAlert: truck.tireWear < 25,
                criticalAlert: truck.engineHealth < 15 || truck.tireWear < 10,
            };
        });
        return res.json({ trucks: summary, total: summary.length });
    }
    catch (err) {
        console.error('[Breakdown] Fleet status error:', err);
        return res.status(500).json({ error: 'SERVER_ERROR' });
    }
});
// ================================================================
// POST /api/breakdown/release-impound/:truckId
// Pay impound fee to release truck early (2x daily fee per day remaining)
// ================================================================
router.post('/release-impound/:truckId', auth_1.authenticateJWT, async (req, res) => {
    try {
        const { truckId } = req.params;
        const result = await prisma.$transaction(async (tx) => {
            const truck = await tx.truck.findUnique({
                where: { id: truckId },
                include: { owner: true },
            });
            if (!truck || truck.ownerId !== req.user.id) {
                throw new Error('TRUCK_NOT_FOUND');
            }
            if (!truck.isImpounded || !truck.impoundReleaseAt) {
                throw new Error('NOT_IMPOUNDED');
            }
            const now = new Date();
            const releaseDate = truck.impoundReleaseAt;
            const daysRemaining = Math.ceil((releaseDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysRemaining <= 0) {
                // Already expired — just release
                await tx.truck.update({
                    where: { id: truckId },
                    data: { isImpounded: false, impoundReleaseAt: null },
                });
                return { released: true, fee: 0, daysRemaining: 0 };
            }
            // 2x daily impound rate ($3500/day) for early release
            const earlyReleaseFee = daysRemaining * 3500 * 2;
            if (truck.owner.legalBalance.toNumber() < earlyReleaseFee) {
                throw new Error(`INSUFFICIENT_FUNDS:${earlyReleaseFee}`);
            }
            await tx.user.update({
                where: { id: req.user.id },
                data: { legalBalance: { decrement: earlyReleaseFee } },
            });
            await tx.truck.update({
                where: { id: truckId },
                data: { isImpounded: false, impoundReleaseAt: null },
            });
            await tx.truckHistory.create({
                data: {
                    truckId,
                    eventType: 'IMPOUND_RELEASE',
                    description: `Early impound release. ${daysRemaining} days remaining. Fee paid: $${earlyReleaseFee} (2x daily rate).`,
                },
            });
            return { released: true, fee: earlyReleaseFee, daysRemaining };
        });
        return res.json(result);
    }
    catch (err) {
        if (err.message?.startsWith('INSUFFICIENT_FUNDS')) {
            const fee = err.message.split(':')[1];
            return res.status(400).json({ error: 'INSUFFICIENT_FUNDS', required: parseFloat(fee) });
        }
        if (['TRUCK_NOT_FOUND', 'NOT_IMPOUNDED'].includes(err.message)) {
            return res.status(400).json({ error: err.message });
        }
        console.error('[Breakdown] Impound release error:', err);
        return res.status(500).json({ error: 'SERVER_ERROR' });
    }
});
exports.default = router;
