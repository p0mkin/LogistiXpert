import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Apply authorization globally
router.use(authenticateJWT);

// 1. GET ALL USER DRIVERS
router.get('/', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  try {
    const drivers = await prisma.driver.findMany({
      where: { companyId },
      include: { assignedTruck: true },
    });
    res.json(drivers);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve driver roster.' });
  }
});

// 2. HIRE A NEW DRIVER (starter recruitment fee)
router.post('/hire', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { name } = req.body;

  const recruitmentCost = 2500; // $2500 legal cash

  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.legalBalance.toNumber() < recruitmentCost) {
      return res.status(400).json({
        error: 'INSUFFICIENT_FUNDS',
        message: `Hiring a new driver card costs $${recruitmentCost} Clean Cash.`,
      });
    }

    // Generate random stats
    const traits = ['BALANCED', 'LEAD_FOOT', 'SLEEP_DEPRIVED', 'LOYAL', 'CHARISMATIC'];
    const randomTrait = traits[Math.floor(Math.random() * traits.length)] as any;
    
    const charisma = Math.floor(Math.random() * 12) + 5; // 5 to 16
    const loyalty = Math.floor(Math.random() * 50) + 40; // 40 to 90

    const firstNames = ['Jonas', 'Andrius', 'Pavel', 'Krzysztof', 'Dmitry', 'Stanislaw', 'Janis', 'Toomas'];
    const lastNames = ['Kazlauskas', 'Kowalski', 'Petrov', 'Novak', 'Sabonis', 'Ozols', 'Ligi', 'Ivanov'];
    const generatedName = name || `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;

    const newDriver = await prisma.$transaction(async (tx) => {
      // Deduct hiring cost from Company
      await tx.company.update({
        where: { id: companyId },
        data: { legalBalance: { decrement: recruitmentCost } },
      });

      return await tx.driver.create({
        data: {
          companyId,
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
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to complete driver hiring contract.' });
  }
});

// 3. ORDER SHIFT REST ROTATION (Tacho & fatigue reset)
router.post('/:driverId/rest', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { driverId } = req.params;
  const { restLocation } = req.body; // 'SCHENGEN_GARAGE' or 'EAST_CABIN'

  try {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { assignedTruck: { include: { activeRoute: true } } },
    });

    if (!driver || driver.companyId !== companyId) {
      return res.status(404).json({ error: 'DRIVER_NOT_FOUND', message: 'Driver card not found in your company roster.' });
    }

    if (driver.assignedTruck?.activeRoute) {
      return res.status(400).json({ error: 'DRIVER_ON_ROAD', message: 'Cannot order rest rotation while driver is dispatched on an active route.' });
    }

    const restFee = restLocation === 'SCHENGEN_GARAGE' ? 250 : 0; // Motels cost clean money, cabin rest is free

    const updated = await prisma.$transaction(async (tx) => {
      if (restFee > 0) {
        const company = await tx.company.findUnique({ where: { id: companyId } });
        if (!company || company.legalBalance.toNumber() < restFee) {
          throw new Error('INSUFFICIENT_REST_FUNDS');
        }
        await tx.company.update({
          where: { id: companyId },
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

  } catch (error: any) {
    if (error.message === 'INSUFFICIENT_REST_FUNDS') {
      return res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: 'You do not have enough Clean Cash to pay motel rest fees.' });
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to process driver rest order.' });
  }
});

// 4. ADMINISTER STIMULANT ("Pop Pills" fatigue override)
router.post('/:driverId/stimulate', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { driverId } = req.params;

  const chemicalCost = 500; // $500 black market cash

  try {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver || driver.companyId !== companyId) {
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

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.blackMarketBalance.toNumber() < chemicalCost) {
      return res.status(400).json({
        error: 'INSUFFICIENT_BLACK_MARKET_FUNDS',
        message: `Chemical stimulants cost $${chemicalCost} Black Market proceeds.`,
      });
    }

    // Apply substance chemical boosting!
    const updated = await prisma.$transaction(async (tx) => {
      // Deduct black market cash from Company
      await tx.company.update({
        where: { id: companyId },
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

  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to process driver stimulant administration.' });
  }
});

// 5. INSTALL TACHO SPOOF ECU HACK (Illegal modification — forges rest log timestamps)
router.post('/:driverId/spoof-tacho', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { driverId } = req.params;

  const spoofCost = 3500; // $3500 Black Market Cash for ECU override module

  try {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { assignedTruck: { include: { activeRoute: true } } },
    });

    if (!driver || driver.companyId !== companyId) {
      return res.status(404).json({ error: 'DRIVER_NOT_FOUND', message: 'Driver not found in your roster.' });
    }

    if (driver.assignedTruck?.activeRoute) {
      return res.status(400).json({
        error: 'DRIVER_ON_ROAD',
        message: 'Cannot install ECU hack while driver is on an active route. Return to garage first.',
      });
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.blackMarketBalance.toNumber() < spoofCost) {
      return res.status(400).json({
        error: 'INSUFFICIENT_BLACK_MARKET_FUNDS',
        message: `Tacho Spoof ECU module costs $${spoofCost} Black Market funds.`,
      });
    }

    // Instantly zeros out the driver's tacho log (forged compliance)
    const updated = await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: { blackMarketBalance: { decrement: spoofCost } },
      });

      const driverUpdate = await tx.driver.update({
        where: { id: driverId },
        data: { tachoHours: 0.0 },
      });

      if (driver.assignedTruckId) {
        await tx.truckHistory.create({
          data: {
            truckId: driver.assignedTruckId,
            eventType: 'TACHO_SPOOF_INSTALLED',
            description: `ILLEGAL MOD: Tacho Spoof ECU hack installed. Tachograph log reset to 0.0h via forged compliance data. If discovered at deep customs scan, truck will be seized. Cost: $${spoofCost} (Black Market Cash).`,
          },
        });
      }

      return driverUpdate;
    });

    res.json({
      message: `Tacho Spoof ECU active. Driver ${driver.name}'s digital tachograph now reads 0.0h — fully compliant on paper. CAUTION: Will trigger immediate seizure if detected at an in-depth customs scan.`,
      driver: updated,
    });

  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to install Tacho Spoof mod.' });
  }
});

