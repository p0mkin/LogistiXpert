"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// 1. REGISTER NEW PLAYER
router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || username.trim().length < 3 || password.length < 6) {
        return res.status(400).json({
            error: 'INVALID_INPUT',
            message: 'Username must be at least 3 characters and password at least 6 characters.',
        });
    }
    try {
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
            return res.status(409).json({ error: 'USERNAME_TAKEN', message: 'This username is already registered.' });
        }
        const passwordHash = await bcrypt_1.default.hash(password, config_1.CONFIG.BCRYPT_ROUNDS);
        // Create user and initial assets (first garage and starter truck)
        const user = await prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    username,
                    passwordHash,
                    legalBalance: 50000.00, // Starter cash
                    blackMarketBalance: 0.00,
                },
            });
            // 1. Starter Garage
            const garage = await tx.garage.create({
                data: {
                    ownerId: newUser.id,
                    city: 'Kaunas',
                    capacity: 3,
                },
            });
            // 2. Generate initial VIN and Starter Truck
            const starterVin = `TRK-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            await tx.truck.create({
                data: {
                    ownerId: newUser.id,
                    garageId: garage.id,
                    model: 'Scania R450 Basic',
                    vin: starterVin,
                    mileage: 150.0,
                    engineHealth: 100,
                    tireWear: 100,
                    fuelCapacity: 350.0,
                    fuelTankMod: 'STOCK',
                },
            });
            return newUser;
        });
        res.status(201).json({
            message: 'Player registered successfully. Starter assets (Kaunas Garage + Scania truck) allocated!',
            userId: user.id,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create player profile.' });
    }
});
// 2. LOGIN & OBTAIN TOKEN
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'INVALID_INPUT', message: 'Username and password are required.' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
            return res.status(401).json({ error: 'AUTH_FAILED', message: 'Invalid username or password.' });
        }
        const match = await bcrypt_1.default.compare(password, user.passwordHash);
        if (!match) {
            return res.status(401).json({ error: 'AUTH_FAILED', message: 'Invalid username or password.' });
        }
        // Sign the JWT payload
        const token = jsonwebtoken_1.default.sign({ id: user.id, username: user.username }, config_1.CONFIG.JWT_SECRET, { expiresIn: config_1.CONFIG.JWT_EXPIRY });
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                legalBalance: user.legalBalance,
                blackMarketBalance: user.blackMarketBalance,
                reputation: user.reputationScore,
                heat: user.policeHeat,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Authentication process encountered an error.' });
    }
});
exports.default = router;
