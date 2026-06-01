import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { CONFIG } from '../config';

const prisma = new PrismaClient();
export const redis = new Redis(CONFIG.REDIS_URL);

// Lua Script for Atomic Bid checks and timers.
// Replaces Socket.io/Node standard race-conditions.
// KEYS[1]: 'auction:<auctionId>'
// KEYS[2]: 'auction:<auctionId>:bids' (Sorted Set for bids)
// ARGV[1]: Bid amount (String representing float)
// ARGV[2]: Bidder user ID
// ARGV[3]: Bidder username
// ARGV[4]: Current timestamp (MS epoch)
const PLACE_BID_LUA = `
local status = redis.call('HGET', KEYS[1], 'status')
if not status then
    return redis.error_reply('AUCTION_NOT_FOUND')
end
if status ~= 'ACTIVE' then
    return redis.error_reply('AUCTION_CLOSED')
end

local expires_at = tonumber(redis.call('HGET', KEYS[1], 'expiresAt'))
local current_time = tonumber(ARGV[4])
if current_time >= expires_at then
    redis.call('HSET', KEYS[1], 'status', 'CLOSED_UNSOLD')
    return redis.error_reply('AUCTION_EXPIRED')
end

local top = redis.call('ZRANGE', KEYS[2], -1, -1, 'WITHSCORES')
if #top > 0 then
    local current_high = tonumber(top[2])
    if tonumber(ARGV[1]) <= current_high then
        return redis.error_reply('BID_TOO_LOW')
    end
else
    local start_price = tonumber(redis.call('HGET', KEYS[1], 'startingPrice'))
    if tonumber(ARGV[1]) < start_price then
        return redis.error_reply('BID_BELOW_STARTING')
    end
end

-- Bid is valid. Record in Redis.
local member = ARGV[2] .. ':' .. ARGV[3]
redis.call('ZADD', KEYS[2], ARGV[1], member)
redis.call('HSET', KEYS[1], 'highestBidderId', ARGV[2])
redis.call('HSET', KEYS[1], 'currentBid', ARGV[1])

-- Anti-sniping system: If bid placed within last 15s, extend by 15s
local remaining = expires_at - current_time
if remaining < 15000 then
    local new_expiry = current_time + 15000
    redis.call('HSET', KEYS[1], 'expiresAt', tostring(new_expiry))
    return { 'OK_EXTENDED', tostring(new_expiry) }
end

return { 'OK', tostring(expires_at) }
`;

// Register the custom Lua command with ioredis on startup
redis.defineCommand('placeBidAtomic', {
  numberOfKeys: 2,
  lua: PLACE_BID_LUA,
});

export class AuctionService {
  /**
   * Caches an active auction listing into Redis on startup or creation
   */
  static async cacheAuction(auctionId: string): Promise<void> {
    const auction = await prisma.auctionListing.findUnique({
      where: { id: auctionId },
      include: { truck: true },
    });

    if (!auction || auction.status !== 'ACTIVE') return;

    const key = `auction:${auction.id}`;
    await redis.hset(key, {
      id: auction.id,
      truckId: auction.truckId,
      sellerId: auction.sellerCompanyId,
      startingPrice: auction.startingPrice.toString(),
      currentBid: auction.currentBid.toString(),
      highestBidderId: auction.highestBidderCompanyId || '',
      expiresAt: auction.expiresAt.getTime().toString(),
      status: 'ACTIVE',
    });

    // If there is an existing bid, seed the sorted set
    if (auction.highestBidderCompanyId) {
      const bidder = await prisma.company.findUnique({ where: { id: auction.highestBidderCompanyId } });
      const member = `${auction.highestBidderCompanyId}:${bidder?.name || 'unknown'}`;
      await redis.zadd(`auction:${auction.id}:bids`, auction.currentBid.toString(), member);
    }
  }

  /**
   * Executes atomic bid via Redis Lua Script
   */
  static async placeBid(
    auctionId: string,
    companyId: string,
    amount: number
  ): Promise<{ status: 'SUCCESS' | 'SUCCESS_EXTENDED'; expiresAt: Date; newPrice: number; companyName: string }> {
    // 1. Fetch company to verify existence and check legal balance
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new Error('COMPANY_NOT_FOUND');
    }

    if (company.legalBalance.toNumber() < amount) {
      throw new Error('INSUFFICIENT_FUNDS');
    }

    // 2. Validate fleet slot capacity loophole check
    const garages = await prisma.garage.findMany({
      where: { companyId },
      select: { capacity: true },
    });
    const totalCapacity = garages.reduce((sum, g) => sum + g.capacity, 0);

    const ownedTrucksCount = await prisma.truck.count({
      where: { companyId },
    });

    const otherBidsCount = await prisma.auctionListing.count({
      where: {
        status: 'ACTIVE',
        highestBidderCompanyId: companyId,
        id: { not: auctionId },
      },
    });

    if (ownedTrucksCount + otherBidsCount + 1 > totalCapacity) {
      throw new Error('FLEET_CAPACITY_EXCEEDED');
    }

    const key = `auction:${auctionId}`;
    const bidKey = `auction:${auctionId}:bids`;
    const now = Date.now();

    // Call the custom Lua script
    const result = await (redis as any).placeBidAtomic(key, bidKey, amount.toString(), companyId, company.name, now.toString());
    const responseType = result[0];
    const newExpiresAt = new Date(parseInt(result[1], 10));

