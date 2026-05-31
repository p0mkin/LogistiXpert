"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSConnectionLimiter = void 0;
/**
 * Token-Bucket Rate Limiter for WebSocket connections.
 * Prevents clients from flooding WS events (bidding, border calculations) to cheat or DDOS.
 */
class WSConnectionLimiter {
    static LIMITS = new Map();
    // Default: Max 10 messages burst, refill 2 messages per second
    static DEFAULT_OPTIONS = {
        bucketSize: 10,
        refillRate: 2,
    };
    /**
     * Attempts to consume 1 token for a given client connection.
     * Returns true if allowed, false if rate limit is exceeded.
     */
    static consume(ws, options = this.DEFAULT_OPTIONS) {
        if (!ws.user)
            return true; // Ignore unauthenticated (they will be closed anyway)
        const key = ws.user.id;
        const now = Date.now();
        const state = this.LIMITS.get(key) || { tokens: options.bucketSize, lastRefill: now };
        // 1. Calculate refilled tokens based on elapsed time
        const elapsedSeconds = (now - state.lastRefill) / 1000;
        const refilledTokens = elapsedSeconds * options.refillRate;
        state.tokens = Math.min(options.bucketSize, state.tokens + refilledTokens);
        state.lastRefill = now;
        // 2. Check token availability
        if (state.tokens >= 1) {
            state.tokens -= 1;
            this.LIMITS.set(key, state);
            return true;
        }
        // Rate limit exceeded
        this.LIMITS.set(key, state);
        return false;
    }
    /**
     * Cleans up registry limits on disconnect to prevent memory leaks
     */
    static cleanup(userId) {
        this.LIMITS.delete(userId);
    }
}
exports.WSConnectionLimiter = WSConnectionLimiter;
