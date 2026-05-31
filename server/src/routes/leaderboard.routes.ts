import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ================================================================
// GET /api/leaderboard/fleet-value
// Top 20 players by combined truck fleet estimated value
// Fleet value = mileage-adjusted model base price * condition multiplier
// ================================================================
router.get('/fleet-value', authenticateJWT, async (_req: AuthRequest, res: Response) => {
  try {
    // Fetch all users with their trucks
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
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

    const ranked = users.map((user) => {
      let fleetValue = 0;
      for (const truck of user.trucks) {
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
        userId: user.id,
        username: user.username,
        truckCount: user.trucks.length,
        fleetValue,
        reputationScore: user.reputationScore,
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
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
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

    const leaderboard = users.map((u, i) => ({
      rank: i + 1,
      userId: u.id,
      username: u.username,
      reputationScore: u.reputationScore,
      policeHeat: u.policeHeat,
      fleetSize: u._count.trucks,
      tier: getTier(u.reputationScore),
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
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        reputationScore: true,
        trucks: { select: { mileage: true } },
      },
    });

    const ranked = users.map((u) => ({
      userId: u.id,
      username: u.username,
      totalMileageKm: u.trucks.reduce((sum, t) => sum + t.mileage, 0),
      truckCount: u.trucks.length,
      reputationScore: u.reputationScore,
    }));

    ranked.sort((a, b) => b.totalMileageKm - a.totalMileageKm);
    const top20 = ranked.slice(0, 20).map((e, i) => ({ rank: i + 1, ...e }));

    return res.json({ leaderboard: top20, updatedAt: new Date() });
  } catch (err) {
    console.error('[Leaderboard] mileage error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ================================================================
// GET /api/leaderboard/heat-index
// Top 20 most wanted — sorted by police heat
// High heat = high visibility = high risk. "Hall of Fame" for reckless players
// ================================================================
router.get('/heat-index', authenticateJWT, async (_req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
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

    const leaderboard = users.map((u, i) => ({
      rank: i + 1,
      userId: u.id,
      username: u.username,
      policeHeat: u.policeHeat,
      reputationScore: u.reputationScore,
      fleetSize: u._count.trucks,
      wantedLevel: getWantedLevel(u.policeHeat),
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
      by: ['highestBidderId'],
      where: {
        status: 'CLOSED_SOLD',
        highestBidderId: { not: null },
      },
      _count: { highestBidderId: true },
      _sum: { currentBid: true },
      orderBy: { _count: { highestBidderId: 'desc' } },
      take: 20,
    });

    // Fetch usernames for the grouped bidder IDs
    const userIds = winners.map((w) => w.highestBidderId!).filter(Boolean);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.username]));

    const leaderboard = winners.map((w, i) => ({
      rank: i + 1,
      userId: w.highestBidderId,
      username: userMap[w.highestBidderId!] ?? 'Unknown',
      auctionWins: w._count.highestBidderId,
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
    const userId = req.user!.id;

    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        reputationScore: true,
        policeHeat: true,
        trucks: { select: { mileage: true, engineHealth: true, tireWear: true, isImpounded: true, model: true } },
      },
    });

    const me = allUsers.find((u) => u.id === userId);
    if (!me) return res.status(404).json({ error: 'USER_NOT_FOUND' });

    const MODEL_BASE_VALUES: Record<string, number> = {
      'Scania R500': 180000, 'Volvo FH16': 200000, 'MAN TGX': 160000,
      'DAF XF': 155000, 'Mercedes Actros': 175000, 'Iveco Stralis': 140000,
    };

    function computeFleetValue(user: typeof allUsers[0]) {
      return user.trucks.reduce((sum, t) => {
        const base = MODEL_BASE_VALUES[t.model] ?? 150000;
        const mileageDep = Math.min(t.mileage / 10000 * 0.01, 0.60);
        const condMod = 0.5 + ((t.engineHealth + t.tireWear) / 200) * 0.5;
        const imp = t.isImpounded ? 0.7 : 1.0;
        return sum + Math.round(base * (1 - mileageDep) * condMod * imp);
      }, 0);
    }

    const fleetValues = allUsers.map((u) => ({ id: u.id, val: computeFleetValue(u) }));
    const totalMiles = allUsers.map((u) => ({ id: u.id, km: u.trucks.reduce((s, t) => s + t.mileage, 0) }));

    fleetValues.sort((a, b) => b.val - a.val);
    const repSorted = [...allUsers].sort((a, b) => b.reputationScore - a.reputationScore);
    const heatSorted = [...allUsers].sort((a, b) => b.policeHeat - a.policeHeat);
    totalMiles.sort((a, b) => b.km - a.km);

    const myFleetRank = fleetValues.findIndex((u) => u.id === userId) + 1;
    const myRepRank = repSorted.findIndex((u) => u.id === userId) + 1;
    const myHeatRank = heatSorted.findIndex((u) => u.id === userId) + 1;
    const myMileageRank = totalMiles.findIndex((u) => u.id === userId) + 1;

    return res.json({
      username: me.username,
      totalPlayers: allUsers.length,
      ranks: {
        fleetValue: { rank: myFleetRank, value: computeFleetValue(me) },
        underworldRep: { rank: myRepRank, value: me.reputationScore },
        heatIndex: { rank: myHeatRank, value: me.policeHeat },
        totalMileage: { rank: myMileageRank, value: me.trucks.reduce((s, t) => s + t.mileage, 0) },
      },
    });
  } catch (err) {
    console.error('[Leaderboard] my-rank error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

export default router;
