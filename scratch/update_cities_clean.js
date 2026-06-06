const fs = require('fs');
let content = fs.readFileSync('server/src/domain/cities.ts', 'utf8');

const newCities = `
  // === EUROTUNNEL ===
  calais: {
    id: "calais", name: "Calais", country: "France", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 200000,
    lat: 50.95, lon: 1.85, heat: 10,
    connections: ["paris", "dover"]
  },
  dover: {
    id: "dover", name: "Dover", country: "United Kingdom", isSchengen: false, isCapital: false,
    purchasable: true, terminalCost: 250000,
    lat: 51.13, lon: 1.30, heat: 15,
    connections: ["calais", "london"]
  },
  // === BALKANS ===
  sofia: {
    id: "sofia", name: "Sofia", country: "Bulgaria", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 300000,
    lat: 42.70, lon: 23.32, heat: 25,
    connections: ["istanbul", "belgrade"]
  },
  belgrade: {
    id: "belgrade", name: "Belgrade", country: "Serbia (External)", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 280000,
    lat: 44.82, lon: 20.46, heat: 30,
    connections: ["sofia", "budapest"]
  },
  bucharest: {
    id: "bucharest", name: "Bucharest", country: "Romania", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 320000,
    lat: 44.43, lon: 26.10, heat: 20,
    connections: ["istanbul", "kyiv", "budapest"]
  },`;

content = content.replace('  // === NEW EUROPEAN CITIES ===', newCities + '\n  // === NEW EUROPEAN CITIES ===');

content = content.replace('connections: ["amsterdam", "paris"]', 'connections: ["amsterdam", "dover"]');
content = content.replace('connections: ["london", "brussels", "bern"]', 'connections: ["calais", "brussels", "bern"]');
content = content.replace('connections: ["vienna", "krakow"]', 'connections: ["vienna", "krakow", "belgrade", "bucharest"]');
content = content.replace('connections: ["brest", "minsk", "istanbul"]', 'connections: ["brest", "minsk", "bucharest"]');
content = content.replace('connections: ["kyiv", "vienna", "ankara"]', 'connections: ["bucharest", "sofia", "ankara"]');

fs.writeFileSync('server/src/domain/cities.ts', content);
console.log('Successfully updated cities.ts');
