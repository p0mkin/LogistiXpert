import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import { AnalyticsService } from '../services/analytics.service';

const router = Router();
const prisma = new PrismaClient();

// Protect all analytics routes with JWT authentication
router.use(authenticateJWT);

// 1. GET HISTORICAL DAILY PERFORMANCE REPORTS
router.get('/performance', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const reports = await prisma.dailyPerformanceReport.findMany({
      where: { companyId },
      orderBy: { dateStr: 'desc' },
      take: 30, // Return the last 30 days of data
    });

    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve daily performance reports.' });
  }
});

// 2. GET PERFORMANCE BREAKDOWN METRICS PER TERMINAL/GARAGE
router.get('/terminal-performance', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const reports = await prisma.terminalDailyReport.findMany({
      where: { companyId },
      orderBy: { dateStr: 'desc' },
      take: 100, // Return recent reports across active terminals
    });

    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve terminal daily reports.' });
  }
});

// 3. GET DYNAMIC REMAINING FREIGHT CAPACITIES FOR ALL CITIES
router.get('/city-freight', async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { city } = req.query;

  try {
    const citiesList = [
      'Stockholm', 'Berlin', 'Vilnius', 'Warsaw', 'Tallinn', 'Riga', 'Copenhagen', 'Helsinki', 'Oslo',
      'Siauliai', 'Klaipeda', 'Panevezys', 'Kaunas', 'Bialystok', 'Gdansk',
      'Brest', 'Minsk', 'Kursenai', 'Telsiai', 'Mazeikiai', 'Elektrenai'
    ];

    // If a specific city is queried, filter to just that city
    const targets = city ? [city as string] : citiesList;
    const dateStr = AnalyticsService.getDateStr();

    const result = [];
    for (const targetCity of targets) {
      const remaining = await AnalyticsService.getRemainingFreightCapacity(targetCity, companyId);
      const base = AnalyticsService.getBaseCapacity(targetCity);
      
      const cityDaily = await prisma.cityDailyFreight.findUnique({
        where: { city_dateStr: { city: targetCity, dateStr } },
      });

      result.push({
        city: targetCity,
        baseCapacity: base,
        shippedKg: cityDaily?.shippedKg || 0,
        remainingKg: remaining,
      });
    }

    if (city && result.length === 1) {
      return res.json(result[0]);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve city freight capacities.' });
  }
});

export default router;
