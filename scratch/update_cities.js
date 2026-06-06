const fs = require('fs');
const path = require('path');

const newDatasetStr = `const CITIES_DATASET = {
  // === FINLAND ===
  helsinki: {
    id: "helsinki", name: "Helsinki", country: "Finland", isSchengen: true, isCapital: true,
    purchasable: false, terminalCost: 0,
    lat: 60.17, lon: 24.94, heat: 10,
    connections: ["tallinn", "turku"]
  },
  turku: {
    id: "turku", name: "Turku", country: "Finland", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 180000,
    lat: 60.45, lon: 22.27, heat: 5,
    connections: ["helsinki", "stockholm"]
  },
  // === SWEDEN ===
  stockholm: {
    id: "stockholm", name: "Stockholm", country: "Sweden", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 320000,
    lat: 59.33, lon: 18.07, heat: 12,
    connections: ["turku", "gdansk", "malmoe", "oslo"]
  },
  malmoe: {
    id: "malmoe", name: "Malmö", country: "Sweden", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 200000,
    lat: 55.61, lon: 13.00, heat: 8,
    connections: ["stockholm", "berlin", "hamburg", "copenhagen"]
  },
  // === DENMARK ===
  copenhagen: {
    id: "copenhagen", name: "Copenhagen", country: "Denmark", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 410000,
    lat: 55.68, lon: 12.57, heat: 9,
    connections: ["malmoe", "hamburg", "oslo"]
  },
  // === ESTONIA ===
  tallinn: {
    id: "tallinn", name: "Tallinn", country: "Estonia", isSchengen: true, isCapital: true,
    purchasable: false, terminalCost: 0,
    lat: 59.44, lon: 24.75, heat: 15,
    connections: ["helsinki", "riga", "gdansk"]
  },
  // === LATVIA ===
  riga: {
    id: "riga", name: "Riga", country: "Latvia", isSchengen: true, isCapital: true,
    purchasable: false, terminalCost: 0,
    lat: 56.95, lon: 24.11, heat: 20,
    connections: ["tallinn", "klaipeda", "vilnius"]
  },
  // === LITHUANIA ===
  vilnius: {
    id: "vilnius", name: "Vilnius", country: "Lithuania", isSchengen: true, isCapital: true,
    purchasable: false, terminalCost: 0,
    lat: 54.69, lon: 25.28, heat: 30,
    connections: ["riga", "klaipeda", "brest", "warsaw", "kaunas"]
  },
  klaipeda: {
    id: "klaipeda", name: "Klaipėda", country: "Lithuania", isSchengen: true, isCapital: false,
    purchasable: false, terminalCost: 0,
    lat: 55.71, lon: 21.14, heat: 25,
    connections: ["riga", "vilnius", "kaliningrad"]
  },
  kaunas: {
    id: "kaunas", name: "Kaunas", country: "Lithuania", isSchengen: true, isCapital: false,
    purchasable: false, terminalCost: 0,
    lat: 54.90, lon: 23.90, heat: 22,
    connections: ["vilnius", "warsaw"]
  },
  // === RUSSIA (KALININGRAD EXCLAVE) ===
  kaliningrad: {
    id: "kaliningrad", name: "Kaliningrad", country: "Russia (External)", isSchengen: false, isCapital: false,
    purchasable: true, terminalCost: 500000,
    lat: 54.71, lon: 20.51, heat: 65,
    connections: ["klaipeda", "gdansk", "warsaw"]
  },
  // === POLAND ===
  gdansk: {
    id: "gdansk", name: "Gdańsk", country: "Poland", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 220000,
    lat: 54.35, lon: 18.65, heat: 18,
    connections: ["tallinn", "stockholm", "kaliningrad", "warsaw"]
  },
  warsaw: {
    id: "warsaw", name: "Warsaw", country: "Poland", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 350000,
    lat: 52.23, lon: 21.01, heat: 22,
    connections: ["gdansk", "kaliningrad", "vilnius", "kaunas", "brest", "berlin", "prague", "krakow"]
  },
  krakow: {
    id: "krakow", name: "Kraków", country: "Poland", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 240000,
    lat: 50.06, lon: 19.94, heat: 16,
    connections: ["warsaw", "prague", "budapest", "bratislava"]
  },
  // === GERMANY ===
  berlin: {
    id: "berlin", name: "Berlin", country: "Germany", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 600000,
    lat: 52.52, lon: 13.40, heat: 15,
    connections: ["warsaw", "malmoe", "prague", "hamburg", "munich", "brussels", "frankfurt"]
  },
  hamburg: {
    id: "hamburg", name: "Hamburg", country: "Germany", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 380000,
    lat: 53.55, lon: 10.00, heat: 10,
    connections: ["berlin", "stockholm", "copenhagen", "amsterdam"]
  },
  frankfurt: {
    id: "frankfurt", name: "Frankfurt", country: "Germany", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 550000,
    lat: 50.11, lon: 8.68, heat: 15,
    connections: ["berlin", "munich", "brussels", "bern", "amsterdam", "paris"]
  },
  munich: {
    id: "munich", name: "Munich", country: "Germany", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 500000,
    lat: 48.14, lon: 11.58, heat: 12,
    connections: ["berlin", "prague", "vienna", "bern", "milan", "frankfurt"]
  },
  prague: {
    id: "prague", name: "Prague", country: "Czech Republic", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 420000,
    lat: 50.08, lon: 14.44, heat: 14,
    connections: ["berlin", "warsaw", "krakow", "munich", "vienna", "bratislava"]
  },
  // === BELARUS BORDER ===
  brest: {
    id: "brest", name: "Brest-Terespol Checkpoint", country: "Belarus Border", isSchengen: false, isCapital: false,
    purchasable: false, terminalCost: 0,
    lat: 52.10, lon: 23.70, heat: 85,
    connections: ["vilnius", "warsaw", "minsk", "kyiv"]
  },
  minsk: {
    id: "minsk", name: "Minsk", country: "Belarus (External)", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 700000,
    lat: 53.90, lon: 27.57, heat: 70,
    connections: ["brest", "vilnius", "kyiv"]
  },
  // === UKRAINE ===
  kyiv: {
    id: "kyiv", name: "Kyiv", country: "Ukraine (External)", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 550000,
    lat: 50.45, lon: 30.52, heat: 40,
    connections: ["brest", "minsk"]
  },
  // === NEW WESTERN EUROPEAN CITIES ===
  oslo: {
    id: "oslo", name: "Oslo", country: "Norway", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 450000,
    lat: 59.91, lon: 10.75, heat: 10,
    connections: ["stockholm", "copenhagen", "edinburgh"]
  },
  london: {
    id: "london", name: "London", country: "United Kingdom", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 750000,
    lat: 51.51, lon: -0.13, heat: 45,
    connections: ["amsterdam", "paris", "dublin", "manchester"]
  },
  paris: {
    id: "paris", name: "Paris", country: "France", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 650000,
    lat: 48.85, lon: 2.35, heat: 25,
    connections: ["london", "brussels", "bern", "marseille", "frankfurt", "lyon"]
  },
  lyon: {
    id: "lyon", name: "Lyon", country: "France", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 450000,
    lat: 45.76, lon: 4.83, heat: 20,
    connections: ["paris", "marseille", "bern", "milan"]
  },
  amsterdam: {
    id: "amsterdam", name: "Amsterdam", country: "Netherlands", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 520000,
    lat: 52.37, lon: 4.90, heat: 20,
    connections: ["london", "hamburg", "brussels", "frankfurt"]
  },
  brussels: {
    id: "brussels", name: "Brussels", country: "Belgium", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 480000,
    lat: 50.85, lon: 4.35, heat: 18,
    connections: ["amsterdam", "paris", "berlin", "frankfurt"]
  },
  vienna: {
    id: "vienna", name: "Vienna", country: "Austria", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 460000,
    lat: 48.21, lon: 16.37, heat: 15,
    connections: ["prague", "munich", "budapest", "zagreb", "ljubljana", "bratislava"]
  },
  budapest: {
    id: "budapest", name: "Budapest", country: "Hungary", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 380000,
    lat: 47.50, lon: 19.04, heat: 20,
    connections: ["vienna", "krakow", "belgrade", "bucharest", "zagreb", "bratislava"]
  },
  bern: {
    id: "bern", name: "Bern", country: "Switzerland", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 600000,
    lat: 46.95, lon: 7.45, heat: 5,
    connections: ["paris", "munich", "frankfurt", "milan", "lyon"]
  },

  // === SOUTHERN EUROPE ===
  rome: {
    id: "rome", name: "Rome", country: "Italy", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 600000, lat: 41.90, lon: 12.49, heat: 35,
    connections: ["milan", "marseille"]
  },
  milan: {
    id: "milan", name: "Milan", country: "Italy", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 550000, lat: 45.46, lon: 9.19, heat: 25,
    connections: ["rome", "bern", "munich", "zagreb", "marseille", "lyon", "ljubljana"]
  },
  madrid: {
    id: "madrid", name: "Madrid", country: "Spain", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 580000, lat: 40.41, lon: -3.70, heat: 20,
    connections: ["barcelona", "lisbon", "marseille"]
  },
  barcelona: {
    id: "barcelona", name: "Barcelona", country: "Spain", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 560000, lat: 41.38, lon: 2.16, heat: 22,
    connections: ["madrid", "marseille"]
  },
  lisbon: {
    id: "lisbon", name: "Lisbon", country: "Portugal", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 500000, lat: 38.72, lon: -9.14, heat: 18,
    connections: ["madrid"]
  },
  marseille: {
    id: "marseille", name: "Marseille", country: "France", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 480000, lat: 43.29, lon: 5.36, heat: 30,
    connections: ["paris", "barcelona", "madrid", "milan", "rome", "lyon"]
  },
  athens: {
    id: "athens", name: "Athens", country: "Greece", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 450000, lat: 37.98, lon: 23.72, heat: 28,
    connections: ["sofia", "skopje", "tirana"]
  },

  // === BALKANS & EASTERN EUROPE ===
  bucharest: {
    id: "bucharest", name: "Bucharest", country: "Romania", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 400000, lat: 44.42, lon: 26.10, heat: 35,
    connections: ["sofia", "belgrade", "budapest"]
  },
  sofia: {
    id: "sofia", name: "Sofia", country: "Bulgaria", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 380000, lat: 42.69, lon: 23.32, heat: 40,
    connections: ["bucharest", "belgrade", "skopje", "athens"]
  },
  belgrade: {
    id: "belgrade", name: "Belgrade", country: "Serbia", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 420000, lat: 44.81, lon: 20.45, heat: 45,
    connections: ["budapest", "zagreb", "sarajevo", "sofia", "bucharest", "skopje"]
  },
  zagreb: {
    id: "zagreb", name: "Zagreb", country: "Croatia", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 460000, lat: 45.81, lon: 15.98, heat: 15,
    connections: ["vienna", "budapest", "belgrade", "ljubljana", "milan", "sarajevo"]
  },
  sarajevo: {
    id: "sarajevo", name: "Sarajevo", country: "Bosnia", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 350000, lat: 43.85, lon: 18.41, heat: 50,
    connections: ["zagreb", "belgrade", "tirana"]
  },
  ljubljana: {
    id: "ljubljana", name: "Ljubljana", country: "Slovenia", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 480000, lat: 46.05, lon: 14.50, heat: 12,
    connections: ["vienna", "zagreb", "milan"]
  },
  skopje: {
    id: "skopje", name: "Skopje", country: "North Macedonia", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 340000, lat: 42.00, lon: 21.42, heat: 48,
    connections: ["sofia", "belgrade", "tirana", "athens"]
  },
  tirana: {
    id: "tirana", name: "Tirana", country: "Albania", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 320000, lat: 41.32, lon: 19.81, heat: 55,
    connections: ["skopje", "sarajevo", "athens"]
  },
  bratislava: {
    id: "bratislava", name: "Bratislava", country: "Slovakia", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 430000, lat: 48.14, lon: 17.10, heat: 18,
    connections: ["vienna", "budapest", "krakow", "prague"]
  },

  // === UK & IRELAND ===
  dublin: {
    id: "dublin", name: "Dublin", country: "Ireland", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 620000, lat: 53.34, lon: -6.26, heat: 20,
    connections: ["london", "manchester"]
  },
  manchester: {
    id: "manchester", name: "Manchester", country: "United Kingdom", isSchengen: false, isCapital: false,
    purchasable: true, terminalCost: 550000, lat: 53.48, lon: -2.24, heat: 25,
    connections: ["london", "dublin", "edinburgh"]
  },
  edinburgh: {
    id: "edinburgh", name: "Edinburgh", country: "United Kingdom", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 500000, lat: 55.95, lon: -3.18, heat: 15,
    connections: ["manchester", "oslo"]
  }
};`;

