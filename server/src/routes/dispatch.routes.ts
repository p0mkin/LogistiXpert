import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import { AnalyticsService } from '../services/analytics.service';

const router = Router();
const prisma = new PrismaClient();

function isContractAllowed(
  terminalLevel: number,
  distanceKm: number,
  cargoWeight: number,
  cargoType?: string
): boolean {
  if (terminalLevel === 1) {
    if (distanceKm >= 200 || cargoWeight >= 10000) {
      return false;
    }
  } else if (terminalLevel === 2) {
    if (distanceKm > 500 || cargoWeight >= 18000) {
      return false;
    }
  } else if (terminalLevel === 3) {
    if (cargoWeight >= 26000) {
      return false;
    }
    if (cargoType === 'STEEL_COILS' || cargoType === 'AGRICULTURAL_MACHINERY') {
      return false;
    }
  }
  return true;
}

// Apply authentication globally
router.use(authenticateJWT);

// 1. GET ALL ACTIVE DISPATCHED FLEET ROUTES
router.get('/active', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  try {
    const active = await prisma.activeRoute.findMany({
      where: { companyId },
      include: {
        truck: true,
        driver: true,
        legalContract: true,
        contrabandJob: true,
      },
    });
    res.json(active);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve active routes.' });
  }
});

// GET AVAILABLE LEGAL CONTRACTS
router.get('/contracts/legal', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { truckId, origin, all } = req.query;

  try {
    let filterOrigin: string | undefined = undefined;
    let targetTruck: any = null;

    if (truckId) {
      const truck = await prisma.truck.findUnique({
        where: { id: truckId as string },
        include: { garage: true },
      });
      if (truck && truck.companyId === companyId) {
        filterOrigin = truck.garage.city;
        targetTruck = truck;
      }
    } else if (origin) {
      filterOrigin = origin as string;
    }

    let contracts;
    if (filterOrigin) {
      contracts = await prisma.legalContract.findMany({
        where: { origin: filterOrigin },
      });
    } else if (all === 'true') {
      contracts = await prisma.legalContract.findMany();
    } else {
      // Default: only contracts originating from any city where the company owns a garage
      const garages = (await prisma.garage.findMany({
        where: { companyId },
        select: { city: true },
      })) || [];
      const garageCities = garages.map((g) => g.city);
      contracts = await prisma.legalContract.findMany({
        where: { origin: { in: garageCities } },
      });
    }

    // Load company garages to determine their terminalLevel
    const companyGarages = await prisma.garage.findMany({
      where: { companyId },
    });
    const garageMap = new Map(companyGarages.map((g) => [g.city.toLowerCase(), g]));

    // Filter contracts based on terminalLevel requirements
    contracts = contracts.filter((c) => {
      const garage = garageMap.get(c.origin.toLowerCase());
      const level = garage?.terminalLevel || 1;

      if (targetTruck) {
        const cargoWeight = AnalyticsService.getCargoWeight(targetTruck.tier);
        return isContractAllowed(level, c.distanceKm, cargoWeight, c.cargoType);
      } else {
        return isContractAllowed(level, c.distanceKm, 4000, c.cargoType);
      }
    });

    res.json(contracts);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve available legal contracts.' });
  }
});

// GET AVAILABLE CONTRABAND JOBS
router.get('/contracts/contraband', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { truckId, origin, all } = req.query;

  try {
    let filterOrigin: string | undefined = undefined;
    let targetTruck: any = null;

    if (truckId) {
      const truck = await prisma.truck.findUnique({
        where: { id: truckId as string },
        include: { garage: true },
      });
      if (truck && truck.companyId === companyId) {
        filterOrigin = truck.garage.city;
        targetTruck = truck;
      }
    } else if (origin) {
      filterOrigin = origin as string;
    }

    let jobs;
    if (filterOrigin) {
      jobs = await prisma.contrabandJob.findMany({
        where: { origin: filterOrigin },
      });
    } else if (all === 'true') {
      jobs = await prisma.contrabandJob.findMany();
    } else {
      // Default: only jobs originating from any city where the company owns a garage
      const garages = (await prisma.garage.findMany({
        where: { companyId },
        select: { city: true },
      })) || [];
      const garageCities = garages.map((g) => g.city);
      jobs = await prisma.contrabandJob.findMany({
        where: { origin: { in: garageCities } },
      });
    }

    // Load company garages to determine their terminalLevel
    const companyGarages = await prisma.garage.findMany({
      where: { companyId },
    });
    const garageMap = new Map(companyGarages.map((g) => [g.city.toLowerCase(), g]));

    // Filter contraband jobs based on terminalLevel requirements (contraband standard distance = 350km)
    jobs = jobs.filter((j) => {
      const garage = garageMap.get(j.origin.toLowerCase());
      const level = garage?.terminalLevel || 1;
      const distanceKm = 350; // standard distance

      if (targetTruck) {
        const cargoWeight = AnalyticsService.getCargoWeight(targetTruck.tier);
        return isContractAllowed(level, distanceKm, cargoWeight);
      } else {
        return isContractAllowed(level, distanceKm, 4000);
      }
    });

    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve available contraband jobs.' });
  }
});

