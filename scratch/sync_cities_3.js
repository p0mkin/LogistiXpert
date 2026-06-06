const fs = require('fs');
const content = fs.readFileSync('server/src/domain/cities.ts', 'utf8');

// Use a simple evaluation trick since it's just a JS object literal
// We strip everything before `export const CITIES_DATASET = {` and `}`
const match = content.match(/export const CITIES_DATASET:\s*Record<string, City>\s*=\s*(\{[\s\S]*?\n\});/);
if (!match) {
  console.error("Could not find CITIES_DATASET block!");
  process.exit(1);
}

const objStr = match[1];

// We can evaluate it in an isolated context
const vm = require('vm');
const context = {};
try {
  vm.runInNewContext('var cities = ' + objStr + ';', context);
  const finalJson = { cities: context.cities };
  fs.writeFileSync('client/resources/cities.json', JSON.stringify(finalJson, null, 2));
  console.log("Successfully evaluated and wrote cities.json! Total:", Object.keys(context.cities).length);
} catch(e) {
  console.error("Evaluation failed:", e);
}
