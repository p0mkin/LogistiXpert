import crypto from 'crypto';

/**
 * Generates a cryptographically secure Vehicle Identification Number (VIN).
 *
 * Uses `crypto.randomUUID()` to generate a collision-resistant, 17-character
 * alphanumeric string (standard VIN length), ensuring uniqueness and security
 * compared to insecure randomness like `Math.random()`.
 *
 * @param prefix Optional prefix to prepend to the randomly generated VIN string.
 * @returns A secure alphanumeric string.
 */
export function generateSecureVin(prefix: string = ''): string {
    const randomHex = crypto.randomUUID().replace(/-/g, '').substring(0, 17).toUpperCase();
    return `${prefix}${randomHex}`;
}