// 2. DISPATCH A TRUCK ON A ROUTE CONTRACT
router.post('/launch', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { truckId, legalContractId, contrabandJobId, autopilotPolicy } = req.body;

  if (!truckId || (!legalContractId && !contrabandJobId)) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Must specify a truckId and either a legalContractId or contrabandJobId.',
    });
  }

  if (autopilotPolicy && !['SAFE', 'AVERAGE', 'GREEDY'].includes(autopilotPolicy)) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Invalid autopilotPolicy. Allowed values: SAFE, AVERAGE, GREEDY.',
    });
  }

  try {
    // 1. Verify truck ownership, check state
    const truck = await prisma.truck.findUnique({
      where: { id: truckId },
      include: { driver: true, activeRoute: true, garage: true },
    });

    if (!truck || truck.companyId !== companyId) {
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
    let cargoType: string | undefined = undefined;

    if (legalContractId) {
      const contract = await prisma.legalContract.findUnique({ where: { id: legalContractId } });
      if (!contract) return res.status(404).json({ error: 'CONTRACT_NOT_FOUND', message: 'Legal contract not found.' });
      origin = contract.origin;
      destination = contract.destination;
      distanceKm = contract.distanceKm;
      cargoType = contract.cargoType;
    } else if (contrabandJobId) {
      const job = await prisma.contrabandJob.findUnique({ where: { id: contrabandJobId } });
      if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND', message: 'Underworld contraband contract not found.' });
      origin = job.origin;
      destination = job.destination;
      // standard distance calculation based on cities connection
      distanceKm = 350; // Brest/Minsk standard smuggles
    }

    const cargoWeight = AnalyticsService.getCargoWeight(truck.tier);

    // Verify remaining city capacity (FREIGHT_SUPPLY_DEPLETED check)
    const remainingCapacity = await AnalyticsService.getRemainingFreightCapacity(origin, companyId);
    if (remainingCapacity < cargoWeight) {
      return res.status(400).json({
        error: 'FREIGHT_SUPPLY_DEPLETED',
        message: `Not enough freight supply in ${origin} today. Remaining capacity: ${remainingCapacity} kg. Your truck requires ${cargoWeight} kg capacity.`,
      });
    }

    // Verify terminal level requirements (TERMINAL_LEVEL_TOO_LOW check)
    const terminalLevel = truck.garage.terminalLevel;
    const isAllowed = isContractAllowed(terminalLevel, distanceKm, cargoWeight, cargoType);
    if (!isAllowed) {
      return res.status(400).json({
        error: 'TERMINAL_LEVEL_TOO_LOW',
        message: `Your terminal level is too low to accept this contract (Terminal Level: ${terminalLevel}, Distance: ${distanceKm} km, Truck weight: ${cargoWeight} kg).`,
      });
    }

    // Base dispatch speed: 70 km/h
    let avgSpeed = 70.0;
    
    // Trait modifiers
    if (driver.trait === 'LEAD_FOOT') avgSpeed += 10.0; // +10 km/h
    if (driver.isStimulated) avgSpeed += 15.0; // pop pills speed boost!

    // Calculate real-world seconds for route transit (1 km = 1 real second for fast gameplay simulation!)
    const transitSeconds = distanceKm; 
    const eta = new Date();
    eta.setSeconds(eta.getSeconds() + transitSeconds);

    // 4. Create Active Route inside database
    const activeRoute = await prisma.$transaction(async (tx) => {
      // Deduct city freight capacity
      await AnalyticsService.recordFreightShipped(tx, origin, cargoWeight);

      // Record daily transaction for route dispatch
      await AnalyticsService.recordTransaction(
        tx,
        companyId,
        truck.garageId,
        origin,
        'ROUTE_DISPATCHED',
        0
      );

      // Manage contract state based on SPOT, LIMITED, or PERSISTENT types
      if (legalContractId) {
        const contract = await tx.legalContract.findUnique({ where: { id: legalContractId } });
        if (contract) {
          if (contract.contractType === 'SPOT') {
            await tx.legalContract.delete({ where: { id: legalContractId } });
          } else if (contract.contractType === 'LIMITED') {
            const newQuota = (contract.remainingQuota || 0) - cargoWeight;
            if (newQuota <= 0) {
              await tx.legalContract.delete({ where: { id: legalContractId } });
            } else {
              await tx.legalContract.update({
                where: { id: legalContractId },
                data: { remainingQuota: newQuota },
              });
            }
          }
        }
      } else if (contrabandJobId) {
        const job = await tx.contrabandJob.findUnique({ where: { id: contrabandJobId } });
        if (job) {
          if (job.contractType === 'SPOT') {
            await tx.contrabandJob.delete({ where: { id: contrabandJobId } });
          } else if (job.contractType === 'LIMITED') {
            const newQuota = (job.remainingQuota || 0) - cargoWeight;
            if (newQuota <= 0) {
              await tx.contrabandJob.delete({ where: { id: contrabandJobId } });
            } else {
              await tx.contrabandJob.update({
                where: { id: contrabandJobId },
                data: { remainingQuota: newQuota },
              });
            }
          }
        }
      }

      const route = await tx.activeRoute.create({
        data: {
          companyId,
          truckId,
          driverId: driver.id,
          legalContractId: legalContractId || null,
          contrabandJobId: contrabandJobId || null,
          progressPct: 0.0,
          eta,
          currentCity: origin,
          isUnderBorderCheck: false,
          autopilotPolicy: autopilotPolicy || 'SAFE',
        },
      });

      // Log dispatch history
      const jobType = contrabandJobId ? 'UNDERWORLD SMUGGLING' : 'LEGAL CONTRACT';
      await tx.truckHistory.create({
        data: {
          truckId,
          eventType: 'ROUTE_DISPATCH',
          description: `Dispatched on ${jobType} from ${origin} to ${destination} (${distanceKm} km). Estimated transit time: ${transitSeconds}s. Driver: ${driver.name}. Autopilot Policy: ${autopilotPolicy || 'SAFE'}.`,
        },
      });

      return route;
    });

    res.status(201).json({
      message: 'Fleet truck dispatched successfully! Track progression in HUD.',
      route: activeRoute,
    });

  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to dispatch route.' });
  }
});

