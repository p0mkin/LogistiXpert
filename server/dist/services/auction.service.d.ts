import Redis from 'ioredis';
export declare const redis: Redis;
export declare class AuctionService {
    /**
     * Caches an active auction listing into Redis on startup or creation
     */
    static cacheAuction(auctionId: string): Promise<void>;
    /**
     * Executes atomic bid via Redis Lua Script
     */
    static placeBid(auctionId: string, bidderId: string, username: string, amount: number): Promise<{
        status: 'SUCCESS' | 'SUCCESS_EXTENDED';
        expiresAt: Date;
        newPrice: number;
    }>;
    /**
     * Settle expired auctions from Redis to Postgres
     */
    static settleAuction(auctionId: string): Promise<void>;
    /**
     * Starts a continuous background watchdog to sweep and settle expired auctions
     * that might have missed their timer executions (e.g. during server crashes/restarts).
     */
    static startWatchdog(): void;
}
