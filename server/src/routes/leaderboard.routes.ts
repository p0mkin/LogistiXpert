import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ================================================================
// GET /api/leaderboard/fleet-value
// Top 20 companies by combined truck fleet estimated value
// Fleet value = mileage-adjusted model base price * condition multiplier
// ================================================================
router.get('/fleet-value', authenticateJWT, async (_req: AuthRequest, res: Response) => {
  try {
    // Fetch all companies with their trucks
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        reputationScore: true,
        trucks: {
          select: {
            model: true,
            mileage: true,
            engineHealth: true,
            tireWear: true,
            isImpounded: true,
          },
        },
      },
    });

    // Base values by model tier (rough approximations)
    const MODEL_BASE_VALUES: Record<string, number> = {
      'Scania R500': 180000,
      'Volvo FH16': 200000,
      'MAN TGX': 160000,
      'DAF XF': 155000,
      'Mercedes Actros': 175000,
      'Iveco Stralis': 140000,
    };

    const ranked = companies.map((company) => {
      let fleetValue = 0;
      for (const truck of company.trucks) {
        const base = MODEL_BASE_VALUES[truck.model] ?? 150000;
        // Depreciation: lose 1% per 10,000km (max 60% depreciation)
        const mileageDepreciation = Math.min(truck.mileage / 10000 * 0.01, 0.60);
        // Condition modifier: poor engine/tires further devalue
        const conditionScore = ((truck.engineHealth + truck.tireWear) / 200);
        const conditionMod = 0.5 + conditionScore * 0.5; // 50% floor
        // Impounded trucks lose 30% extra while in custody
        const impoundPenalty = truck.isImpounded ? 0.7 : 1.0;

        fleetValue += Math.round(base * (1 - mileageDepreciation) * conditionMod * impoundPenalty);
      }

      return {
        companyId: company.id,
        companyName: company.name,
        truckCount: company.trucks.length,
        fleetValue,
        reputationScore: company.reputationScore,
      };
    });

    ranked.sort((a, b) => b.fleetValue - a.fleetValue);
    const top20 = ranked.slice(0, 20).map((entry, i) => ({ rank: i + 1, ...entry }));

    return res.json({ leaderboard: top20, updatedAt: new Date() });
  } catch (err) {
    console.error('[Leaderboard] fleet-value error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ================================================================
// GET /api/leaderboard/underworld-rep
// Top 20 by reputationScore (underworld credibility)
// ================================================================
router.get('/underworld-rep', authenticateJWT, async (_req: AuthRequest, res: Response) => {
  try {
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        reputationScore: true,
        policeHeat: true,
        _count: { select: { trucks: true } },
      },
      orderBy: { reputationScore: 'desc' },
      take: 20,
    });

    // Assign prestige tier based on rep
    function getTier(rep: number): string {
      if (rep >= 5000) return '💀 LEGEND';
      if (rep >= 2000) return '🔥 KINGPIN';
      if (rep >= 1000) return '🕶️ OPERATOR';
      if (rep >= 400) return '🚛 RUNNER';
      if (rep >= 100) return '📦 MULE';
      return '🐣 ROOKIE';
    }

    const leaderboard = companies.map((c, i) => ({
      rank: i + 1,
      companyId: c.id,
      companyName: c.name,
      reputationScore: c.reputationScore,
      policeHeat: c.policeHeat,
      fleetSize: c._count.trucks,
      tier: getTier(c.reputationScore),
    }));

    return res.json({ leaderboard, updatedAt: new Date() });
  } catch (err) {
    console.error('[Leaderboard] underworld-rep error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ================================================================
// GET /api/leaderboard/mileage
// Top 20 by total distance driven across entire fleet
// ================================================================
router.get('/mileage', authenticateJWT, async (_req: AuthRequest, res: Response) => {
  try {
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        reputationScore: true,
        trucks: { select: { mileage: true } },
      },
    });

    const top20Buf: Array<{ c: typeof companies[0], totalMileageKm: number }> = [];

    for (let i = 0; i < companies.length; i++) {
      const c = companies[i];
      let totalMileageKm = 0;
      for (let j = 0; j < c.trucks.length; j++) {
        totalMileageKm += c.trucks[j].mileage;
      }

      if (top20Buf.length < 20) {
        top20Buf.push({ c, totalMileageKm });
        // Sort explicitly when building up the initial 20.
        // Use ID as a deterministic tie-breaker for companies with identical mileage.
        top20Buf.sort((a, b) => {
          if (b.totalMileageKm !== a.totalMileageKm) {
            return b.totalMileageKm - a.totalMileageKm;
          }
          return a.c.id < b.c.id ? -1 : (a.c.id > b.c.id ? 1 : 0);
        });
      } else {
        const last = top20Buf[19];
        const isBetter = totalMileageKm > last.totalMileageKm ||
                         (totalMileageKm === last.totalMileageKm && c.id < last.c.id);

        if (isBetter) {
          let insertIdx = 19;
          while (insertIdx > 0) {
            const prev = top20Buf[insertIdx - 1];
            if (totalMileageKm > prev.totalMileageKm ||
               (totalMileageKm === prev.totalMileageKm && c.id < prev.c.id)) {
              insertIdx--;
            } else {
              break;
            }
          }

          // Shift down to make room
          for (let j = 19; j > insertIdx; j--) {
            top20Buf[j] = top20Buf[j - 1];
          }
          top20Buf[insertIdx] = { c, totalMileageKm };
        }
      }
    }

    const top20 = top20Buf.map((e, i) => ({
      rank: i + 1,
      companyId: e.c.id,
      companyName: e.c.name,
      totalMileageKm: e.totalMileageKm,
      truckCount: e.c.trucks.length,
      reputationScore: e.c.reputationScore,
    }));

    return res.json({ leaderboard: top20, updatedAt: new Date() });
  } catch (err) {
    console.error('[Leaderboard] mileage error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ================================================================
// GET /api/leaderboard/heat-index
// Top 20 most wanted — sorted by police heat
// High heat = high visibility = high risk
// ================================================================
router.get('/heat-index', authenticateJWT, async (_req: AuthRequest, res: Response) => {
  try {
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        policeHeat: true,
        reputationScore: true,
        _count: { select: { trucks: true } },
      },
      orderBy: { policeHeat: 'desc' },
      take: 20,
    });

    function getWantedLevel(heat: number): string {
      if (heat >= 90) return '☢️ EXTREME THREAT';
      if (heat >= 70) return '🔴 MOST WANTED';
      if (heat >= 50) return '🟠 HIGH ALERT';
      if (heat >= 30) return '🟡 SUSPICIOUS';
      if (heat >= 10) return '🟢 LOW PROFILE';
      return '⚪ CLEAN RECORD';
    }

    const leaderboard = companies.map((c, i) => ({
      rank: i + 1,
      companyId: c.id,
      companyName: c.name,
      policeHeat: c.policeHeat,
      reputationScore: c.reputationScore,
      fleetSize: c._count.trucks,
      wantedLevel: getWantedLevel(c.policeHeat),
    }));

    return res.json({ leaderboard, updatedAt: new Date() });
  } catch (err) {
    console.error('[Leaderboard] heat-index error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ================================================================
// GET /api/leaderboard/auction-wins
// Top 20 by number of auction listings won (buying activity)
// ================================================================
router.get('/auction-wins', authenticateJWT, async (_req: AuthRequest, res: Response) => {
  try {
    const winners = await prisma.auctionListing.groupBy({
      by: ['highestBidderCompanyId'],
      where: {
        status: 'CLOSED_SOLD',
        highestBidderCompanyId: { not: null },
      },
      _count: { highestBidderCompanyId: true },
      _sum: { currentBid: true },
      orderBy: { _count: { highestBidderCompanyId: 'desc' } },
      take: 20,
    });

    // Fetch usernames for the grouped bidder IDs
    const companyIds = winners.map((w) => w.highestBidderCompanyId!).filter(Boolean);
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
    });
    const companyMap = Object.fromEntries(companies.map((c) => [c.id, c.name]));

    const leaderboard = winners.map((w, i) => ({
      rank: i + 1,
      companyId: w.highestBidderCompanyId,
      companyName: companyMap[w.highestBidderCompanyId!] ?? 'Unknown',
      auctionWins: w._count.highestBidderCompanyId,
      totalSpentLegal: w._sum.currentBid?.toNumber() ?? 0,
    }));

    return res.json({ leaderboard, updatedAt: new Date() });
  } catch (err) {
    console.error('[Leaderboard] auction-wins error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ================================================================
// GET /api/leaderboard/my-rank
// Returns the caller's rank position across ALL leaderboard categories
// ================================================================
router.get('/my-rank', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.user!.companyId;

    const allCompanies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        reputationScore: true,
        policeHeat: true,
        trucks: { select: { mileage: true, engineHealth: true, tireWear: true, isImpounded: true, model: true } },
      },
    });

    const me = allCompanies.find((c) => c.id === companyId);
    if (!me) return res.status(404).json({ error: 'COMPANY_NOT_FOUND' });

    const MODEL_BASE_VALUES: Record<string, number> = {
      'Scania R500': 180000, 'Volvo FH16': 200000, 'MAN TGX': 160000,
      'DAF XF': 155000, 'Mercedes Actros': 175000, 'Iveco Stralis': 140000,
    };

    function computeFleetValue(company: typeof allCompanies[0]) {
      return company.trucks.reduce((sum, t) => {
        const base = MODEL_BASE_VALUES[t.model] ?? 150000;
        const mileageDep = Math.min(t.mileage / 10000 * 0.01, 0.60);
        const condMod = 0.5 + ((t.engineHealth + t.tireWear) / 200) * 0.5;
        const imp = t.isImpounded ? 0.7 : 1.0;
        return sum + Math.round(base * (1 - mileageDep) * condMod * imp);
      }, 0);
    }

    const meFleetValue = computeFleetValue(me);
    const meTotalMileage = me.trucks.reduce((s, t) => s + t.mileage, 0);

    let myFleetRank = 1;
    let myRepRank = 1;
    let myHeatRank = 1;
    let myMileageRank = 1;

    for (const company of allCompanies) {
      const companyFleetValue = computeFleetValue(company);
      if (
        companyFleetValue > meFleetValue ||
        (companyFleetValue === meFleetValue && company.id < companyId)
      ) {
        myFleetRank++;
      }

      if (
        company.reputationScore > me.reputationScore ||
        (company.reputationScore === me.reputationScore && company.id < companyId)
      ) {
        myRepRank++;
      }

      if (
        company.policeHeat > me.policeHeat ||
        (company.policeHeat === me.policeHeat && company.id < companyId)
      ) {
        myHeatRank++;
      }

      const companyTotalMileage = company.trucks.reduce((s, t) => s + t.mileage, 0);
      if (
        companyTotalMileage > meTotalMileage ||
        (companyTotalMileage === meTotalMileage && company.id < companyId)
      ) {
        myMileageRank++;
      }
    }

    return res.json({
      companyName: me.name,
      totalCompanies: allCompanies.length,
      ranks: {
        fleetValue: { rank: myFleetRank, value: meFleetValue },
        underworldRep: { rank: myRepRank, value: me.reputationScore },
        heatIndex: { rank: myHeatRank, value: me.policeHeat },
        totalMileage: { rank: myMileageRank, value: meTotalMileage },
      },
    });
  } catch (err) {
    console.error('[Leaderboard] my-rank error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

export default router;
