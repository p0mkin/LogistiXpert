import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import { AuctionService } from '../services/auction.service';

const router = Router();
const prisma = new PrismaClient();

// 1. GET ALL ACTIVE AUCTIONS (Public)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const listings = await prisma.auctionListing.findMany({
      where: { status: 'ACTIVE' },
      include: {
        truck: {
          select: {
            id: true,
            model: true,
            vin: true,
            mileage: true,
            engineHealth: true,
            tireWear: true,
            cosmeticHealth: true,
            fuelCapacity: true,
            fuelTankMod: true,
            scannerShielding: true,
            isImpounded: true,
          },
        },
        sellerCompany: {
          select: {
            name: true,
          },
        },
        _count: {
          select: { bidLogs: true }
        }
      },
      orderBy: { expiresAt: 'asc' },
    });

    const formattedListings = listings.map(listing => ({
      ...listing,
      bidCount: listing._count.bidLogs,
      _count: undefined
    }));

    res.json(formattedListings);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve active auctions.' });
  }
});

// 2. CREATE A NEW AUCTION LISTING (Authenticated)
router.post('/', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { truckId, startingPrice, reservePrice, durationMinutes } = req.body;

  if (!truckId || !startingPrice || startingPrice <= 0) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'truckId and a valid startingPrice are required.' });
  }

  const duration = durationMinutes && durationMinutes > 0 ? durationMinutes : 10; // Default 10 minutes listing

  try {
    // 1. Verify ownership of the truck and check state
    const truck = await prisma.truck.findUnique({
      where: { id: truckId },
      include: { activeRoute: true },
    });

    if (!truck || truck.companyId !== companyId) {
      return res.status(404).json({ error: 'TRUCK_NOT_FOUND', message: 'Vehicle does not exist in your fleet.' });
    }

    if (truck.isImpounded) {
      return res.status(400).json({ error: 'TRUCK_IMPOUNDED', message: 'Cannot auction a vehicle currently impounded by the police.' });
    }

    if (truck.activeRoute) {
      return res.status(400).json({ error: 'TRUCK_ON_ROAD', message: 'Cannot auction a vehicle currently dispatched on a route.' });
    }

    // Double check if already listed
    const alreadyListed = await prisma.auctionListing.findFirst({
      where: { truckId, status: 'ACTIVE' },
    });
    if (alreadyListed) {
      return res.status(409).json({ error: 'ALREADY_LISTED', message: 'This vehicle is already listed on the auction house.' });
    }

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + duration);

    // 2. Create the listing
    const listing = await prisma.$transaction(async (tx) => {
      const newListing = await tx.auctionListing.create({
        data: {
          truckId,
          sellerCompanyId: companyId,
          startingPrice,
          currentBid: startingPrice,
          reservePrice: reservePrice || null,
          expiresAt,
          status: 'ACTIVE',
        },
      });

      await tx.truckHistory.create({
        data: {
          truckId,
          eventType: 'AUCTION_LISTING',
          description: `Listed on active auction house. Starting price: $${startingPrice}, Reserve price: $${reservePrice || 'NONE'}. Duration: ${duration} minutes.`,
        },
      });

      return newListing;
    });

    // 3. Cache inside Redis for raw performance and high-frequency WebSocket bid checks!
    await AuctionService.cacheAuction(listing.id);

    // Set a timer inside Node to handle auto-settlement (or a chron schedule could check it)
    setTimeout(() => {
      AuctionService.settleAuction(listing.id).catch((err) => {
        console.error(`[Auction] Auto-settlement error for ${listing.id}:`, err);
      });
    }, duration * 60 * 1000);

    res.status(201).json({
      message: 'Vehicle listed on the live auction block!',
      listingId: listing.id,
      expiresAt: listing.expiresAt,
    });

  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to publish vehicle listing.' });
  }
});

// 3. GET PLAYER'S OWN LISTINGS (Authenticated)
router.get('/my-listings', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  try {
    const listings = await prisma.auctionListing.findMany({
      where: { sellerCompanyId: companyId },
      include: {
        truck: true,
        highestBidderCompany: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve your listings.' });
  }
});

// 4. GET AUCTIONS WHERE USER HAS PLACED BIDS (Authenticated)
router.get('/my-bids', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const companyId = req.user!.companyId;
  try {
    const listings = await prisma.auctionListing.findMany({
      where: {
        bidLogs: {
          some: { bidderCompanyId: companyId },
        },
      },
      include: {
        truck: true,
        sellerCompany: { select: { name: true } },
        highestBidderCompany: { select: { name: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });
    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve your bids.' });
  }
});

// 5. GET AUCTION BID LOG HISTORY (Public / Authenticated)
router.get('/:auctionId/bids', async (req: AuthRequest, res: Response) => {
  const { auctionId } = req.params;
  try {
    const bids = await prisma.auctionBidLog.findMany({
      where: { auctionId },
      include: {
        bidderCompany: {
          select: { name: true },
        },
      },
      orderBy: { amount: 'desc' },
    });
    res.json(bids);
  } catch (error) {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve bid log history.' });
  }
});

export default router;
