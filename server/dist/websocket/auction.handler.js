"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuctionSocketHandler = void 0;
const index_1 = require("./index");
const protocol_1 = require("./protocol");
const auction_service_1 = require("../services/auction.service");
class AuctionSocketHandler {
    static async handleBid(ws, payload, requestId) {
        // 1. Verify connection auth payload
        if (!ws.user) {
            ws.send(JSON.stringify((0, protocol_1.makeErrorResponse)('AUTH_REQUIRED', 'Bidder must be authenticated', requestId)));
            return;
        }
        // 2. Validate input schema
        const parsed = protocol_1.PlaceBidSchema.safeParse(payload);
        if (!parsed.success) {
            ws.send(JSON.stringify((0, protocol_1.makeErrorResponse)('INVALID_PAYLOAD', 'Required parameters missing or invalid', requestId)));
            return;
        }
        const { auctionId, amount } = parsed.data;
        const userId = ws.user.id;
        const username = ws.user.username;
        try {
            // 3. Process bid through atomic state engine
            const result = await auction_service_1.AuctionService.placeBid(auctionId, userId, username, amount);
            // 4. Send success receipt back to the sender
            ws.send(JSON.stringify({
                type: 'auction:bid_receipt',
                payload: {
                    auctionId,
                    amount: result.newPrice,
                    expiresAt: result.expiresAt.toISOString(),
                    status: result.status,
                },
                replyTo: requestId,
            }));
            // 5. Broadcast new bid price update to EVERY client globally
            index_1.GameWebSocketServer.broadcast('auction:bid_update', {
                auctionId,
                highestBidderId: userId,
                highestBidderName: username,
                currentBid: result.newPrice,
                expiresAt: result.expiresAt.toISOString(),
            });
        }
        catch (error) {
            // Handle the various business rule errors from Lua/Redis
            const code = error.message || 'BID_FAILED';
            let message = 'Your bid could not be processed';
            switch (code) {
                case 'AUCTION_NOT_FOUND':
                    message = 'Auction listing does not exist';
                    break;
                case 'AUCTION_CLOSED':
                    message = 'This auction has already closed';
                    break;
                case 'AUCTION_EXPIRED':
                    message = 'This auction has expired';
                    break;
                case 'BID_TOO_LOW':
                    message = 'Bid must be higher than the current highest bid';
                    break;
                case 'BID_BELOW_STARTING':
                    message = 'Bid must be equal to or higher than the starting price';
                    break;
                case 'INSUFFICIENT_FUNDS':
                    message = 'You do not have enough legal cash to cover this bid';
                    break;
            }
            ws.send(JSON.stringify((0, protocol_1.makeErrorResponse)(code, message, requestId)));
        }
    }
}
exports.AuctionSocketHandler = AuctionSocketHandler;