// 1. Update shared.js
let sharedJsPath = path.join(__dirname, '..', 'web', 'shared.js');
let sharedJs = fs.readFileSync(sharedJsPath, 'utf8');
sharedJs = sharedJs.replace(/const CITIES_DATASET = \{[\s\S]*?\};\n/, newDatasetStr + '\n');
fs.writeFileSync(sharedJsPath, sharedJs);

// 2. Update script.js
let scriptJsPath = path.join(__dirname, '..', 'web', 'script.js');
let scriptJs = fs.readFileSync(scriptJsPath, 'utf8');
scriptJs = scriptJs.replace(/const CITIES_DATASET = \{[\s\S]*?\};\n/, newDatasetStr + '\n');
fs.writeFileSync(scriptJsPath, scriptJs);

// 3. Update cities.ts
let citiesTsPath = path.join(__dirname, '..', 'server', 'src', 'domain', 'cities.ts');
let citiesTs = fs.readFileSync(citiesTsPath, 'utf8');
citiesTs = citiesTs.replace(/export const CITIES_DATASET: Record<string, City> = \{[\s\S]*?\};\n/, newDatasetStr.replace('const CITIES_DATASET = {', 'export const CITIES_DATASET: Record<string, City> = {') + '\n');
fs.writeFileSync(citiesTsPath, citiesTs);

console.log("Cities updated successfully.");
