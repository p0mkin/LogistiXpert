import { AuthenticatedWebSocket } from './index';
export declare class AuctionSocketHandler {
    static handleBid(ws: AuthenticatedWebSocket, payload: any, requestId?: string): Promise<void>;
}
