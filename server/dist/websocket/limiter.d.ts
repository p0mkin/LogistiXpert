import { AuthenticatedWebSocket } from './index';
export interface RateLimiterOptions {
    bucketSize: number;
    refillRate: number;
}
/**
 * Token-Bucket Rate Limiter for WebSocket connections.
 * Prevents clients from flooding WS events (bidding, border calculations) to cheat or DDOS.
 */
export declare class WSConnectionLimiter {
    private static LIMITS;
    private static DEFAULT_OPTIONS;
    /**
     * Attempts to consume 1 token for a given client connection.
     * Returns true if allowed, false if rate limit is exceeded.
     */
    static consume(ws: AuthenticatedWebSocket, options?: RateLimiterOptions): boolean;
    /**
     * Cleans up registry limits on disconnect to prevent memory leaks
     */
    static cleanup(userId: string): void;
}