// 6. ASSIGN DRIVER TO TRUCK
router.post('/:driverId/assign', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { driverId } = req.params;
  const { truckId } = req.body;

  try {
    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver || driver.companyId !== companyId) {
      return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
    }

    const truck = await prisma.truck.findUnique({ where: { id: truckId } });
    if (!truck || truck.companyId !== companyId) {
      return res.status(404).json({ error: 'TRUCK_NOT_FOUND' });
    }

    if (truck.isImpounded) {
      return res.status(400).json({ error: 'TRUCK_IMPOUNDED', message: 'Cannot assign a driver to an impounded vehicle.' });
    }

    // Unassign any existing driver on that truck
    await prisma.driver.updateMany({
      where: { assignedTruckId: truckId },
      data: { assignedTruckId: null },
    });

    const updated = await prisma.driver.update({
      where: { id: driverId },
      data: { assignedTruckId: truckId },
      include: { assignedTruck: true },
    });

    res.json({ message: `Driver ${driver.name} assigned to ${truck.model}.`, driver: updated });
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to assign driver.' });
  }
});

// 7. UNASSIGN DRIVER
router.post('/:driverId/unassign', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { driverId } = req.params;

  try {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { assignedTruck: { include: { activeRoute: true } } },
    });

    if (!driver || driver.companyId !== companyId) {
      return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
    }

    if (driver.assignedTruck?.activeRoute) {
      return res.status(400).json({ error: 'DRIVER_ON_ROAD', message: 'Cannot unassign a driver on an active route.' });
    }

    const updated = await prisma.driver.update({
      where: { id: driverId },
      data: { assignedTruckId: null },
    });

    res.json({ message: `Driver ${driver.name} unassigned.`, driver: updated });
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to unassign driver.' });
  }
});

export default router;