// GET ONE-CLICK SUGGESTED ROUTE FOR A TRUCK
router.get('/suggest-route', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { truckId } = req.query;

  if (!truckId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Must specify a truckId.' });
  }

  try {
    const truck = await prisma.truck.findUnique({
      where: { id: truckId as string },
      include: { company: true, driver: true, garage: true, activeRoute: true },
    });

    if (!truck || truck.companyId !== companyId) {
      return res.status(404).json({ error: 'TRUCK_NOT_FOUND', message: 'Truck not found in your fleet.' });
    }

    if (truck.isImpounded) {
      return res.status(400).json({ error: 'TRUCK_IMPOUNDED', message: 'Vehicle is currently impounded.' });
    }

    if (truck.activeRoute) {
      return res.status(400).json({ error: 'TRUCK_ACTIVE', message: 'This vehicle is already active on a route.' });
    }

    const driver = truck.driver;
    if (!driver) {
      return res.status(400).json({
        error: 'NO_ASSIGNED_DRIVER',
        message: 'No driver is assigned to this truck.',
      });
    }

    // Base speed: 70 km/h
    let avgSpeed = 70.0;
    if (driver.trait === 'LEAD_FOOT') avgSpeed += 10.0;
    if (driver.isStimulated) avgSpeed += 15.0;

    const originCity = truck.garage.city;

    // Fetch all legal contracts and contraband jobs starting at originCity
    const legalContracts = await prisma.legalContract.findMany({
      where: { origin: originCity },
    });

    const contrabandJobs = await prisma.contrabandJob.findMany({
      where: { origin: originCity },
    });

    const candidates: Array<{
      type: 'LEGAL' | 'CONTRABAND';
      id: string;
      cargoType?: string;
      cargoClass?: string;
      origin: string;
      destination: string;
      distanceKm: number;
      payout: number;
      durationHours: number;
      hourlyRate: number;
    }> = [];

    // Process legal
    for (const contract of legalContracts) {
      const distanceKm = contract.distanceKm;
      // apply resAdvancedPacking buff if any
      let payout = contract.payoutLegal.toNumber();
      if (truck.company.resAdvancedPacking > 0) {
        payout = payout * (1.0 + truck.company.resAdvancedPacking * 0.05);
      }
      const durationHours = distanceKm / avgSpeed;
      const hourlyRate = payout / durationHours;

      candidates.push({
        type: 'LEGAL',
        id: contract.id,
        cargoType: contract.cargoType,
        origin: contract.origin,
        destination: contract.destination,
        distanceKm,
        payout,
        durationHours,
        hourlyRate,
      });
    }

    // Process contraband
    for (const job of contrabandJobs) {
      // standard distance for contraband is 350
      const distanceKm = 350;
      const payout = job.payoutBlack.toNumber(); // smuggler focus on black market payouts
      const durationHours = distanceKm / avgSpeed;
      const hourlyRate = payout / durationHours;

      candidates.push({
        type: 'CONTRABAND',
        id: job.id,
        cargoClass: job.cargoClass,
        origin: job.origin,
        destination: job.destination,
        distanceKm,
        payout,
        durationHours,
        hourlyRate,
      });
    }

    if (candidates.length === 0) {
      return res.status(200).json({
        message: 'No available routes originating from this truck\'s terminal location.',
        suggestion: null,
      });
    }

    // Sort by hourly rate descending
    candidates.sort((a, b) => b.hourlyRate - a.hourlyRate);

    // Return the top one
    res.json({
      suggestion: candidates[0],
      allCandidatesCount: candidates.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to suggest route.' });
  }
});

export default router;
