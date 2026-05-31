import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config';

const router = Router();
const prisma = new PrismaClient();

// 1. REGISTER NEW PLAYER
router.post('/register', async (req: Request, res: Response) => {
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

    const passwordHash = await bcrypt.hash(password, CONFIG.BCRYPT_ROUNDS);

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
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create player profile.' });
  }
});

// 2. LOGIN & OBTAIN TOKEN
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Username and password are required.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: 'AUTH_FAILED', message: 'Invalid username or password.' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'AUTH_FAILED', message: 'Invalid username or password.' });
    }

    // Sign the JWT payload
    const token = jwt.sign(
      { id: user.id, username: user.username },
      CONFIG.JWT_SECRET,
      { expiresIn: CONFIG.JWT_EXPIRY as any }
    );

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
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Authentication process encountered an error.' });
  }
});

export default router;
