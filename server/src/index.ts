import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { CONFIG } from './config';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth.routes';
import garageRoutes from './routes/garage.routes';
import auctionRoutes from './routes/auction.routes';
import driverRoutes from './routes/driver.routes';
import dispatchRoutes from './routes/dispatch.routes';
import laundryRoutes from './routes/laundry.routes';
import shopRoutes from './routes/shop.routes';
import breakdownRoutes from './routes/breakdown.routes';
import leaderboardRoutes from './routes/leaderboard.routes';
import commodityRoutes from './routes/commodity.routes';
import financeRoutes from './routes/finance.routes';
import dealershipRoutes from './routes/dealership.routes';
import analyticsRoutes from './routes/analytics.routes';
import researchRoutes from './routes/research.routes';
import { errorHandler } from './middleware/error';
import { GameWebSocketServer } from './websocket';
import { redis, AuctionService } from './services/auction.service';
import { DispatchSimulationService } from './services/dispatch.service';
import { ContractService } from './services/contract.service';
import { CommodityMarketService } from './services/commodity.service';
import { FinanceService } from './services/finance.service';
import { seedDatabase } from './seed';

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();

// ==========================================
// 1. STANDARD MIDDLEWARES
// ==========================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// Serve static web client files if available
const webPath = path.resolve(__dirname, '../../web');
const webPathDev = path.resolve(__dirname, '../web');
app.use(express.static(webPath));
app.use(express.static(webPathDev));

// REST Route mappings
app.use('/api/auth', authRoutes);
app.use('/api/garage', garageRoutes);
app.use('/api/auction', auctionRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/laundry', laundryRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/breakdown', breakdownRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/commodity', commodityRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/dealership', dealershipRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', environment: 'production-ready', timestamp: new Date() });
});

// Centralized Global Error Handler Middleware (Appended at the end of routes)
app.use(errorHandler);

// ==========================================
// 2. REAL-TIME WEBSOCKET SERVER MOUNT
// ==========================================
const wsServer = new GameWebSocketServer(server);

// ==========================================
// 3. BACKGROUND PERSISTENCE WORKER (Redis Stream -> Postgres)
// ==========================================
async function startBidsStreamWorker() {
  console.log('[Worker] Starting background bid stream worker...');
  
  // Ensure the stream/group exists or handle gracefully
  try {
    await redis.xgroup('CREATE', 'stream:auction_bids', 'postgres_group', '$', 'MKSTREAM');
  } catch (err: any) {
    // Ignore group already exists
    if (!err.message.includes('BUSYGROUP')) {
      console.error('[Worker] Redis Stream group creation error:', err);
    }
  }

  while (true) {
    try {
      // Read blocking for 5 seconds
      const data = await redis.xreadgroup(
        'GROUP', 'postgres_group', 'worker_1',
        'COUNT', '10',
        'BLOCK', '5000',
        'STREAMS', 'stream:auction_bids', '>'
      );

      if (!data) continue;

      const streamRecords = (data as any)[0][1];
      
      for (const record of streamRecords) {
        const id = record[0];
        const fields = record[1];
        
        // Parse fields
        const payload: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          payload[fields[i]] = fields[i + 1];
        }

        const { auctionId, bidderId, amount } = payload;

        if (auctionId && bidderId && amount) {
          // Write to PostgreSQL inside transaction-safe structure
          await prisma.$transaction(async (tx) => {
            // Check if listing still exists and valid
            const listing = await tx.auctionListing.findUnique({ where: { id: auctionId } });
            
            if (listing && listing.status === 'ACTIVE') {
              // 1. Record bid log
              await tx.auctionBidLog.create({
                data: {
                  auctionId,
                  bidderCompanyId: bidderId,
                  amount: parseFloat(amount),
                },
              });

              // 2. Update parent listing high bid
              await tx.auctionListing.update({
                where: { id: auctionId },
                data: {
                  currentBid: parseFloat(amount),
                  highestBidderCompanyId: bidderId,
                },
              });
            }
          });
        }

        // Acknowledge stream record processed
        await redis.xack('stream:auction_bids', 'postgres_group', id);
        await redis.xdel('stream:auction_bids', id); // Keep memory footprint zero
      }
    } catch (error) {
      console.error('[Worker] Error draining bids stream to Postgres:', error);
      // Backoff on connection error
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

// ==========================================
// 4. SERVER SYSTEM STARTUP
// ==========================================
async function main() {
  try {
    // 1. Establish database connection check
    await prisma.$connect();
    console.log('[System] Connected securely to PostgreSQL Database.');

    // 1.2. Run automatic database seeding if fresh DB
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('[System] Fresh database detected. Auto-seeding starting data...');
      await seedDatabase(prisma);
    }

    // 1.5. Seed and start global commodity market
    await CommodityMarketService.seedMarketPrices();
    CommodityMarketService.startPricingEngine();

    // 2. Clear stale cache in Redis and re-populate from active DB listings
    const activeAuctions = await prisma.auctionListing.findMany({
      where: { status: 'ACTIVE' },
    });

    console.log(`[System] Found ${activeAuctions.length} active auctions in Postgres. Synchronizing cache...`);
    for (const listing of activeAuctions) {
      const now = new Date();
      if (listing.expiresAt <= now) {
        // Auto settle expired on boot
        await AuctionService.settleAuction(listing.id);
      } else {
        await AuctionService.cacheAuction(listing.id);
        
        // Schedule auto-expiry settlement
        const remainingMs = listing.expiresAt.getTime() - now.getTime();
        setTimeout(() => {
          AuctionService.settleAuction(listing.id).catch((err: any) => {
            console.error(`[Auction] Auto-settlement error for ${listing.id}:`, err);
          });
        }, remainingMs);
      }
    }

    // 3. Spin up write-behind streaming worker
    startBidsStreamWorker();

    // 4. Start active fleet dispatch simulation ticker
    DispatchSimulationService.startTicker();

    // 4.1. Start active corporate financial ticker
    FinanceService.startTicker();

    // 4.5. Start contract job board regenerator
    ContractService.startGenerator();

    // 5. Start live auction house expiry watchdog sweep
    AuctionService.startWatchdog();

    // 6. Listen HTTP + WebSockets on shared port
    server.listen(CONFIG.PORT, CONFIG.HOST, () => {
      console.log(`=================================================`);
      console.log(` TRUCK MANAGER 2026: UNDERWORLD LOGISTICS SERVER `);
      console.log(` Running on: http://${CONFIG.HOST}:${CONFIG.PORT}   `);
      console.log(` WebSocket Path: ws://${CONFIG.HOST}:${CONFIG.PORT}/ws `);
      console.log(`=================================================`);
    });

  } catch (error) {
    console.error('[System] CRITICAL Startup Failure:', error);
    process.exit(1);
  }
}

main();
