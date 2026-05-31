"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Apply auth protected Globally
router.use(auth_1.authenticateJWT);
const PARTS_CATALOG = {
    engine_kit: {
        id: 'engine_kit',
        name: 'Standard Engine Overhaul Kit',
        category: 'MAINTENANCE',
        cost: 1800,
        currency: 'LEGAL',
        description: 'Restores +25% engine health. Prevents critical cylinder head crack breakdowns on long hauls.',
    },
    tires_set: {
        id: 'tires_set',
        name: 'High-Performance Fleet Tires',
        category: 'MAINTENANCE',
        cost: 900,
        currency: 'LEGAL',
        description: 'Restores +30% tire wear. Improves fuel efficiency and handling profiles.',
    },
    false_bottom: {
        id: 'false_bottom',
        name: 'False-Bottom Fuel Tank Modification',
        category: 'RIGGING',
        cost: 5000,
        currency: 'BLACK_MARKET',
        description: 'Sacrifices 50L maximum fuel capacity to hide a volume compartment for Class A/B contraband.',
    },
    chassis_cavity: {
        id: 'chassis_cavity',
        name: 'Hidden Chassis Cavity Compartment',
        category: 'RIGGING',
        cost: 12000,
        currency: 'BLACK_MARKET',
        description: 'Large storage stashes inside structural frames. Degrades truck aerodynamics and handling (-15% efficiency).',
    },
    tacho_spoofer: {
        id: 'tacho_spoofer',
        name: 'ECU Digital Tachograph Spoofing Patch',
        category: 'RIGGING',
        cost: 8500,
        currency: 'BLACK_MARKET',
        description: 'Illegal custom software patch forged in Riga. Spoofs Schengen weigh station tacho logs but raises seizure risk.',
    },
    shielding_lvl: {
        id: 'shielding_lvl',
        name: 'Lead Scanners Radiation Shielding (Level +1)',
        category: 'RIGGING',
        cost: 3500,
        currency: 'BLACK_MARKET',
        description: 'Lead-lined plates surrounding sleeper compartments. Block customs scanners (X-Ray/K9 detection rate reduced by 10%). Max Level 5.',
    }
};
// 1. GET THE FULL PARTS STORE CATALOG
router.get('/catalog', async (req, res) => {
    res.json(Object.values(PARTS_CATALOG));
});
// 2. PURCHASE AND INSTALL TRUCK COMPONENT
router.post('/buy', async (req, res) => {
    const userId = req.user.id;
    const { truckId, partId } = req.body;
    if (!truckId || !partId || !PARTS_CATALOG[partId]) {
        return res.status(400).json({ error: 'INVALID_INPUT', message: 'Must specify a valid truckId and partId from shop catalog.' });
    }
    const part = PARTS_CATALOG[partId];
    try {
        // 1. Verify vehicle details
        const truck = await prisma.truck.findUnique({
            where: { id: truckId },
            include: { activeRoute: true },
        });
        if (!truck || truck.ownerId !== userId) {
            return res.status(404).json({ error: 'TRUCK_NOT_FOUND', message: 'Truck not found in your fleet.' });
        }
        if (truck.isImpounded) {
            return res.status(400).json({ error: 'TRUCK_IMPOUNDED', message: 'Cannot service a vehicle impounded by police.' });
        }
        if (truck.activeRoute) {
            return res.status(400).json({ error: 'TRUCK_ON_ROAD', message: 'Cannot service a truck currently dispatched on a route.' });
        }
        // 2. Verify balances
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found.' });
        if (part.currency === 'LEGAL' && user.legalBalance.toNumber() < part.cost) {
            return res.status(400).json({
                error: 'INSUFFICIENT_LEGAL_CASH',
                message: `Parts cost $${part.cost} Clean Cash. You have $${user.legalBalance.toNumber()}.`,
            });
        }
        if (part.currency === 'BLACK_MARKET' && user.blackMarketBalance.toNumber() < part.cost) {
            return res.status(400).json({
                error: 'INSUFFICIENT_BLACK_MARKET_CASH',
                message: `Upgrades cost $${part.cost} Black Market proceeds. You have $${user.blackMarketBalance.toNumber()}.`,
            });
        }
        // 3. Apply changes inside database transaction
        const updated = await prisma.$transaction(async (tx) => {
            // Deduct balance
            if (part.currency === 'LEGAL') {
                await tx.user.update({
                    where: { id: userId },
                    data: { legalBalance: { decrement: part.cost } },
                });
            }
            else {
                await tx.user.update({
                    where: { id: userId },
                    data: { blackMarketBalance: { decrement: part.cost } },
                });
            }
            // Restore values or apply mods based on part ID
            let logDesc = `Installed part: ${part.name}. Cost: $${part.cost}.`;
            let upEngine = truck.engineHealth;
            let upTires = truck.tireWear;
            let fuelTankMod = truck.fuelTankMod;
            let shielding = truck.scannerShielding;
            if (part.id === 'engine_kit') {
                upEngine = Math.min(truck.engineHealth + 25, 100);
                logDesc += ` Engine Health restored from ${truck.engineHealth}% to ${upEngine}%.`;
            }
            else if (part.id === 'tires_set') {
                upTires = Math.min(truck.tireWear + 30, 100);
                logDesc += ` Tire Wear restored from ${truck.tireWear}% to ${upTires}%.`;
            }
            else if (part.id === 'false_bottom') {
                fuelTankMod = 'FALSE_BOTTOM';
                logDesc += ` Sacrificed fuel capacity to fit false contraband compartment.`;
            }
            else if (part.id === 'chassis_cavity') {
                fuelTankMod = 'CHASSIS_CAVITY';
                logDesc += ` Fitted chassis cav stashes. Aerodynamic efficiency penalty active.`;
            }
            else if (part.id === 'shielding_lvl') {
                if (truck.scannerShielding >= 5) {
                    throw new Error('MAX_SHIELDING_REACHED');
                }
                shielding = truck.scannerShielding + 1;
                logDesc += ` Radiation shielding upgraded to level ${shielding}.`;
            }
            // Update truck parameters
            const updatedTruck = await tx.truck.update({
                where: { id: truckId },
                data: {
                    engineHealth: upEngine,
                    tireWear: upTires,
                    fuelTankMod,
                    scannerShielding: shielding,
                },
            });
            // Write History log
            await tx.truckHistory.create({
                data: {
                    truckId,
                    eventType: part.category === 'MAINTENANCE' ? 'REPAIR' : 'MODIFICATION',
                    description: logDesc,
                },
            });
            return updatedTruck;
        });
        res.json({
            message: `Installation complete! applied ${part.name} successfully.`,
            truck: updated,
        });
    }
    catch (error) {
        if (error.message === 'MAX_SHIELDING_REACHED') {
            return res.status(400).json({ error: 'MAX_SHIELDING', message: 'Your vehicle already has maximum Lead shielding density (Level 5).' });
        }
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Store transaction processing failed.' });
    }
});
exports.default = router;
