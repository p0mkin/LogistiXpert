import crypto from 'crypto';

const POOL_SIZE = 1024 * 16;
const pool = Buffer.allocUnsafe(POOL_SIZE);
let poolOffset = POOL_SIZE;

/**
 * Generates a cryptographically secure Vehicle Identification Number (VIN).
 *
 * Uses a pooled `crypto.randomFillSync()` approach to generate random bytes,
 * avoiding the allocation and regex overhead of `crypto.randomUUID()`.
 * This generates a collision-resistant, 17-character alphanumeric string
 * (standard VIN length), ensuring uniqueness and security while remaining highly performant.
 *
 * @param prefix Optional prefix to prepend to the randomly generated VIN string.
 * @returns A secure alphanumeric string.
 */
export function generateSecureVin(prefix: string = ''): string {
    if (poolOffset + 9 > POOL_SIZE) {
        crypto.randomFillSync(pool);
        poolOffset = 0;
    }
    const randomHex = pool.toString('hex', poolOffset, poolOffset + 9).substring(0, 17).toUpperCase();
    poolOffset += 9;
    return `${prefix}${randomHex}`;
}
