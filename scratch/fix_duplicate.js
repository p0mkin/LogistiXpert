const fs = require('fs');
const content = fs.readFileSync('server/src/domain/cities.ts', 'utf8');

const firstIdx = content.indexOf('export const CITIES_DATASET');
const secondIdx = content.indexOf('export const CITIES_DATASET', firstIdx + 1);

if (secondIdx !== -1) {
  const beforeMinsk = content.substring(0, secondIdx);
  const minskTail = `
    lat: 53.90, lon: 27.57, heat: 70,
    connections: ["brest", "vilnius", "kyiv"]
  },
  // === UKRAINE ===
  kyiv: {
    id: "kyiv", name: "Kyiv", country: "Ukraine (External)", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 550000,
    lat: 50.45, lon: 30.52, heat: 40,
    connections: ["brest", "minsk", "bucharest"]
  },
  // === NEW EUROPEAN CITIES ===
  oslo: {
    id: "oslo", name: "Oslo", country: "Norway", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 450000,
    lat: 59.91, lon: 10.75, heat: 10,
    connections: ["stockholm", "copenhagen"]
  },
  london: {
    id: "london", name: "London", country: "United Kingdom", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 750000,
    lat: 51.51, lon: -0.13, heat: 45,
    connections: ["amsterdam", "dover"]
  },
  paris: {
    id: "paris", name: "Paris", country: "France", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 650000,
    lat: 48.85, lon: 2.35, heat: 25,
    connections: ["calais", "brussels", "bern"]
  },
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
  amsterdam: {
    id: "amsterdam", name: "Amsterdam", country: "Netherlands", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 520000,
    lat: 52.37, lon: 4.90, heat: 20,
    connections: ["london", "hamburg", "brussels"]
  },
  brussels: {
    id: "brussels", name: "Brussels", country: "Belgium", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 480000,
    lat: 50.85, lon: 4.35, heat: 18,
    connections: ["amsterdam", "paris", "berlin"]
  },
  munich: {
    id: "munich", name: "Munich", country: "Germany", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 500000,
    lat: 48.14, lon: 11.58, heat: 12,
    connections: ["berlin", "prague", "vienna", "bern"]
  },
  vienna: {
    id: "vienna", name: "Vienna", country: "Austria", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 460000,
    lat: 48.21, lon: 16.37, heat: 15,
    connections: ["prague", "munich", "budapest", "istanbul"]
  },
  budapest: {
    id: "budapest", name: "Budapest", country: "Hungary", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 380000,
    lat: 47.50, lon: 19.04, heat: 20,
    connections: ["vienna", "krakow", "belgrade", "bucharest"]
  },
  bern: {
    id: "bern", name: "Bern", country: "Switzerland", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 600000,
    lat: 46.95, lon: 7.45, heat: 5,
    connections: ["paris", "munich"]
  },
  // === SILK ROAD EXPANSION ===
  istanbul: {
    id: "istanbul", name: "Istanbul", country: "Turkey", isSchengen: false, isCapital: false,
    purchasable: true, terminalCost: 450000,
    lat: 41.01, lon: 28.98, heat: 35,
    connections: ["bucharest", "sofia", "ankara"]
  },
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
  },
  ankara: {
    id: "ankara", name: "Ankara", country: "Turkey", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 350000,
    lat: 39.93, lon: 32.85, heat: 25,
    connections: ["istanbul", "tehran", "baghdad"]
  },
  tehran: {
    id: "tehran", name: "Tehran", country: "Iran (External)", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 650000,
    lat: 35.69, lon: 51.38, heat: 75,
    connections: ["ankara", "kabul", "dubai"]
  },
  baghdad: {
    id: "baghdad", name: "Baghdad", country: "Iraq (External)", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 400000,
    lat: 33.32, lon: 44.36, heat: 85,
    connections: ["ankara", "riyadh"]
  },
  riyadh: {
    id: "riyadh", name: "Riyadh", country: "Saudi Arabia (External)", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 850000,
    lat: 24.71, lon: 46.68, heat: 40,
    connections: ["baghdad", "dubai"]
  },
  dubai: {
    id: "dubai", name: "Dubai", country: "UAE (External)", isSchengen: false, isCapital: false,
    purchasable: true, terminalCost: 1500000,
    lat: 25.21, lon: 55.27, heat: 20,
    connections: ["tehran", "riyadh"]
  },
  kabul: {
    id: "kabul", name: "Kabul", country: "Afghanistan (External)", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 300000,
    lat: 34.55, lon: 69.20, heat: 95,
    connections: ["tehran"]
  }
};
`;
  fs.writeFileSync('server/src/domain/cities.ts', beforeMinsk + minskTail);
  console.log("Fixed duplicate and set correct mapping for Huge Update");
} else {
  console.log("No duplicate found!");
}
