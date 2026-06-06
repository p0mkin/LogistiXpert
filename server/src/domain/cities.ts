export interface City {
  id: string;
  name: string;
  country: string;
  isSchengen: boolean;
  isCapital: boolean;
  purchasable: boolean;
  terminalCost: number;
  lat: number;
  lon: number;
  heat: number;
  connections: string[];
}

export const CITIES_DATASET: Record<string, City> = {
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
    connections: ["turku", "gdansk", "malmoe", "oslo", "tallinn"]
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
    connections: ["helsinki", "riga", "gdansk", "stockholm"]
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
    connections: ["gdansk", "kaliningrad", "vilnius", "kaunas", "brest", "berlin", "prague"]
  },
  krakow: {
    id: "krakow", name: "Kraków", country: "Poland", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 240000,
    lat: 50.06, lon: 19.94, heat: 16,
    connections: ["warsaw", "prague", "budapest"]
  },
  // === GERMANY ===
  berlin: {
    id: "berlin", name: "Berlin", country: "Germany", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 600000,
    lat: 52.52, lon: 13.40, heat: 15,
    connections: ["warsaw", "malmoe", "prague", "hamburg", "munich", "brussels"]
  },
  hamburg: {
    id: "hamburg", name: "Hamburg", country: "Germany", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 380000,
    lat: 53.55, lon: 10.00, heat: 10,
    connections: ["berlin", "stockholm", "copenhagen", "amsterdam"]
  },
  prague: {
    id: "prague", name: "Prague", country: "Czech Republic", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 420000,
    lat: 50.08, lon: 14.44, heat: 14,
    connections: ["berlin", "warsaw", "krakow", "munich", "vienna"]
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
    connections: ["brest", "minsk", "bucharest"]
  },

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
