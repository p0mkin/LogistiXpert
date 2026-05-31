"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Apply auth protection globally to all garage routes
router.use(auth_1.authenticateJWT);
// 1. GET ALL USER GARAGES & TRUCKS
router.get('/', async (req, res) => {
    const userId = req.user.id;
    try {
        const garages = await prisma.garage.findMany({
            where: { ownerId: userId },
            include: {
                trucks: {
                    include: {
                        driver: true,
                        history: { orderBy: { recordedAt: 'desc' }, take: 10 },
                    },
                },
            },
        });
        res.json(garages);
    }
    catch (error) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve garages and vehicles.' });
    }
});
// 2. APPLY UNDERWORLD TRUCK RIGGING MODIFICATIONS
router.patch('/trucks/:truckId/mod', async (req, res) => {
    const userId = req.user.id;
    const { truckId } = req.params;
    const { fuelTankMod, scannerShielding } = req.body; // FuelTankMod enum, scannerShielding (0-5)
    try {
        // 1. Verify ownership
        const truck = await prisma.truck.findUnique({ where: { id: truckId } });
        if (!truck || truck.ownerId !== userId) {
            return res.status(404).json({ error: 'TRUCK_NOT_FOUND', message: 'Vehicle does not exist in your fleet.' });
        }
        if (truck.isImpounded) {
            return res.status(400).json({ error: 'TRUCK_IMPOUNDED', message: 'Cannot modify a vehicle currently in police impound.' });
        }
        // 2. Deduct modification cost from black market balance
        let cost = 0;
        if (fuelTankMod === 'FALSE_BOTTOM')
            cost += 5000;
        if (fuelTankMod === 'CHASSIS_CAVITY')
            cost += 12000;
        if (scannerShielding && scannerShielding > truck.scannerShielding) {
            cost += (scannerShielding - truck.scannerShielding) * 3500; // $3500 per shielding level
        }
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.blackMarketBalance.toNumber() < cost) {
            return res.status(400).json({
                error: 'INSUFFICIENT_BLACK_MARKET_FUNDS',
                message: `Upgrades cost $${cost} Black Market Cash. You need more illegal proceeds.`,
            });
        }
        // 3. Apply modification inside a transaction
        const updatedTruck = await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: userId },
                data: { blackMarketBalance: { decrement: cost } },
            });
            const updated = await tx.truck.update({
                where: { id: truckId },
                data: {
                    fuelTankMod: fuelTankMod || truck.fuelTankMod,
                    scannerShielding: scannerShielding !== undefined ? scannerShielding : truck.scannerShielding,
                },
            });
            await tx.truckHistory.create({
                data: {
                    truckId,
                    eventType: 'MODIFICATION',
                    description: `Applied underworld modifications. Fuel Mod: ${fuelTankMod || 'UNCHANGED'}, Scanner Shielding Level: ${scannerShielding !== undefined ? scannerShielding : 'UNCHANGED'}. Total cost: $${cost} (Black Market Cash).`,
                },
            });
            return updated;
        });
        res.json({
            message: 'Modification applied successfully!',
            truck: updatedTruck,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to process mechanical modification.' });
    }
});
exports.default = router;
