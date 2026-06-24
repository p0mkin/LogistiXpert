const { performance } = require('perf_hooks');

const NUM_GARAGES = 10; // More realistic number of garages for a single company
const companyGarages = Array.from({ length: NUM_GARAGES }).map((_, i) => ({
  id: i,
  companyId: 1,
  city: `City${i}`,
  terminalLevel: Math.floor(Math.random() * 3) + 1,
}));

const NUM_ITERATIONS = 100000;

function runBenchmark() {
  console.log(`Benchmarking with ${NUM_GARAGES} garages and ${NUM_ITERATIONS} iterations...`);

  // 1. Current approach
  const startMap = performance.now();
  for (let i = 0; i < NUM_ITERATIONS; i++) {
    const garageMap = new Map(companyGarages.map((g) => [g.city.toLowerCase(), g]));
    const garage = garageMap.get('city5');
  }
  const timeMap = performance.now() - startMap;
  console.log(`new Map + map: ${timeMap.toFixed(2)} ms`);

  // 2. Reduce approach
  const startReduce = performance.now();
  for (let i = 0; i < NUM_ITERATIONS; i++) {
    const garageMap = companyGarages.reduce((acc, g) => {
      acc[g.city.toLowerCase()] = g;
      return acc;
    }, {});
    const garage = garageMap['city5'];
  }
  const timeReduce = performance.now() - startReduce;
  console.log(`reduce to plain object: ${timeReduce.toFixed(2)} ms`);

  const improvement = ((timeMap - timeReduce) / timeMap * 100).toFixed(2);
  console.log(`Improvement: ${improvement}%`);
}

runBenchmark();
