import { Router, Response } from 'express';
import { PrismaClient, FuelTankMod } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import { FinanceService } from '../services/finance.service';
import { LockService } from '../services/lock.service';

const router = Router();
const prisma = new PrismaClient();

// Apply auth globally
router.use(authenticateJWT);

/**
 * GET /api/dealership/catalog
 * Returns available truck brands, specs, and details
 */
router.get('/catalog', async (req: AuthRequest, res: Response) => {
  const models = [
    {
      manufacturer: 'Moose',
      brandRepresentation: 'Volvo FH16 Knockoff',
      description: 'Sweden. Extreme structural safety and engine reliability. Heavy-duty towing workhorse.',
      tiers: [
        { name: 'VAN', price: 35000 },
        { name: 'RIGID_MEDIUM', price: 85000 },
        { name: 'RIGID_HEAVY', price: 120000 },
        { name: 'ARTICULATED', price: 190000 },
        { name: 'SUPER_HEAVY', price: 280000 },
      ],
    },
    {
      manufacturer: 'Scarfia',
      brandRepresentation: 'Scania R500 Knockoff',
      description: 'Sweden. Premium styling, top status symbol. High driver comfort and excellent resale value.',
      tiers: [
        { name: 'VAN', price: 40000 },
        { name: 'RIGID_MEDIUM', price: 100000 },
        { name: 'RIGID_HEAVY', price: 140000 },
        { name: 'ARTICULATED', price: 220000 },
        { name: 'SUPER_HEAVY', price: 310000 },
      ],
    },
    {
      manufacturer: 'Guy',
      brandRepresentation: 'MAN Industrial Knockoff',
      description: 'Germany. Modern industrial aerodynamics. Exceptionally low parts wear rates and high efficiency.',
      tiers: [
        { name: 'VAN', price: 30000 },
        { name: 'RIGID_MEDIUM', price: 80000 },
        { name: 'RIGID_HEAVY', price: 110000 },
        { name: 'ARTICULATED', price: 175000 },
        { name: 'SUPER_HEAVY', price: 260000 },
      ],
    },
    {
      manufacturer: 'Myrcedez',
      brandRepresentation: 'Mercedes Actros Knockoff',
      description: 'Germany. Ultimate luxury sleeper cabs. Maximum driver satisfaction reduces long-haul fatigue.',
      tiers: [
        { name: 'VAN', price: 45000 },
        { name: 'RIGID_MEDIUM', price: 95000 },
        { name: 'RIGID_HEAVY', price: 135000 },
        { name: 'ARTICULATED', price: 210000 },
        { name: 'SUPER_HEAVY', price: 300000 },
      ],
    },
    {
      manufacturer: 'TesIo',
      brandRepresentation: 'Tesla Semi Knockoff',
      description: 'USA. Pure electric EV performance. Lightning acceleration, zero emissions, requires home garage charger grids.',
      tiers: [
        { name: 'RIGID_HEAVY', price: 250000 },
        { name: 'ARTICULATED', price: 380000 },
      ],
    },
    {
      manufacturer: 'Lion',
      brandRepresentation: 'Peugeot Lightweight Knockoff',
      description: 'France. Budget light rigids and delivery vans. Low parts costs, but lower overall structural safety.',
      tiers: [
        { name: 'VAN', price: 30000 },
        { name: 'RIGID_MEDIUM', price: 70000 },
      ],
    },
    {
      manufacturer: 'Drasia',
      brandRepresentation: 'Dacia Rugged Knockoff',
      description: 'Romania. Minimalist, cheap, easy-repair rigid. High fuel use, but fixable on road with basic tools.',
      tiers: [
        { name: 'RIGID_MEDIUM', price: 25000 },
        { name: 'RIGID_HEAVY', price: 45000 },
      ],
    },
  ];

  res.json({
    models,
    customizationSpecs: {
      cabs: ['STANDARD', 'EXTENDED', 'SUPER_LONG', 'LUXURY_SLEEPER'],
      payloadTypes: ['DRY', 'REEFER', 'CONSTRUCTION', 'AUTOMOTIVE', 'HAZARDOUS', 'LOGGING', 'ULTRA_HEAVY'],
      tuningTiers: ['STOCK', 'PERFORMANCE', 'ECONOMY', 'RELIABLE'],
    },
  });
});

