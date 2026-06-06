const fs = require('fs');
const path = require('path');

function calcDist(lat1, lon1, lat2, lon2) {
  // simple euclidean mapped to KM just like previous versions
  const dx = lat2 - lat1;
  const dy = lon2 - lon1;
  return Math.round(Math.sqrt(dx*dx + dy*dy) * 111); // ~111km per degree
}

const content = fs.readFileSync('server/src/domain/cities.ts', 'utf8');
const match = content.match(/export const CITIES_DATASET:\s*Record<string, City>\s*=\s*(\{[\s\S]*?\n\});/);
if (!match) throw new Error("Could not find CITIES_DATASET");

let objStr = match[1];

const vm = require('vm');
const context = {};
vm.runInNewContext('var cities = ' + objStr + ';', context);
const ds = context.cities;

const godotData = {};

for (const [id, city] of Object.entries(ds)) {
  const gCity = {
    name: city.name,
    country: city.country,
    is_schengen: city.isSchengen,
    type: city.heat > 30 ? "high_risk" : (city.heat > 15 ? "underworld" : "friendly"),
    coords: { x: city.lat, y: city.lon },
    connections: {}
  };
  
  if (city.connections) {
    for (const conn of city.connections) {
      const target = ds[conn];
      if (!target) continue;
      
      const isCross = city.country !== target.country;
      const type = (city.heat > 30 || target.heat > 30) ? "underworld" : "legal";
      
      gCity.connections[conn] = {
        distance_km: calcDist(city.lat, city.lon, target.lat, target.lon),
        is_border_crossing: isCross,
        type: type
      };
    }
  }
  
  godotData[id] = gCity;
}

const finalJson = { cities: godotData };
fs.writeFileSync('client/resources/cities.json', JSON.stringify(finalJson, null, 2));
console.log("Successfully regenerated cities.json from cities.ts!");
