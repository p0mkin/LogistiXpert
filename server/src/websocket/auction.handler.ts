import { AuthenticatedWebSocket, GameWebSocketServer } from './index';
import { PlaceBidSchema, makeErrorResponse } from './protocol';
import { AuctionService } from '../services/auction.service';

export class AuctionSocketHandler {
  static async handleBid(ws: AuthenticatedWebSocket, payload: any, requestId?: string) {
    // 1. Verify connection auth payload
    if (!ws.user) {
      ws.send(JSON.stringify(makeErrorResponse('AUTH_REQUIRED', 'Bidder must be authenticated', requestId)));
      return;
    }

    // 2. Validate input schema
    const parsed = PlaceBidSchema.safeParse(payload);
    if (!parsed.success) {
      ws.send(JSON.stringify(makeErrorResponse('INVALID_PAYLOAD', 'Required parameters missing or invalid', requestId)));
      return;
    }

    const { auctionId, amount } = parsed.data;
    const companyId = ws.user.companyId;

    try {
      // 3. Process bid through atomic state engine
      const result = await AuctionService.placeBid(auctionId, companyId, amount);

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
      GameWebSocketServer.broadcast('auction:bid_update', {
        auctionId,
        highestBidderCompanyId: companyId,
        highestBidderCompanyName: result.companyName,
        currentBid: result.newPrice,
        expiresAt: result.expiresAt.toISOString(),
      });

    } catch (error: any) {
      // Handle the various business rule errors from Lua/Redis
      const code = error.message || 'BID_FAILED';
      let message = 'Your bid could not be processed';

      switch (code) {
        case 'COMPANY_NOT_FOUND':
          message = 'Your company profile was not found';
          break;
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
        case 'FLEET_CAPACITY_EXCEEDED':
          message = 'Placing this bid would exceed your total company garage fleet capacity slots';
          break;
      }

      ws.send(JSON.stringify(makeErrorResponse(code, message, requestId)));
    }
  }
}