/**
 * POST /api/dealership/buy
 * Custom purchases a new truck with specified configurations
 */
router.post('/buy', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { manufacturer, tier, cabType, payloadType, tuningTier, garageId } = req.body;

  if (!manufacturer || !tier || !cabType || !payloadType || !tuningTier || !garageId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'All spec properties (manufacturer, tier, cabType, payloadType, tuningTier, garageId) are required.' });
  }

  const lockKey = `company:finance:${companyId}`;

  try {
    await LockService.withLock(lockKey, async () => {
      // 1. Fetch Company & Garage
      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });

      const garage = await prisma.garage.findUnique({
        where: { id: garageId },
        include: { trucks: true },
      });

      if (!company || !garage || garage.companyId !== companyId) {
        res.status(404).json({ error: 'RESOURCES_NOT_FOUND', message: 'Company or target garage not found.' });
        return;
      }

      // 2. Check garage capacity
      if (garage.trucks.length >= garage.capacity) {
        res.status(400).json({ error: 'GARAGE_FULL', message: `Target garage has reached its maximum parking capacity of ${garage.capacity} vehicles.` });
        return;
      }

      // 3. Retrieve base model retail value
      const basePrice = FinanceService.getTruckRetailValue(manufacturer, tier);

      // Customization surcharges:
      let customizationSurcharge = 0;
      if (cabType === 'EXTENDED') customizationSurcharge += 8000;
      if (cabType === 'SUPER_LONG') customizationSurcharge += 18000;
      if (cabType === 'LUXURY_SLEEPER') customizationSurcharge += 28000;

      if (payloadType === 'REEFER') customizationSurcharge += 12000;
      if (payloadType === 'HAZARDOUS') customizationSurcharge += 22000;
      if (payloadType === 'ULTRA_HEAVY') customizationSurcharge += 35000;

      if (tuningTier === 'PERFORMANCE') customizationSurcharge += 10000;
      if (tuningTier === 'ECONOMY') customizationSurcharge += 7000;
      if (tuningTier === 'RELIABLE') customizationSurcharge += 6000;

      let finalCost = basePrice + customizationSurcharge;

      // Check R&D Brand Partnership discount (15% reduction for matched manufacturer)
      if (company.resBrandPartnership.toUpperCase() === manufacturer.toUpperCase()) {
        finalCost *= 0.85; // 15% discount
      }

      if (Number(company.legalBalance) < finalCost) {
        res.status(400).json({
          error: 'INSUFFICIENT_FUNDS',
          message: `Insufficient clean cash to complete purchase. Cost: $${finalCost.toFixed(2)}, Available: $${Number(company.legalBalance).toFixed(2)}`,
        });
        return;
      }

      // 4. Generate random VIN
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let uniqueVin = `VIN-${manufacturer.substring(0, 3).toUpperCase()}-`;
      for (let i = 0; i < 9; i++) {
        uniqueVin += characters.charAt(Math.floor(Math.random() * characters.length));
      }

      // Create new Truck & deduct funds
      const newTruck = await prisma.$transaction(async (tx) => {
        // Deduct
        await tx.company.update({
          where: { id: companyId },
          data: { legalBalance: { decrement: finalCost } },
        });

        // Spawn truck
        const modelName = `${manufacturer} ${tier.replace('_', ' ')} (${tuningTier})`;
        const truck = await tx.truck.create({
          data: {
            companyId,
            garageId,
            model: modelName,
            vin: uniqueVin,
            engineHealth: 100,
            tireWear: 100,
            fuelCapacity: tier.includes('VAN') ? 200.0 : 500.0,
            fuelTankMod: FuelTankMod.STOCK,
            scannerShielding: 0,
            manufacturer,
            tier,
            cabType,
            payloadType,
            tuningTier,
          },
        });

        // Record history
        await tx.truckHistory.create({
          data: {
            truckId: truck.id,
            eventType: 'PURCHASE',
            description: `Purchased customized ${modelName} at brand dealership for $${finalCost.toFixed(2)}. VIN: ${uniqueVin}.`,
          },
        });

        return truck;
      });

      res.status(201).json({
        message: 'SUCCESS: Vehicle customized, registered, and shipped to garage slots!',
        cost: parseFloat(finalCost.toFixed(2)),
        truck: newTruck,
      });
    });
  } catch (error: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

export default router;
