"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const config_1 = require("./config");
const client_1 = require("@prisma/client");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const garage_routes_1 = __importDefault(require("./routes/garage.routes"));
const auction_routes_1 = __importDefault(require("./routes/auction.routes"));
const driver_routes_1 = __importDefault(require("./routes/driver.routes"));
const dispatch_routes_1 = __importDefault(require("./routes/dispatch.routes"));
const laundry_routes_1 = __importDefault(require("./routes/laundry.routes"));
const shop_routes_1 = __importDefault(require("./routes/shop.routes"));
const breakdown_routes_1 = __importDefault(require("./routes/breakdown.routes"));
const leaderboard_routes_1 = __importDefault(require("./routes/leaderboard.routes"));
const error_1 = require("./middleware/error");
const websocket_1 = require("./websocket");
const auction_service_1 = require("./services/auction.service");
const dispatch_service_1 = require("./services/dispatch.service");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const prisma = new client_1.PrismaClient();
// ==========================================
// 1. STANDARD MIDDLEWARES
// ==========================================
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// REST Route mappings
app.use('/api/auth', auth_routes_1.default);
app.use('/api/garage', garage_routes_1.default);
app.use('/api/auction', auction_routes_1.default);
app.use('/api/driver', driver_routes_1.default);
app.use('/api/dispatch', dispatch_routes_1.default);
app.use('/api/laundry', laundry_routes_1.default);
app.use('/api/shop', shop_routes_1.default);
app.use('/api/breakdown', breakdown_routes_1.default);
app.use('/api/leaderboard', leaderboard_routes_1.default);
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', environment: 'production-ready', timestamp: new Date() });
});
// Centralized Global Error Handler Middleware (Appended at the end of routes)
app.use(error_1.errorHandler);
// ==========================================
// 2. REAL-TIME WEBSOCKET SERVER MOUNT
// ==========================================
const wsServer = new websocket_1.GameWebSocketServer(server);
// ==========================================
// 3. BACKGROUND PERSISTENCE WORKER (Redis Stream -> Postgres)
// ==========================================
async function startBidsStreamWorker() {
    console.log('[Worker] Starting background bid stream worker...');
    // Ensure the stream/group exists or handle gracefully
    try {
        await auction_service_1.redis.xgroup('CREATE', 'stream:auction_bids', 'postgres_group', '$', 'MKSTREAM');
    }
    catch (err) {
        // Ignore group already exists
        if (!err.message.includes('BUSYGROUP')) {
            console.error('[Worker] Redis Stream group creation error:', err);
        }
    }
    while (true) {
        try {
            // Read blocking for 5 seconds
            const data = await auction_service_1.redis.xreadgroup('GROUP', 'postgres_group', 'worker_1', 'COUNT', '10', 'BLOCK', '5000', 'STREAMS', 'stream:auction_bids', '>');
            if (!data)
                continue;
            const streamRecords = data[0][1];
            for (const record of streamRecords) {
                const id = record[0];
                const fields = record[1];
                // Parse fields
                const payload = {};
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
                                    bidderId,
                                    amount: parseFloat(amount),
                                },
                            });
                            // 2. Update parent listing high bid
                            await tx.auctionListing.update({
                                where: { id: auctionId },
                                data: {
                                    currentBid: parseFloat(amount),
                                    highestBidderId: bidderId,
                                },
                            });
                        }
                    });
                }
                // Acknowledge stream record processed
                await auction_service_1.redis.xack('stream:auction_bids', 'postgres_group', id);
                await auction_service_1.redis.xdel('stream:auction_bids', id); // Keep memory footprint zero
            }
        }
        catch (error) {
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
        // 2. Clear stale cache in Redis and re-populate from active DB listings
        const activeAuctions = await prisma.auctionListing.findMany({
            where: { status: 'ACTIVE' },
        });
        console.log(`[System] Found ${activeAuctions.length} active auctions in Postgres. Synchronizing cache...`);
        for (const listing of activeAuctions) {
            const now = new Date();
            if (listing.expiresAt <= now) {
                // Auto settle expired on boot
                await auction_service_1.AuctionService.settleAuction(listing.id);
            }
            else {
                await auction_service_1.AuctionService.cacheAuction(listing.id);
                // Schedule auto-expiry settlement
                const remainingMs = listing.expiresAt.getTime() - now.getTime();
                setTimeout(() => {
                    auction_service_1.AuctionService.settleAuction(listing.id).catch((err) => {
                        console.error(`[Auction] Auto-settlement error for ${listing.id}:`, err);
                    });
                }, remainingMs);
            }
        }
        // 3. Spin up write-behind streaming worker
        startBidsStreamWorker();
        // 4. Start active fleet dispatch simulation ticker
        dispatch_service_1.DispatchSimulationService.startTicker();
        // 5. Start live auction house expiry watchdog sweep
        auction_service_1.AuctionService.startWatchdog();
        // 6. Listen HTTP + WebSockets on shared port
        server.listen(config_1.CONFIG.PORT, config_1.CONFIG.HOST, () => {
            console.log(`=================================================`);
            console.log(` TRUCK MANAGER 2026: UNDERWORLD LOGISTICS SERVER `);
            console.log(` Running on: http://${config_1.CONFIG.HOST}:${config_1.CONFIG.PORT}   `);
            console.log(` WebSocket Path: ws://${config_1.CONFIG.HOST}:${config_1.CONFIG.PORT}/ws `);
            console.log(`=================================================`);
        });
    }
    catch (error) {
        console.error('[System] CRITICAL Startup Failure:', error);
        process.exit(1);
    }
}
main();
