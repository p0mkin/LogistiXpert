import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config';
import { seedDatabase } from '../seed';
import { generateSecureVin } from '../utils/vinGenerator';

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
        },
      });

      // 1. Create Starter Company
      const company = await tx.company.create({
        data: {
          name: `${username} Logistics`,
          legalBalance: 50000.00,
          blackMarketBalance: 0.00,
        }
      });

      // 2. Link User to Company as Owner
      await tx.companyMember.create({
        data: {
          userId: newUser.id,
          companyId: company.id,
          role: 'OWNER'
        }
      });

      // 3. Starter Garage
      const garage = await tx.garage.create({
        data: {
          companyId: company.id,
          city: 'Kaunas',
          capacity: 3,
        },
      });

      // 4. Generate initial VIN and Starter Truck
      const starterVin = generateSecureVin('TRK-');
      await tx.truck.create({
        data: {
          companyId: company.id,
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
      message: 'Player registered successfully. Starter company (Kaunas Garage + Scania truck) allocated!',
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
    const user = await prisma.user.findUnique({ 
      where: { username },
      include: {
        companyMemberships: {
          include: { company: true },
          take: 1
        }
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'AUTH_FAILED', message: 'Invalid username or password.' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'AUTH_FAILED', message: 'Invalid username or password.' });
    }

    const primaryCompany = user.companyMemberships[0]?.company;
    if (!primaryCompany) {
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'User has no associated company.' });
    }

    // Sign the JWT payload with companyId
    const token = jwt.sign(
      { id: user.id, username: user.username, companyId: primaryCompany.id },
      CONFIG.JWT_SECRET,
      { expiresIn: CONFIG.JWT_EXPIRY as any }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        companyId: primaryCompany.id,
        companyName: primaryCompany.name,
        legalBalance: primaryCompany.legalBalance,
        blackMarketBalance: primaryCompany.blackMarketBalance,
        reputation: primaryCompany.reputationScore,
        heat: primaryCompany.policeHeat,
      },
    });

  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to authenticate.' });
  }
});

// 3. FORCE SEED SYSTEM DATABASE (SECURE DEVELOPMENT ENDPOINT)
router.post('/force-seed', async (req: Request, res: Response) => {
  const { secretKey } = req.body;
  if (secretKey !== 'super-secret-force-seed-key-1337') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Invalid secret key.' });
  }

  try {
    await seedDatabase(prisma);
    res.json({ message: 'Database successfully forced to re-seed!' });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message || 'Seeding failed.' });
  }
});

export default router;
