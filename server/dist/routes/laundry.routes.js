"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Apply auth middleware globally
router.use(auth_1.authenticateJWT);
// 1. GET ALL USER FRONTS
router.get('/', async (req, res) => {
    const userId = req.user.id;
    try {
        const fronts = await prisma.frontBusiness.findMany({
            where: { ownerId: userId },
            orderBy: { createdAt: 'asc' },
        });
        res.json(fronts);
    }
    catch (error) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve money laundering fronts.' });
    }
});
// 2. BUY A NEW LAUNDERING FRONT BUSINESS (Costs Clean Cash)
router.post('/buy', async (req, res) => {
    const userId = req.user.id;
    const { type, customName } = req.body; // type: 'TAXI', 'CAFE', 'LOGISTICS'
    let cost = 0;
    let name = '';
    let city = '';
    let baseRate = 500; // $ per cycle
    let baseLoss = 0.80; // 80% return
    if (type === 'TAXI') {
        cost = 15000;
        name = customName || 'Kaunas Transit Taxi Co';
        city = 'Kaunas';
        baseRate = 500;
        baseLoss = 0.80;
    }
    else if (type === 'CAFE') {
        cost = 35000;
        name = customName || 'Bialystok Truck Stop Cafe';
        city = 'Bialystok';
        baseRate = 1500;
        baseLoss = 0.83;
    }
    else if (type === 'LOGISTICS') {
        cost = 80000;
        name = customName || 'Warsaw Legal Freight Front';
        city = 'Warsaw';
        baseRate = 4500;
        baseLoss = 0.86;
    }
    else {
        return res.status(400).json({ error: 'INVALID_TYPE', message: 'Must select front type: TAXI, CAFE, or LOGISTICS.' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.legalBalance.toNumber() < cost) {
            return res.status(400).json({
                error: 'INSUFFICIENT_FUNDS',
                message: `Acquiring the legal front "${name}" requires $${cost} Clean Cash.`,
            });
        }
        const newFront = await prisma.$transaction(async (tx) => {
            // Deduct balance
            await tx.user.update({
                where: { id: userId },
                data: { legalBalance: { decrement: cost } },
            });
            return await tx.frontBusiness.create({
                data: {
                    ownerId: userId,
                    name,
                    city,
                    laundryRate: baseRate,
                    lossMultiplier: baseLoss,
                    upgradeLevel: 1,
                },
            });
        });
        res.status(201).json({
            message: 'Legal front business established! You can now launder dirty proceeds.',
            front: newFront,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to purchase laundering front.' });
    }
});
// 3. LAUNDER BLACK MARKET CASH (Launder dirty proceeds)
router.post('/:frontId/launder', async (req, res) => {
    const userId = req.user.id;
    const { frontId } = req.params;
    const { amount } = req.body;
    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'INVALID_INPUT', message: 'Must specify a valid positive amount to launder.' });
    }
    try {
        const front = await prisma.frontBusiness.findUnique({
            where: { id: frontId },
        });
        if (!front || front.ownerId !== userId) {
            return res.status(404).json({ error: 'FRONT_NOT_FOUND', message: 'Laundering front business not found.' });
        }
        if (front.isRaided) {
            const now = new Date();
            if (front.raidCooldown && front.raidCooldown > now) {
                return res.status(400).json({
                    error: 'FRONT_RAIDED_LOCK',
                    message: `This business is under deep audit lock following a recent police raid! Unlocks at ${front.raidCooldown.toISOString()}.`,
                });
            }
            else {
                // Cooldown expired, restore
                await prisma.frontBusiness.update({
                    where: { id: frontId },
                    data: { isRaided: false, raidCooldown: null },
                });
            }
        }
        const maxRate = front.laundryRate.toNumber();
        if (amount > maxRate) {
            return res.status(400).json({
                error: 'RATE_LIMIT_EXCEEDED',
                message: `This front has a laundering cap of $${maxRate} dirty cash per cycle. Upgrade this front to process larger batches.`,
            });
        }
        // Double check black market balance
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.blackMarketBalance.toNumber() < amount) {
            return res.status(400).json({
                error: 'INSUFFICIENT_BLACK_MARKET_CUNDS',
                message: `You do not have $${amount} dirty cash to launder.`,
            });
        }
        // 4. ALGORITHM: Police Raid Risk calculation
        // Base risk: 4%
        // Batch scaling: +1% per $1000 laundered
        // Heat scaling: +1% per 10 police heat
        const batchScale = Math.floor(amount / 1000);
        const heatScale = Math.floor(user.policeHeat / 10);
        const raidRisk = Math.min(4 + batchScale + heatScale, 80); // clamp at 80% max risk
        const raidRoll = Math.random() * 100;
        const isRaided = raidRoll < raidRisk;
        if (isRaided) {
            // Raid triggers! Seize dirty cash, lock front, raise heat
            const cooldownDate = new Date();
            cooldownDate.setHours(cooldownDate.getHours() + 24); // 24 hours lock
            await prisma.$transaction(async (tx) => {
                // Deduct dirty cash
                await tx.user.update({
                    where: { id: userId },
                    data: {
                        blackMarketBalance: { decrement: amount },
                        policeHeat: { increment: 20 }, // heat spikes
                    },
                });
                // Set raid lock
                await tx.frontBusiness.update({
                    where: { id: frontId },
                    data: {
                        isRaided: true,
                        raidCooldown: cooldownDate,
                    },
                });
            });
            return res.json({
                raided: true,
                risk: raidRisk,
                roll: raidRoll,
                message: `POLICE RAID ENFORCEMENT! Officers raided "${front.name}". Launder batch of $${amount} seized and confiscated. Business locked for 24h audit. Police Heat +20.`,
            });
        }
        // Success laundering!
        const cleanReturned = amount * front.lossMultiplier;
        const updatedBalances = await prisma.$transaction(async (tx) => {
            // Deduct dirty, add clean
            await tx.user.update({
                where: { id: userId },
                data: {
                    blackMarketBalance: { decrement: amount },
                    legalBalance: { increment: cleanReturned },
                },
            });
            return await tx.user.findUnique({ where: { id: userId } });
        });
        res.json({
            raided: false,
            risk: raidRisk,
            roll: raidRoll,
            dirtyProcessed: amount,
            cleanCredited: cleanReturned,
            message: `Laundry cycle successful! Cleaned $${amount} dirty cash into $${cleanReturned} legal balance (Conversion Yield: ${Math.floor(front.lossMultiplier * 100)}%).`,
            legalBalance: updatedBalances?.legalBalance,
            blackMarketBalance: updatedBalances?.blackMarketBalance,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Laundering transaction failed.' });
    }
});
exports.default = router;