    // Async write-behind queue: push to background stream for Postgres persistence
    // This decouples the real-time bid from the PostgreSQL database bottlenecks!
    await redis.xadd('stream:auction_bids', '*', 
      'auctionId', auctionId, 
      'bidderId', companyId, 
      'amount', amount.toString(), 
      'expiresAt', result[1]
    );

    return {
      status: responseType === 'OK_EXTENDED' ? 'SUCCESS_EXTENDED' : 'SUCCESS',
      expiresAt: newExpiresAt,
      newPrice: amount,
      companyName: company.name,
    };
  }

  /**
   * Settle expired auctions from Redis to Postgres
   */
  static async settleAuction(auctionId: string): Promise<void> {
    const key = `auction:${auctionId}`;
    const data = await redis.hgetall(key);
    
    if (!data.id) return;

    const highestBidderCompanyId = data.highestBidderId || null;
    const finalBid = parseFloat(data.currentBid);
    const expiresAt = new Date(parseInt(data.expiresAt, 10));

    await prisma.$transaction(async (tx) => {
      const listing = await tx.auctionListing.findUnique({
        where: { id: auctionId },
        include: { truck: true },
      });

      if (!listing || listing.status !== 'ACTIVE') return;

      if (!highestBidderCompanyId) {
        // Closed unsold
        await tx.auctionListing.update({
          where: { id: auctionId },
          data: { status: 'CLOSED_UNSOLD', settledAt: new Date() },
        });
        
        await tx.truckHistory.create({
          data: {
            truckId: listing.truckId,
            eventType: 'AUCTION_UNSOLD',
            description: `Auction expired with no bids. Returned to garage.`,
          },
        });

        // Broadcast expired unsold event
        try {
          const { GameWebSocketServer } = await import('../websocket');
          GameWebSocketServer.broadcast('auction:settled', {
            auctionId,
            status: 'CLOSED_UNSOLD',
            winnerCompanyId: null,
            winnerCompanyName: null,
            winnerUsername: null,
            currentBid: finalBid,
          });
        } catch (wsErr) {
          console.error('[Auction] Failed to broadcast unsold settlement:', wsErr);
        }
      } else {
        // Double check balance of the winner inside ACID transaction
        const winner = await tx.company.findUnique({ where: { id: highestBidderCompanyId } });
        if (!winner || winner.legalBalance.toNumber() < finalBid) {
          // Default: Closed unsold due to bidder default (NSF)
          await tx.auctionListing.update({
            where: { id: auctionId },
            data: { status: 'CLOSED_UNSOLD', settledAt: new Date() },
          });
          return;
        }

        // Deduct from buyer
        await tx.company.update({
          where: { id: highestBidderCompanyId },
          data: { legalBalance: { decrement: finalBid } },
        });

        // Credit to seller (minus 5% brokerage fee)
        const commission = finalBid * 0.05;
        const payout = finalBid - commission;
        await tx.company.update({
          where: { id: listing.sellerCompanyId },
          data: { legalBalance: { increment: payout } },
        });

        // Transfer truck ownership
        await tx.truck.update({
          where: { id: listing.truckId },
          data: { companyId: highestBidderCompanyId },
        });

        // Finalize listing
        await tx.auctionListing.update({
          where: { id: auctionId },
          data: {
            status: 'CLOSED_SOLD',
            highestBidderCompanyId,
            currentBid: finalBid,
            settledAt: new Date(),
          },
        });

        // Add history records
        await tx.truckHistory.create({
          data: {
            truckId: listing.truckId,
            eventType: 'AUCTION_SALE',
            description: `Sold in live auction by Company ${listing.sellerCompanyId} to Company ${highestBidderCompanyId} for $${finalBid}. Broker fee: $${commission}.`,
          },
        });

        // Broadcast successful sold event
        try {
          const { GameWebSocketServer } = await import('../websocket');
          GameWebSocketServer.broadcast('auction:settled', {
            auctionId,
            status: 'CLOSED_SOLD',
            winnerCompanyId: highestBidderCompanyId,
            winnerCompanyName: winner.name,
            winnerUsername: winner.name, // Support legacy client usernames
            currentBid: finalBid,
          });
        } catch (wsErr) {
          console.error('[Auction] Failed to broadcast sold settlement:', wsErr);
        }
      }
    });

    // Clear Redis Cache
    await redis.del(key);
    await redis.del(`auction:${auctionId}:bids`);
  }

  /**
   * Starts a continuous background watchdog to sweep and settle expired auctions
   * that might have missed their timer executions (e.g. during server crashes/restarts).
   */
  static startWatchdog() {
    console.log('[Auction] Starting active listings expiry watchdog...');
    setInterval(async () => {
      try {
        const now = new Date();
        const expiredListings = await prisma.auctionListing.findMany({
          where: {
            status: 'ACTIVE',
            expiresAt: { lte: now }
          },
          select: { id: true }
        });

        if (expiredListings.length > 0) {
          console.log(`[Auction Watchdog] Found ${expiredListings.length} expired auctions to settle.`);
          for (const listing of expiredListings) {
            await this.settleAuction(listing.id);
          }
        }
      } catch (error) {
        console.error('[Auction Watchdog] Error checking expired listings:', error);
      }
    }, 10000); // Run every 10 seconds
  }
}
