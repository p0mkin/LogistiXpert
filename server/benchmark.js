const crypto = require('crypto');

// Existing current implementation
function generateSecureVinCurrent(prefix = '') {
    const randomHex = crypto.randomUUID().replace(/-/g, '').substring(0, 17).toUpperCase();
    return `${prefix}${randomHex}`;
}

// Optimized implementation using a buffer pool
const poolSize = 1024 * 16;
const pool = Buffer.allocUnsafe(poolSize);
let poolOffset = poolSize;

function generateSecureVinPool(prefix = '') {
    if (poolOffset + 9 > poolSize) {
        crypto.randomFillSync(pool);
        poolOffset = 0;
    }
    const hex = pool.toString('hex', poolOffset, poolOffset + 9).substring(0, 17).toUpperCase();
    poolOffset += 9;
    return `${prefix}${hex}`;
}

const iterations = 1000000;

console.log('Running benchmark...');

let start = performance.now();
for (let i = 0; i < iterations; i++) {
    generateSecureVinCurrent('VIN-TES-');
}
let end = performance.now();
const currentMs = end - start;
console.log(`Current (crypto.randomUUID + replace): ${currentMs.toFixed(2)} ms`);

start = performance.now();
for (let i = 0; i < iterations; i++) {
    generateSecureVinPool('VIN-TES-');
}
end = performance.now();
const poolMs = end - start;
console.log(`Optimized (crypto.randomFillSync pool): ${poolMs.toFixed(2)} ms`);

console.log(`\nImprovement: ~${(currentMs / poolMs).toFixed(1)}x faster`);
