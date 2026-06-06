/**
 * ==========================================================================
 * LOGISTIXPERT: UNDERWORLD LOGISTICS — FRONTEND COMMAND CONTROL ENGINE
 * ==========================================================================
 * File: script.js
 * Role: State management, tactical vector SVG maps, dynamic UI updates
 * Developer Mode: Gemini 3.5 Flash (High Clean-Code Refactoring Mode)
 * ==========================================================================
 */

// ==========================================================================
// 0. PROCEDURAL WEB AUDIO SYNTHESIZER ENGINE
// ==========================================================================
class CyberAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  playBeep(freq, duration, type = "sine", gainDecay = true) {
    this.resume();
    if (this.muted || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    gainNode.gain.setValueAtTime(0.08, this.ctx.currentTime);
    if (gainDecay) {
      gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    } else {
      gainNode.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gainNode.gain.setValueAtTime(0.08, this.ctx.currentTime + duration - 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    }

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playClick() {
    this.playBeep(2200, 0.04, "triangle");
  }

  playHover() {
    this.playBeep(1800, 0.015, "sine");
  }

  playHandshake() {
    this.resume();
    if (this.muted || !this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1600, now + 0.12);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(now + 0.15);
  }

  playSiren() {
    this.resume();
    if (this.muted || !this.ctx) return;

    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const start = now + i * 0.22;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(420, start);
      osc.frequency.linearRampToValueAtTime(780, start + 0.1);
      osc.frequency.linearRampToValueAtTime(420, start + 0.22);

      gain.gain.setValueAtTime(0.04, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);

      const biquad = this.ctx.createBiquadFilter();
      biquad.type = "lowpass";
      biquad.frequency.setValueAtTime(1000, start);

      osc.connect(biquad);
      biquad.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(start);
      osc.stop(start + 0.22);
    }
  }

  playSuccess() {
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playBeep(freq, 0.2, "sine");
      }, idx * 70);
    });
  }

  playFailure() {
    this.resume();
    if (this.muted || !this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.linearRampToValueAtTime(70, now + 0.5);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(250, now);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(now + 0.5);
  }
}

const AUDIO = new CyberAudioEngine();

// 1. DATASETS & CONFIGURATIONS — Expanded European Network
// ==========================================================================
// REAL GEOGRAPHIC MAP SYSTEM — Natural Earth / world-atlas (Free, Public Domain)
// ==========================================================================

// Mercator projection bounding box for expanded European region
const MAP_GEO = {
  lonMin: -6.0,   // West (UK/Ireland)
  lonMax: 72.0,   // East (Afghanistan)
  latMin: 20.0,   // South (UAE/Saudi Arabia)
  latMax: 68.0,   // North (Northern Scandinavia)
  svgW:  1000,
  svgH:   600,
};

/**
 * Mercator projection: real lat/lon → SVG pixel coordinates
 * (Maintains aspect ratio without distortion)
 */
function projectCoord(lon, lat) {
  const toRad = (d) => d * Math.PI / 180;
  const mercY = (latDeg) => Math.log(Math.tan(Math.PI / 4 + toRad(latDeg) / 2));

  const lonSpan = MAP_GEO.lonMax - MAP_GEO.lonMin;
  const yMin = mercY(MAP_GEO.latMin);
  const yMax = mercY(MAP_GEO.latMax);
  const ySpan = yMax - yMin;

  const scaleX = MAP_GEO.svgW / lonSpan;
  const scaleY = MAP_GEO.svgH / ySpan;
  const scale = Math.min(scaleX, scaleY); // uniform scale for aspect ratio

  // Center the map in the SVG
  const xOffset = (MAP_GEO.svgW - lonSpan * scale) / 2;
  const yOffset = (MAP_GEO.svgH - ySpan * scale) / 2;

  const x = xOffset + (lon - MAP_GEO.lonMin) * scale;
  const y = yOffset + (yMax - mercY(lat)) * scale;
  
  return { x, y };
}

/**
 * Build an SVG path 'd' attribute string from a GeoJSON ring of [lon, lat] pairs
 */
function ringToPath(ring) {
  if (!ring || ring.length < 2) return '';
  let d = '';
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    const { x, y } = projectCoord(lon, lat);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
  }
  return d + 'Z';
}

/**
 * Build full SVG path 'd' from a GeoJSON geometry (Polygon or MultiPolygon)
 */
function geometryToPath(geometry) {
  if (!geometry) return '';
  let d = '';
  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach(ring => { d += ringToPath(ring); });
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach(poly => {
      poly.forEach(ring => { d += ringToPath(ring); });
    });
  }
  return d;
}

// Numeric ISO country codes we want to render (Natural Earth / world-atlas)
// Schengen = semi-transparent blue/teal; External = subtle red
const GEO_COUNTRY_STYLES = {
  // Nordic / Baltic (Schengen)
  '246': { color: 'rgba(80,200,255,0.13)', stroke: 'rgba(80,200,255,0.35)' },   // Finland
  '752': { color: 'rgba(80,180,255,0.12)', stroke: 'rgba(80,180,255,0.35)' },   // Sweden
  '578': { color: 'rgba(80,180,255,0.10)', stroke: 'rgba(80,180,255,0.30)' },   // Norway
  '208': { color: 'rgba(80,180,255,0.11)', stroke: 'rgba(80,180,255,0.30)' },   // Denmark
  '233': { color: 'rgba(80,220,160,0.13)', stroke: 'rgba(80,220,160,0.35)' },   // Estonia
  '428': { color: 'rgba(80,220,140,0.12)', stroke: 'rgba(80,220,140,0.30)' },   // Latvia
  '440': { color: 'rgba(100,220,120,0.12)', stroke: 'rgba(100,220,120,0.30)' }, // Lithuania
  // Central / Western Europe (Schengen)
  '616': { color: 'rgba(220,80,80,0.09)',  stroke: 'rgba(220,80,80,0.25)' },    // Poland
  '276': { color: 'rgba(200,180,80,0.09)', stroke: 'rgba(200,180,80,0.25)' },   // Germany
  '203': { color: 'rgba(200,160,60,0.09)', stroke: 'rgba(200,160,60,0.25)' },   // Czech Republic
  '703': { color: 'rgba(180,160,60,0.08)', stroke: 'rgba(180,160,60,0.22)' },   // Slovakia
  '040': { color: 'rgba(160,140,60,0.08)', stroke: 'rgba(160,140,60,0.22)' },   // Austria
  '348': { color: 'rgba(180,140,60,0.08)', stroke: 'rgba(180,140,60,0.22)' },   // Hungary
  '528': { color: 'rgba(80,200,255,0.11)', stroke: 'rgba(80,200,255,0.30)' },   // Netherlands
  '056': { color: 'rgba(80,200,255,0.10)', stroke: 'rgba(80,200,255,0.28)' },   // Belgium
  '250': { color: 'rgba(100,180,255,0.09)', stroke: 'rgba(100,180,255,0.28)' }, // France
  '756': { color: 'rgba(200,220,180,0.10)', stroke: 'rgba(200,220,180,0.30)' }, // Switzerland
  '380': { color: 'rgba(160,220,120,0.09)', stroke: 'rgba(160,220,120,0.28)' }, // Italy
  '724': { color: 'rgba(220,180,100,0.09)', stroke: 'rgba(220,180,100,0.28)' }, // Spain
  '620': { color: 'rgba(220,160,100,0.09)', stroke: 'rgba(220,160,100,0.28)' }, // Portugal
  '300': { color: 'rgba(140,200,240,0.09)', stroke: 'rgba(140,200,240,0.28)' }, // Greece
  '705': { color: 'rgba(140,220,160,0.08)', stroke: 'rgba(140,220,160,0.22)' }, // Slovenia
  
  // External / restricted (faint red)
  '826': { color: 'rgba(255,100,100,0.08)', stroke: 'rgba(255,100,100,0.28)' }, // United Kingdom
  '372': { color: 'rgba(255,100,100,0.08)', stroke: 'rgba(255,100,100,0.28)' }, // Ireland
  '112': { color: 'rgba(180,60,60,0.12)',  stroke: 'rgba(255,60,60,0.30)' },    // Belarus
  '804': { color: 'rgba(200,140,20,0.09)', stroke: 'rgba(200,140,20,0.25)' },   // Ukraine
  '643': { color: 'rgba(255,60,60,0.10)',  stroke: 'rgba(255,60,60,0.30)' },    // Russia
  '070': { color: 'rgba(160,80,80,0.08)',  stroke: 'rgba(160,80,80,0.20)' },    // Bosnia
  '191': { color: 'rgba(160,80,80,0.07)',  stroke: 'rgba(160,80,80,0.18)' },    // Croatia
  '891': { color: 'rgba(160,80,80,0.07)',  stroke: 'rgba(160,80,80,0.18)' },    // Serbia
  '642': { color: 'rgba(160,80,80,0.07)',  stroke: 'rgba(160,80,80,0.18)' },    // Romania
  '100': { color: 'rgba(160,80,80,0.07)',  stroke: 'rgba(160,80,80,0.18)' },    // Bulgaria
  '008': { color: 'rgba(160,80,80,0.07)',  stroke: 'rgba(160,80,80,0.18)' },    // Albania
  '807': { color: 'rgba(160,80,80,0.07)',  stroke: 'rgba(160,80,80,0.18)' },    // North Macedonia
  
  // Silk Road Expansion (Middle East & Central Asia)
  '792': { color: 'rgba(200,100,50,0.12)', stroke: 'rgba(200,100,50,0.30)' },   // Turkey
  '364': { color: 'rgba(255,200,50,0.08)', stroke: 'rgba(255,200,50,0.25)' },   // Iran
  '368': { color: 'rgba(200,150,50,0.08)', stroke: 'rgba(200,150,50,0.25)' },   // Iraq
  '760': { color: 'rgba(200,80,50,0.08)',  stroke: 'rgba(200,80,50,0.20)' },    // Syria
  '682': { color: 'rgba(200,180,80,0.07)', stroke: 'rgba(200,180,80,0.20)' },   // Saudi Arabia
  '784': { color: 'rgba(255,215,0,0.15)',  stroke: 'rgba(255,215,0,0.35)' },    // UAE (Gold glow)
  '004': { color: 'rgba(255,50,50,0.10)',  stroke: 'rgba(255,50,50,0.35)' },    // Afghanistan (Red high-risk)
  '268': { color: 'rgba(180,140,80,0.08)', stroke: 'rgba(180,140,80,0.20)' },   // Georgia
  '031': { color: 'rgba(180,140,80,0.08)', stroke: 'rgba(180,140,80,0.20)' },   // Azerbaijan
  '051': { color: 'rgba(180,140,80,0.08)', stroke: 'rgba(180,140,80,0.20)' },   // Armenia
  '795': { color: 'rgba(220,180,50,0.08)', stroke: 'rgba(220,180,50,0.20)' },   // Turkmenistan
  '860': { color: 'rgba(220,180,50,0.08)', stroke: 'rgba(220,180,50,0.20)' }    // Uzbekistan
};

/**
 * Async: Fetch world-atlas TopoJSON, parse it, render country fills + coastlines into SVG
 * Uses 10m resolution — highest detail, shows all archipelagos and minor islands
 */
async function loadAndRenderGeoMap(svg) {
  try {
    appendTerminalLine('GEO: Fetching Natural Earth cartographic data (10m)...', 'info');

    const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const topo = await response.json();

    // Convert TopoJSON → GeoJSON feature collection
    const countries = topojson.feature(topo, topo.objects.countries);
    const meshBorders = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);

    const svgNS = 'http://www.w3.org/2000/svg';

    // Create a group for geography (inserted before routes/nodes)
    const geoGroup = document.createElementNS(svgNS, 'g');
    geoGroup.setAttribute('id', 'geo-layer');

    // Ocean background for the Baltic Sea area
    const ocean = document.createElementNS(svgNS, 'rect');
    ocean.setAttribute('x', '0');
    ocean.setAttribute('y', '0');
    ocean.setAttribute('width', MAP_GEO.svgW);
    ocean.setAttribute('height', MAP_GEO.svgH);
    ocean.setAttribute('fill', 'rgba(0, 30, 60, 0.55)');
    geoGroup.appendChild(ocean);

    // Render country fills
    countries.features.forEach(feature => {
      const id = feature.id ? String(feature.id).padStart(3, '0') : null;
      const style = (id && GEO_COUNTRY_STYLES[id]) ? GEO_COUNTRY_STYLES[id] : { color: 'rgba(255,255,255,0.015)', stroke: 'rgba(255,255,255,0.04)' };

      const pathStr = geometryToPath(feature.geometry);
      if (!pathStr) return;

      const pathEl = document.createElementNS(svgNS, 'path');
      pathEl.setAttribute('d', pathStr);
      pathEl.setAttribute('fill', style.color);
      pathEl.setAttribute('stroke', style.stroke);
      pathEl.setAttribute('stroke-width', '0.6');
      pathEl.setAttribute('stroke-linejoin', 'round');
      geoGroup.appendChild(pathEl);
    });

    // Render internal borders (shared edges between countries) as faint lines
    const borderStr = geometryToPath(meshBorders);
    if (borderStr) {
      const borderPath = document.createElementNS(svgNS, 'path');
      borderPath.setAttribute('d', borderStr);
      borderPath.setAttribute('fill', 'none');
      borderPath.setAttribute('stroke', 'rgba(255,255,255,0.06)');
      borderPath.setAttribute('stroke-width', '0.5');
      geoGroup.appendChild(borderPath);
    }

    // Insert geo layer at the start of the SVG
    svg.insertBefore(geoGroup, svg.firstChild);

    // Apply D3 Zoom behavior so the user can explore details
    const zoom = d3.zoom()
      .scaleExtent([0.5, 8])
      .on('zoom', (event) => {
        // Semantic zoom: scale the entire SVG contents
        const transformStr = event.transform.toString();
        const geoLayer = document.getElementById('geo-layer');
        const linkLayer = document.getElementById('link-layer');
        const nodeLayer = document.getElementById('node-layer');
        const truckLayer = document.getElementById('truck-layer');
        
        if (geoLayer) geoLayer.setAttribute('transform', transformStr);
        if (linkLayer) linkLayer.setAttribute('transform', transformStr);
        if (nodeLayer) nodeLayer.setAttribute('transform', transformStr);
        if (truckLayer) truckLayer.setAttribute('transform', transformStr);
      });
      
    d3.select(svg).call(zoom);

    appendTerminalLine('GEO: Cartographic layer rendered. Zoom & Pan activated.', 'success');
  } catch (err) {
    console.warn('GeoJSON map load failed, falling back to polygon mode:', err);
    appendTerminalLine('GEO: Satellite uplink failed — running fallback schematic mode.', 'warn');
    renderFallbackPolygons(svg);
  }
}

/**
 * Fallback: simple polygon shapes if CDN fetch fails (offline / no network)
 */
function renderFallbackPolygons(svg) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const fallbacks = [
    { color: 'rgba(80,200,255,0.10)',  points: [[22,71.5],[30,71.5],[30,60],[24,60],[22,71.5]] }, // Finland rough
    { color: 'rgba(80,180,255,0.09)',  points: [[11,60],[20,60],[20,55],[11,55],[11,60]] },       // Sweden rough
    { color: 'rgba(80,220,160,0.12)',  points: [[21,60],[28,60],[28,57],[21,57],[21,60]] },       // Estonia rough
    { color: 'rgba(100,220,120,0.11)', points: [[21,57],[28,57],[28,55.5],[21,55.5],[21,57]] },   // Latvia rough
    { color: 'rgba(100,220,120,0.11)', points: [[21,56],[26,56],[26,54],[21,54],[21,56]] },       // Lithuania rough
    { color: 'rgba(220,80,80,0.08)',   points: [[14,55],[24,55],[24,49],[14,49],[14,55]] },       // Poland rough
    { color: 'rgba(200,180,80,0.08)',  points: [[6,55],[15,55],[15,47],[6,47],[6,55]] },          // Germany rough
  ];
  fallbacks.forEach(fb => {
    const pts = fb.points.map(([lon, lat]) => {
      const p = projectCoord(lon, lat);
      return `${p.x},${p.y}`;
    }).join(' ');
    const poly = document.createElementNS(svgNS, 'polygon');
    poly.setAttribute('points', pts);
    poly.setAttribute('fill', fb.color);
    poly.setAttribute('stroke', fb.color.replace(/,[^,]+\)$/, ',0.3)'));
    poly.setAttribute('stroke-width', '1');
    svg.insertBefore(poly, svg.firstChild);
  });
}

const CITIES_DATASET = {
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

// 2. STATE MANAGEMENT & SYSTEM CONTEXT
const SYSTEM_STATE = {
  selectedCityId: null,
  activeRouteProgress: 74,
  currentAutopilotSpeed: 84,
  cleanFunds: 117617.95,
  dirtyFunds: 24500.00,
  policeHeat: 25,
  simulationTime: new Date("2026-06-01T09:26:42"),
  consoleLines: [
    { type: "success", text: "SYSTEM: Redesigned core engine compiled. 13 high-density nodes resolved." },
    { type: "info", text: "LINK: Handshake completed. Secure cryptographic routing layer online." },
    { type: "info", text: "DECRYPTION: Rotating dynamic hashes. Active key sequence validated." },
    { type: "warn", text: "HAZARD: External checkpoint 'Brest-Terespol' reports intensive scanning." }
  ],
  dropdowns: {
    garage: false,
    support: false
  },
  token: null,
  user: null,
  activeTruckId: null,
  socket: null,
  socketConnected: false,
  restUrl: 'http://localhost:3000',
  ownedGarages: new Set(Object.keys(CITIES_DATASET)) // FOREVER UNLOCKED FOR DISTRICT OPERATOR
};

// 3. SELECTION & DOM CACHING
const UI_NODES = {
  mapSvg: document.getElementById("map-svg"),
  consoleBox: document.getElementById("console-log"),
  cleanAmount: document.getElementById("clean-amount"),
  dirtyAmount: document.getElementById("dirty-amount"),
  systemClock: document.getElementById("system-clock"),
  policeHeatText: document.getElementById("police-heat-val"),
  policeHeatSegments: document.querySelectorAll(".heat-segment"),
  repStarGrid: document.getElementById("rep-star-grid"),
  repScoreVal: document.getElementById("rep-score-val"),

  // Left Panel Dynamic Nodes
  citySelectorIdle: document.getElementById("selector-idle"),
  citySelectorActive: document.getElementById("selector-active"),
  activeCityName: document.getElementById("active-city-name"),
  activeCityZone: document.getElementById("active-city-zone"),
  activeConnectionsContainer: document.getElementById("active-connections-list"),

  // Right Sidebar City Widget
  sidebarCityIdle: document.getElementById("sidebar-city-idle"),
  sidebarCityActive: document.getElementById("sidebar-city-active"),
  sidebarCityName: document.getElementById("sidebar-city-name"),
  sidebarCityZoneBadge: document.getElementById("sidebar-city-zone-badge"),
  sidebarConnectionsCount: document.getElementById("sidebar-connections-count"),
  sidebarPurchaseContainer: document.getElementById("sidebar-purchase-container"),

  // Floating dropdown menus
  garageMenu: document.getElementById("garage-overlay"),
  supportMenu: document.getElementById("support-overlay"),
  garageBtn: document.getElementById("btn-garage-toggle"),
  supportBtn: document.getElementById("btn-support-toggle"),

  // Audio system elements
  soundToggleBtn: document.getElementById("sound-toggle-btn"),
  audioStatusText: document.querySelector("#sound-toggle-btn .audio-status-text"),

  // Checkpoint simulation elements
  triggerCheckpointBtn: document.getElementById("btn-trigger-checkpoint"),
  checkpointOverlay: document.getElementById("checkpoint-overlay"),
  btnChoiceScan: document.getElementById("btn-choice-scan"),
  btnChoiceBribe: document.getElementById("btn-choice-bribe"),
  btnChoiceRun: document.getElementById("btn-choice-run"),

  // API Sync & Connection Elements
  apiAuthOverlay: document.getElementById("api-auth-overlay"),
  apiStatusDot: document.getElementById("api-status-dot"),
  apiUnauthView: document.getElementById("api-unauth-view"),
  apiAuthView: document.getElementById("api-auth-view"),
  apiUrlInput: document.getElementById("api-url-input"),
  apiUsernameInput: document.getElementById("api-username-input"),
  apiPasswordInput: document.getElementById("api-password-input"),
  btnApiLogin: document.getElementById("btn-api-login"),
  btnApiRegister: document.getElementById("btn-api-register"),
  btnApiDisconnect: document.getElementById("btn-api-disconnect"),
  apiCompanyName: document.getElementById("api-company-name"),
  apiCompanyId: document.getElementById("api-company-id"),
  apiSocketStatus: document.getElementById("api-socket-status"),

  // Calibration Sliders and Preset Buttons
  sliderVignette: document.getElementById("slider-vignette"),
  valVignette: document.getElementById("val-vignette"),
  sliderScanline: document.getElementById("slider-scanline"),
  valScanline: document.getElementById("val-scanline"),
  sliderCurvature: document.getElementById("slider-curvature"),
  valCurvature: document.getElementById("val-curvature"),
  sliderDensity: document.getElementById("slider-density"),
  valDensity: document.getElementById("val-density"),
  btnPresetStandard: document.getElementById("btn-preset-standard"),
  btnPresetUltra: document.getElementById("btn-preset-ultra"),
  closeSupportBtn: document.getElementById("close-support-btn")
};

// 4. INITIALIZATION & BOOT LOADER
window.addEventListener("DOMContentLoaded", async () => {
  bootSystemDiagnostics();
  await renderTacticalMap(); // async: loads real world geo data before rendering nodes
  initializeEventListeners();
  initializeGraphicsCalibration(); // Interactive Calibration Sliders
  startSystemTimeLoop();
  synchronizeUI();
  restoreSessionOnBoot(); // Restore session from localStorage if available
  
  // Dynamic Surcharge Telemetry Banner Checker
  setTimeout(checkActiveRouteSurcharges, 500);
  setInterval(checkActiveRouteSurcharges, 10000);

  // Poll for active fleet routes to animate on map
  setTimeout(pollActiveRoutesForMap, 1000);
  setInterval(pollActiveRoutesForMap, 3000);
});

/**
 * Boot Diagnostic scrolling terminal feedback
 */
function bootSystemDiagnostics() {
  UI_NODES.consoleBox.replaceChildren();
  SYSTEM_STATE.consoleLines.forEach(line => appendTerminalLine(line.text, line.type));
}

/**
 * Handle system background clocks
 */
function startSystemTimeLoop() {
  setInterval(() => {
    // Occasional simulated terminal activity
    if (Math.random() < 0.15) {
      triggerSimulatedTelemetry();
    }
  }, 4000);
}

// ==========================================================================
// 5. REAL GEOGRAPHIC MAP RENDERING (Natural Earth + Mercator Projection)
// ==========================================================================

/**
 * Compute projected {x, y} for a city using its lat/lon.
 * Falls back to city.coords if lat/lon not set.
 */
function getCityXY(city) {
  if (city.lat !== undefined && city.lon !== undefined) {
    return projectCoord(city.lon, city.lat);
  }
  // Legacy fallback
  return city.coords || { x: 500, y: 300 };
}

/**
 * Main entry: renders the geographic map with real world data,
 * then overlays routes and city nodes.
 */
async function renderTacticalMap() {
  const svg = UI_NODES.mapSvg;

  // Clean all previous dynamic content, preserving <defs> filters
  Array.from(svg.children).forEach(child => {
    if (child.tagName !== 'defs') child.remove();
  });

  // A. Load and render real geographic base map
  await loadAndRenderGeoMap(svg);

  // Create groups for links and nodes so they scale together
  let linkGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  linkGroup.setAttribute('id', 'link-layer');
  svg.appendChild(linkGroup);

  let nodeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  nodeGroup.setAttribute('id', 'node-layer');
  svg.appendChild(nodeGroup);

  // B. Draw Route connection lines (tactical transport channels)
  const renderedConnections = new Set();

  Object.keys(CITIES_DATASET).forEach(cityId => {
    const city = CITIES_DATASET[cityId];
    const cityXY = getCityXY(city);

    city.connections.forEach(targetId => {
      const target = CITIES_DATASET[targetId];
      if (!target) return;

      // Unique identifier for route to avoid double drawing
      const connKey = [cityId, targetId].sort().join("-");
      if (renderedConnections.has(connKey)) return;
      renderedConnections.add(connKey);

      const targetXY = getCityXY(target);

      const isFerry = ["stockholm-tallinn", "stockholm-gdansk", "helsinki-tallinn", "stockholm-turku"].includes(connKey) || 
                      ["tallinn-stockholm", "gdansk-stockholm", "tallinn-helsinki", "turku-stockholm"].includes(connKey);

      const isTunnel = ["london-paris", "paris-london"].includes(connKey);

      const isFuelRoute = [
        "istanbul-ankara", "ankara-istanbul", 
        "ankara-tehran", "tehran-ankara", 
        "tehran-kabul", "kabul-tehran", 
        "ankara-baghdad", "baghdad-ankara", 
        "baghdad-riyadh", "riyadh-baghdad", 
        "riyadh-dubai", "dubai-riyadh", 
        "tehran-dubai", "dubai-tehran"
      ].includes(connKey);

      // Route parameters
      let strokeColor = "rgba(0, 255, 102, 0.30)";
      let dashArray = "none";
      let isSeaRoute = isFerry;

      if (isTunnel) {
        strokeColor = "rgba(200, 50, 255, 0.6)"; // Neon Purple for the Eurotunnel
        dashArray = "10, 5";
      } else if (isFuelRoute) {
        strokeColor = "rgba(255, 215, 0, 0.7)"; // Glowing Gold Pipeline
        dashArray = "15, 5, 5, 5";
      } else if (isSeaRoute) {
        strokeColor = "rgba(0, 229, 255, 0.5)"; // Neon Blue
        dashArray = "4, 6";
      } else if (!city.isSchengen || !target.isSchengen) {
        strokeColor = "rgba(255, 102, 0, 0.45)";
        dashArray = "6, 4";
      }

      if (city.heat > 50 || target.heat > 50) {
        strokeColor = "rgba(255, 0, 60, 0.65)";
        dashArray = "3, 4";
      }

      // Draw baseline static line path
      const pathLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
      pathLine.setAttribute("d", `M ${cityXY.x.toFixed(1)} ${cityXY.y.toFixed(1)} L ${targetXY.x.toFixed(1)} ${targetXY.y.toFixed(1)}`);
      pathLine.setAttribute("stroke", strokeColor);
      pathLine.setAttribute("stroke-width", "1.5");
      pathLine.setAttribute("stroke-dasharray", dashArray);
      pathLine.setAttribute("fill", "none");
      linkGroup.appendChild(pathLine);

      // Animated glowing data packet stream
      if ((city.isSchengen && target.isSchengen) || isFuelRoute) {
        if (Math.random() < 0.5 || isFuelRoute) {
          const streamPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
          streamPath.setAttribute("d", `M ${cityXY.x.toFixed(1)} ${cityXY.y.toFixed(1)} L ${targetXY.x.toFixed(1)} ${targetXY.y.toFixed(1)}`);
          streamPath.setAttribute("stroke", isFuelRoute ? "rgba(255, 215, 0, 0.8)" : "var(--neon-green)");
          streamPath.setAttribute("stroke-width", isFuelRoute ? "3.5" : "2.5");
          streamPath.setAttribute("stroke-linecap", "round");
          streamPath.setAttribute("stroke-dasharray", isFuelRoute ? "20, 100" : "15, 120");
          streamPath.setAttribute("fill", "none");
          if (!isFuelRoute) streamPath.style.filter = "url(#glow-green)";
          streamPath.style.animation = "flow-streams 6s linear infinite";
          linkGroup.appendChild(streamPath);
        }
      }
    });
  });

  // C. Draw Interactive City Coordinate Nodes
  Object.keys(CITIES_DATASET).forEach(cityId => {
    const city = CITIES_DATASET[cityId];
    const { x, y } = getCityXY(city);

    // Skip cities that project outside the viewport
    if (x < -20 || x > MAP_GEO.svgW + 20 || y < -20 || y > MAP_GEO.svgH + 20) return;

    // Neon color by security status
    let nodeColor = "var(--neon-green)";
    let nodeFill  = "var(--neon-green-dark)";
    let glowFilter = "url(#glow-green)";

    if (!city.isSchengen) {
      nodeColor  = "var(--neon-orange)";
      nodeFill   = "var(--neon-orange-dark)";
      glowFilter = "url(#glow-orange)";
    }
    if (city.heat > 50) {
      nodeColor  = "var(--neon-red)";
      nodeFill   = "var(--neon-red-dark)";
      glowFilter = "url(#glow-red)";
    }

    const gGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gGroup.setAttribute("class", "map-node-group");
    gGroup.setAttribute("data-id", city.id);
    if (city.purchasable) gGroup.setAttribute("data-purchasable", "true");
    gGroup.style.setProperty("--node-color", nodeColor);
    gGroup.setAttribute("cursor", "pointer");

    gGroup.addEventListener("click", () => handleCitySelection(city.id));
    
    // Quick Dispatch Action (Double click)
    gGroup.addEventListener("dblclick", () => {
      window.location.href = `dispatch.html?origin=${city.id}`;
    });

    // Outer concentric locator ring
    const outerRing = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    outerRing.setAttribute("cx", x.toFixed(1));
    outerRing.setAttribute("cy", y.toFixed(1));
    outerRing.setAttribute("r", "12");
    outerRing.setAttribute("fill", "none");
    outerRing.setAttribute("stroke", nodeColor);
    outerRing.setAttribute("stroke-width", "1");
    outerRing.setAttribute("stroke-opacity", "0.3");
    gGroup.appendChild(outerRing);

    // Inner glowing core
    const corePoint = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    corePoint.setAttribute("cx", x.toFixed(1));
    corePoint.setAttribute("cy", y.toFixed(1));
    corePoint.setAttribute("r", "7");
    corePoint.setAttribute("fill", nodeFill);
    corePoint.setAttribute("stroke", nodeColor);
    corePoint.setAttribute("stroke-width", "2");
    corePoint.setAttribute("filter", glowFilter);
    if (city.heat > 50) {
      corePoint.style.animation = "heart-pulse 1s infinite";
    }
    gGroup.appendChild(corePoint);

    // Node label
    const nodeLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    nodeLabel.setAttribute("x", (x + 14).toFixed(1));
    nodeLabel.setAttribute("y", (y + 4).toFixed(1));
    nodeLabel.setAttribute("fill", nodeColor);
    nodeLabel.setAttribute("font-family", "var(--font-mono)");
    nodeLabel.setAttribute("font-size", "10px");
    nodeLabel.setAttribute("font-weight", "bold");
    nodeLabel.setAttribute("pointer-events", "none");
    nodeLabel.textContent = `NODE_${city.id.slice(0, 3).toUpperCase()}`;
    gGroup.appendChild(nodeLabel);

    nodeGroup.appendChild(gGroup);
  });
  
  // Highlight owned garages if already loaded
  updateMapHighlights();
}

function updateMapHighlights() {
  document.querySelectorAll(".map-node-group").forEach(group => {
    const cityId = group.getAttribute("data-id");
    const city = CITIES_DATASET[cityId];
    if (SYSTEM_STATE.ownedGarages && SYSTEM_STATE.ownedGarages.has(cityId)) {
      const core = group.querySelector("circle:nth-child(2)");
      if (core) {
        // Highlight owned cities in cyan
        core.setAttribute("fill", "var(--neon-blue)");
        core.setAttribute("stroke", "var(--neon-blue-glow)");
        core.setAttribute("filter", "url(#glow-blue)");
      }
    }
  });
}

// --------------------------------------------------------------------------
// LIVE FLEET TRACKING - ANIMATE TRUCKS ON MAP
// --------------------------------------------------------------------------
const ACTIVE_TRUCK_MARKERS = new Map();

async function pollActiveRoutesForMap() {
  if (!SYSTEM_STATE.token) return;
  try {
    const res = await fetch(`${SYSTEM_STATE.restUrl}/api/dispatch/active`, {
      headers: { 'Authorization': `Bearer ${SYSTEM_STATE.token}` }
    });
    if (!res.ok) return;
    const routes = await res.json();
    renderLiveTrucks(routes);
  } catch (err) {
    // Silent fail if backend down
  }
}

function renderLiveTrucks(routes) {
  const svg = UI_NODES.mapSvg;
  // Ensure we have a truck group that stays above geo and links but below nodes
  let truckGroup = document.getElementById('truck-layer');
  if (!truckGroup) {
    truckGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    truckGroup.setAttribute('id', 'truck-layer');
    // Insert after the routes, before nodes if possible, but appending is fine for now
    svg.appendChild(truckGroup); 
  }

  const currentIds = new Set();

  routes.forEach(route => {
    const truckId = route.truck.id;
    currentIds.add(truckId);

    let originId = route.originCity || (route.legalContract ? route.legalContract.origin : route.contrabandJob.origin);
    let destId = route.currentCity || (route.legalContract ? route.legalContract.destination : route.contrabandJob.destination);
    
    // In our backend logic, currentCity is the origin, destination is from contract
    const dest = route.legalContract ? route.legalContract.destination : route.contrabandJob.destination;
    const orig = route.currentCity;

    const originCity = CITIES_DATASET[orig];
    const destCity = CITIES_DATASET[dest];

    if (!originCity || !destCity) return;

    const originXY = getCityXY(originCity);
    const destXY = getCityXY(destCity);

    // Interpolate position based on progress
    const progress = (route.progressPct || 0) / 100;
    const currentX = originXY.x + (destXY.x - originXY.x) * progress;
    const currentY = originXY.y + (destXY.y - originXY.y) * progress;

    let marker = ACTIVE_TRUCK_MARKERS.get(truckId);
    if (!marker) {
      marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      marker.setAttribute('r', '4');
      marker.setAttribute('fill', 'var(--neon-green)');
      marker.setAttribute('stroke', '#fff');
      marker.setAttribute('stroke-width', '1');
      marker.setAttribute('filter', 'url(#glow-green)');
      marker.style.transition = 'cx 3s linear, cy 3s linear';
      truckGroup.appendChild(marker);
      ACTIVE_TRUCK_MARKERS.set(truckId, marker);
    }

    marker.setAttribute('cx', currentX.toFixed(2));
    marker.setAttribute('cy', currentY.toFixed(2));
  });

  // Cleanup completed routes
  for (let [id, marker] of ACTIVE_TRUCK_MARKERS.entries()) {
    if (!currentIds.has(id)) {
      marker.remove();
      ACTIVE_TRUCK_MARKERS.delete(id);
    }
  }
}

// 6. EVENT INTERACTION & ROUTE HANDLERS
function initializeEventListeners() {
  // Sound system toggle
  UI_NODES.soundToggleBtn.addEventListener("click", () => {
    AUDIO.muted = !AUDIO.muted;
    UI_NODES.soundToggleBtn.classList.toggle("muted", AUDIO.muted);
    UI_NODES.audioStatusText.textContent = AUDIO.muted ? "SYNTH_OFF" : "SYNTH_ON";
    
    if (!AUDIO.muted) {
      AUDIO.playClick();
      appendTerminalLine("SYSTEM: Audio synthesizer online.", "success");
    } else {
      appendTerminalLine("SYSTEM: Audio synthesizer muted.", "warn");
    }
  });

  // Universal mouseover clicks & hovers for micro-chirps
  document.querySelectorAll(".nav-op-btn, .hud-control-btn, .checkpoint-choice-btn, .simulator-trigger-btn, .settings-close-btn, .preset-profile-btn").forEach(btn => {
    btn.addEventListener("mouseenter", () => AUDIO.playHover());
    btn.addEventListener("click", () => AUDIO.playClick());
  });

  // Hover chirps for settings sliders
  document.querySelectorAll(".settings-range-slider").forEach(slider => {
    slider.addEventListener("mouseenter", () => AUDIO.playHover());
  });

  // Toggle Overlays inside map canvas
  UI_NODES.garageBtn.addEventListener("click", () => toggleOverlay("garage"));
  UI_NODES.supportBtn.addEventListener("click", () => toggleOverlay("support"));

  // Checkpoint simulation trigger
  UI_NODES.triggerCheckpointBtn.addEventListener("click", () => {
    AUDIO.playSiren();
    UI_NODES.checkpointOverlay.style.display = "block";
    appendTerminalLine("ALERT: Security checkpoint interception active at Brest-Terespol!", "warn");
  });

  // Checkpoint choice buttons
  UI_NODES.btnChoiceScan.addEventListener("click", resolveCheckpointScan);
  UI_NODES.btnChoiceBribe.addEventListener("click", resolveCheckpointBribe);
  UI_NODES.btnChoiceRun.addEventListener("click", resolveCheckpointRun);

  // Navigation operation button active triggers
  const navButtons = document.querySelectorAll(".nav-op-btn:not(.btn-terminate)");
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      navButtons.forEach(b => b.classList.remove("active-orange"));
      btn.classList.add("active-orange");
      
      const moduleName = btn.querySelector(".nav-op-text").textContent;
      appendTerminalLine(`COMMAND: Accessing '${moduleName}' operational interface.`, "success");
    });
  });

  // Guarded session termination
  document.querySelector(".btn-terminate").addEventListener("click", () => {
    AUDIO.playFailure();
    appendTerminalLine("ALERT: Terminal session termination initiated...", "warn");
    setTimeout(() => {
      alert("SESSION TERMINATED: Awaiting manual decrypt reboot.");
    }, 500);
  });

  // Generic HUD sub-module buttons
  document.querySelectorAll(".hud-control-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const taskLabel = btn.querySelector("span").textContent;
      appendTerminalLine(`UTILITY: Launching module ${taskLabel}...`, "info");
    });
  });

  // API Auth Listeners
  UI_NODES.btnApiLogin.addEventListener("click", handleApiLogin);
  UI_NODES.btnApiRegister.addEventListener("click", handleApiRegister);
  UI_NODES.btnApiDisconnect.addEventListener("click", handleApiDisconnect);
  
  // Play hovers/clicks on these buttons too
  document.querySelectorAll(".api-action-btn").forEach(btn => {
    btn.addEventListener("mouseenter", () => AUDIO.playHover());
    btn.addEventListener("click", () => AUDIO.playClick());
  });
}

/**
 * Interactive City Selection Handler
 */
function handleCitySelection(cityId) {
  SYSTEM_STATE.selectedCityId = cityId;
  const city = CITIES_DATASET[cityId];
  if (!city) return;

  AUDIO.playHandshake();
  appendTerminalLine(`HANDSHAKE: City node '${city.name.toUpperCase()}' selected. Querying databases...`, "info");

  // Left panel update
  if (UI_NODES.citySelectorIdle) UI_NODES.citySelectorIdle.style.display = "none";
  if (UI_NODES.citySelectorActive) UI_NODES.citySelectorActive.classList.add("visible");
  if (UI_NODES.activeCityName) UI_NODES.activeCityName.textContent = city.name.toUpperCase();
  if (UI_NODES.activeCityZone) {
    UI_NODES.activeCityZone.textContent = `ZONE: ${city.isSchengen ? "ACTIVE (SCHENGEN)" : "RESTRICTED (EXTERNAL)"}`;
    UI_NODES.activeCityZone.style.color = city.isSchengen ? "var(--neon-green)" : "var(--neon-orange)";
    UI_NODES.activeCityZone.style.borderColor = city.isSchengen ? "var(--neon-green)" : "var(--neon-orange)";
    UI_NODES.activeCityZone.style.background = city.isSchengen ? "var(--neon-green-dark)" : "var(--neon-orange-dark)";
  }

  // Right sidebar city widget update
  if (UI_NODES.sidebarCityIdle) UI_NODES.sidebarCityIdle.style.display = "none";
  if (UI_NODES.sidebarCityActive) UI_NODES.sidebarCityActive.style.display = "block";
  if (UI_NODES.sidebarCityName) UI_NODES.sidebarCityName.textContent = city.name.toUpperCase();
  if (UI_NODES.sidebarCityZoneBadge) {
    UI_NODES.sidebarCityZoneBadge.textContent = city.isSchengen ? "✓ SCHENGEN ZONE" : "⚠ EXTERNAL ZONE";
    UI_NODES.sidebarCityZoneBadge.style.color = city.isSchengen ? "var(--neon-green)" : "var(--neon-orange)";
  }
  if (UI_NODES.sidebarConnectionsCount) {
    UI_NODES.sidebarConnectionsCount.textContent = `${city.connections.length} CONNECTIONS`;
  }

  // Render purchase button if purchasable and not owned
  if (UI_NODES.sidebarPurchaseContainer) {
    UI_NODES.sidebarPurchaseContainer.innerHTML = "";
    if (city.purchasable && !SYSTEM_STATE.ownedGarages.has(cityId)) {
      const btn = document.createElement("button");
      btn.className = "nav-op-btn btn-orange";
      btn.style.width = "100%";
      btn.style.marginTop = "var(--space-3)";
      btn.innerHTML = `<span class="nav-op-text">SECURE TERMINAL ($${city.terminalCost.toLocaleString()})</span>`;
      btn.addEventListener("click", () => purchaseTerminalFromMap(cityId));
      btn.addEventListener("mouseenter", () => AUDIO.playHover());
      UI_NODES.sidebarPurchaseContainer.appendChild(btn);
    } else if (SYSTEM_STATE.ownedGarages.has(cityId)) {
      const badge = document.createElement("div");
      badge.style.marginTop = "var(--space-3)";
      badge.style.fontFamily = "var(--font-mono)";
      badge.style.fontSize = "10px";
      badge.style.color = "var(--neon-blue)";
      badge.style.textAlign = "center";
      badge.textContent = "✓ TERMINAL SECURED";
      UI_NODES.sidebarPurchaseContainer.appendChild(badge);
    }
  }

  // Left panel connections list
  if (UI_NODES.activeConnectionsContainer) {
    UI_NODES.activeConnectionsContainer.replaceChildren();
    city.connections.forEach(connId => {
      const connCity = CITIES_DATASET[connId];
      if (!connCity) return;
      const row = document.createElement("div");
      row.className = "connection-node-row";
      row.innerHTML = `
        <span class="connection-node-name">NODE_${connId.slice(0, 3).toUpperCase()} (${connCity.name})</span>
        <span class="connection-node-dist">${calculateDistance(city, connCity)} KM</span>
      `;
      UI_NODES.activeConnectionsContainer.appendChild(row);
    });
  }

  // Highlight selected node in SVG
  document.querySelectorAll(".map-node-group").forEach(group => {
    const isSelected = group.getAttribute("data-id") === cityId;
    const core = group.querySelector("circle:nth-child(2)");
    if (core) {
      core.setAttribute("r", isSelected ? "10" : "7");
      core.setAttribute("stroke-width", isSelected ? "3.5" : "2");
    }
  });
}

async function purchaseTerminalFromMap(cityId) {
  AUDIO.playClick();
  const city = CITIES_DATASET[cityId];
  if (!confirm(`Are you sure you want to purchase a terminal node in ${city.name.toUpperCase()} for $${city.terminalCost.toLocaleString()}?`)) return;

  if (!SYSTEM_STATE.token) {
    appendTerminalLine("ERROR: Must be authenticated to secure terminals.", "warn");
    return;
  }

  try {
    const response = await fetch(`${SYSTEM_STATE.restUrl}/api/garage/purchase-terminal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SYSTEM_STATE.token}`
      },
      body: JSON.stringify({ cityId })
    });

    if (response.ok) {
      AUDIO.playSuccess();
      appendTerminalLine(`SUCCESS: Secured terminal in ${city.name.toUpperCase()}.`, "success");
      // Refresh fleet and balances
      fetchFleet();
      fetchBalances();
    } else {
      const errData = await response.json();
      AUDIO.playFailure();
      appendTerminalLine(`PURCHASE ERROR: ${errData.message || 'Verification failed.'}`, "warn");
      alert(`PURCHASE ERROR: ${errData.message || 'Verification failed.'}`);
    }
  } catch (err) {
    console.error("Purchase error:", err);
    appendTerminalLine("PURCHASE ERROR: Network timeout.", "warn");
  }
}

function calculateDistance(city1, city2) {
  // Use projected coordinates for display distance
  const p1 = getCityXY(city1);
  const p2 = getCityXY(city2);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.round(Math.sqrt(dx * dx + dy * dy) * 1.62); // Simulated KM scale factor
}

function toggleOverlay(type) {
  const targetState = !SYSTEM_STATE.dropdowns[type];
  
  // Enforce mutual exclusivity - close the other overlay
  const otherType = type === "garage" ? "support" : "garage";
  SYSTEM_STATE.dropdowns[otherType] = false;
  const otherMenu = otherType === "garage" ? UI_NODES.garageMenu : UI_NODES.supportMenu;
  if (otherMenu) otherMenu.style.display = "none";
  
  // Set the selected overlay state
  SYSTEM_STATE.dropdowns[type] = targetState;
  const menu = type === "garage" ? UI_NODES.garageMenu : UI_NODES.supportMenu;
  if (menu) menu.style.display = targetState ? "block" : "none";
  
  appendTerminalLine(`HUD: Map overlay '${type.toUpperCase()}' ${targetState ? "opened" : "closed"}.`, "info");
}

// 7. UI PRESENTATION SYNCHRONIZATION
function synchronizeUI() {
  // Financial accounts
  UI_NODES.cleanAmount.textContent = `$${SYSTEM_STATE.cleanFunds.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  UI_NODES.dirtyAmount.textContent = `$${SYSTEM_STATE.dirtyFunds.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  // SVG Star grid — fill top row L→R then bottom row L→R based on rep score (0–10)
  const repScore = SYSTEM_STATE.reputationScore || 7.5;
  if (UI_NODES.repStarGrid) {
    const stars = UI_NODES.repStarGrid.querySelectorAll(".rep-star");
    stars.forEach((star, i) => {
      const threshold = i + 1; // star i+1 fills if score >= i+1
      if (repScore >= threshold) {
        star.classList.add("filled");
        star.classList.remove("partial");
      } else if (repScore > i && repScore < threshold) {
        star.classList.add("partial");
        star.classList.remove("filled");
      } else {
        star.classList.remove("filled", "partial");
      }
    });
  }
  if (UI_NODES.repScoreVal) UI_NODES.repScoreVal.textContent = repScore.toFixed(1);

  // Police heat segments
  if (UI_NODES.policeHeatText) UI_NODES.policeHeatText.textContent = `${SYSTEM_STATE.policeHeat}%`;
  const filledHeat = Math.round(SYSTEM_STATE.policeHeat / 10);
  UI_NODES.policeHeatSegments.forEach((seg, index) => {
    if (index < filledHeat) seg.classList.add("active");
    else seg.classList.remove("active");
  });
}

/**
 * Dynamically print a new diagnostic line inside terminal console log box
 */
function appendTerminalLine(text, type = "info") {
  const time = new Date().toTimeString().split(" ")[0];
  const line = document.createElement("div");
  line.className = `log-line ${type === "success" ? "success" : type === "warn" ? "warn" : ""}`;

  const timeSpan = document.createElement("span");
  timeSpan.style.color = "var(--color-text-muted)";
  timeSpan.textContent = `[${time}] `;

  const textNode = document.createTextNode(text);

  line.appendChild(timeSpan);
  line.appendChild(textNode);
  
  UI_NODES.consoleBox.appendChild(line);
  UI_NODES.consoleBox.scrollTop = UI_NODES.consoleBox.scrollHeight;
}

/**
 * Generate casual mock background events to simulate live truck deliveries and terminal updates
 */
function triggerSimulatedTelemetry() {
  const logs = [
    "TELEMETRY: Carrier tracking driver fatigue level: STABLE.",
    "NETWORK: Signal encryption handshake refreshed.",
    "SYS: Memory buffer flush: 100% packets preserved.",
    "WARN: Fluctuations in EV Grid prices detected in Warsaw silo.",
    "LINK: Fleet tachograph report generated for TRUCK_REG_72."
  ];
  
  const typeChance = Math.random();
  const logType = typeChance < 0.15 ? "warn" : typeChance < 0.35 ? "success" : "info";
  const selectLog = logs[Math.floor(Math.random() * logs.length)];

  appendTerminalLine(selectLog, logType);
}

// ==========================================================================
// 8. BORDER CHECKPOINT SIMULATOR ACTION MATRIX
// ==========================================================================
function closeCheckpoint() {
  UI_NODES.checkpointOverlay.style.display = "none";
}

function resolveCheckpointScan() {
  if (SYSTEM_STATE.socketConnected && SYSTEM_STATE.activeTruckId) {
    appendTerminalLine("SCANNING: Querying server-side X-ray scan clearances...", "info");
    const packet = {
      type: 'border:calculate_clearance',
      payload: {
        truckId: SYSTEM_STATE.activeTruckId,
        action: 'CLEARANCE'
      },
      requestId: 'req_scan_' + Date.now()
    };
    SYSTEM_STATE.socket.send(JSON.stringify(packet));
  } else {
    appendTerminalLine("SCANNING: Initiating deep-structure X-ray sweep of cargo deck (offline fallback)...", "info");
    
    setTimeout(() => {
      const success = Math.random() > 0.65; // 65% base detection risk
      if (success) {
        AUDIO.playSuccess();
        appendTerminalLine("CLEAR: Cargo shielding patterns matched background radiation. Clearance approved.", "success");
        closeCheckpoint();
      } else {
        AUDIO.playFailure();
        SYSTEM_STATE.cleanFunds = Math.max(0, SYSTEM_STATE.cleanFunds - 15000);
        SYSTEM_STATE.policeHeat = Math.min(100, SYSTEM_STATE.policeHeat + 20);
        synchronizeUI();
        appendTerminalLine("BUSTED! Scan revealed contraband materials. Fine of $15,000 issued. Police Heat increased +20 units.", "warn");
        closeCheckpoint();
      }
    }, 1200);
  }
}

function resolveCheckpointBribe() {
  if (SYSTEM_STATE.socketConnected && SYSTEM_STATE.activeTruckId) {
    if (SYSTEM_STATE.dirtyFunds < 3200) {
      AUDIO.playFailure();
      appendTerminalLine("ERROR: Insufficient untracked black-market cash to satisfy $3,200 demand.", "warn");
      return;
    }
    appendTerminalLine("TRANSACTION: Slipping $3,200 dirty reserve bills. Server-side processing...", "info");
    const packet = {
      type: 'border:calculate_clearance',
      payload: {
        truckId: SYSTEM_STATE.activeTruckId,
        action: 'BRIBE',
        bribeAmount: 3200
      },
      requestId: 'req_bribe_' + Date.now()
    };
    SYSTEM_STATE.socket.send(JSON.stringify(packet));
  } else {
    if (SYSTEM_STATE.dirtyFunds < 3200) {
      AUDIO.playFailure();
      appendTerminalLine("ERROR: Insufficient untracked black-market cash to satisfy $3,200 demand.", "warn");
      return;
    }
    
    // Deduct dirty funds
    SYSTEM_STATE.dirtyFunds -= 3200;
    synchronizeUI();
    appendTerminalLine("TRANSACTION: Slipping $3,200 dirty reserve bills into official clipboard...", "info");
    
    setTimeout(() => {
      const success = Math.random() < 0.55; // 55% base success rate
      if (success) {
        AUDIO.playSuccess();
        appendTerminalLine("BRIBE ACCEPTED: Inspector clears tachograph warning logs. Secure passage confirmed.", "success");
        closeCheckpoint();
      } else {
        AUDIO.playFailure();
        appendTerminalLine("REJECTED: Customs official refused transaction. Confiscating cash! Initiating mandatory sensor scan with 2.0x detection penalty...", "warn");
        
        setTimeout(() => {
          AUDIO.playFailure();
          SYSTEM_STATE.cleanFunds = Math.max(0, SYSTEM_STATE.cleanFunds - 15000);
          SYSTEM_STATE.policeHeat = Math.min(100, SYSTEM_STATE.policeHeat + 35);
          synchronizeUI();
          appendTerminalLine("BUSTED! Cargo seized. Criminal logistics citation filed. Fine of $15,000 processed. Police Heat increased +35 units.", "warn");
          closeCheckpoint();
        }, 1500);
      }
    }, 1200);
  }
}

function resolveCheckpointRun() {
  if (SYSTEM_STATE.socketConnected && SYSTEM_STATE.activeTruckId) {
    appendTerminalLine("WARNING: Red-lining engine. Smashing entry gate. Server-side processing...", "warn");
    const packet = {
      type: 'border:calculate_clearance',
      payload: {
        truckId: SYSTEM_STATE.activeTruckId,
        action: 'RUN'
      },
      requestId: 'req_run_' + Date.now()
    };
    SYSTEM_STATE.socket.send(JSON.stringify(packet));
  } else {
    appendTerminalLine("WARNING: Red-lining engine cylinders. Forcing entry vector barricade smash!", "warn");
    
    setTimeout(() => {
      const success = Math.random() < 0.45; // 45% escape rate
      if (success) {
        AUDIO.playSuccess();
        SYSTEM_STATE.policeHeat = Math.min(100, SYSTEM_STATE.policeHeat + 35);
        synchronizeUI();
        appendTerminalLine("ESCAPE SUCCESS: Smashed through check-gates. Out-paced border interceptors. Police Heat increased +35 units.", "success");
        closeCheckpoint();
      } else {
        AUDIO.playFailure();
        SYSTEM_STATE.policeHeat = Math.min(100, SYSTEM_STATE.policeHeat + 50);
        SYSTEM_STATE.currentAutopilotSpeed = 0; // engine blown
        synchronizeUI();
        appendTerminalLine("CRASHED! Spike strips destroyed chassis steering. Truck engine disabled. Driver jailed. Heat spiked +50 units.", "warn");
        closeCheckpoint();
      }
    }, 1200);
  }
}

// ==========================================================================
// 9. API INTEGRATION, WEBSOCKET BRIDGE & OPERATOR SESSION OPERATIONS
// ==========================================================================
function connectWebSocket(token, restUrl) {
  try {
    let wsUrlStr = restUrl.replace(/^http/, 'ws');
    if (wsUrlStr.endsWith('/')) {
      wsUrlStr = wsUrlStr.slice(0, -1);
    }
    const wsUrl = `${wsUrlStr}/ws?token=${encodeURIComponent(token)}`;
    
    appendTerminalLine(`WS: Connecting to telemetry feed at ${wsUrlStr}/ws...`, "info");
    
    const socket = new WebSocket(wsUrl);
    SYSTEM_STATE.socket = socket;
    
    socket.onopen = () => {
      SYSTEM_STATE.socketConnected = true;
      UI_NODES.apiStatusDot.style.backgroundColor = "var(--neon-green)";
      UI_NODES.apiSocketStatus.textContent = "CONNECTED_WS";
      UI_NODES.apiSocketStatus.style.color = "var(--neon-green)";
      
      appendTerminalLine("WS: Live secure telemetry link established.", "success");
      AUDIO.playSuccess();
      
      // Update UI Views
      UI_NODES.apiUnauthView.style.display = "none";
      UI_NODES.apiAuthView.style.display = "block";
      
      // Fetch latest fleet & financial balances
      fetchFleet();
      fetchBalances();
    };
    
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWSMessage(msg);
      } catch (err) {
        console.error("Failed to parse WS message", err);
      }
    };
    
    socket.onclose = (event) => {
      const wasConnected = SYSTEM_STATE.socketConnected;
      SYSTEM_STATE.socketConnected = false;
      SYSTEM_STATE.socket = null;
      
      UI_NODES.apiStatusDot.style.backgroundColor = "var(--neon-red)";
      UI_NODES.apiSocketStatus.textContent = "OFFLINE";
      UI_NODES.apiSocketStatus.style.color = "var(--neon-red)";
      
      if (wasConnected) {
        appendTerminalLine(`WS: Telemetry tunnel severed (Code: ${event.code}). Degrading to offline simulation mode...`, "warn");
        AUDIO.playFailure();
      }
    };
    
    socket.onerror = (err) => {
      console.error("WS error:", err);
      appendTerminalLine("WS: Transmission error occurred on telemetry pipeline.", "warn");
    };
  } catch (err) {
    console.error("WS connection error:", err);
    appendTerminalLine("WS: Connection setup failed.", "warn");
  }
}

function handleWSMessage(msg) {
  const { type, payload } = msg;
  if (!type) return;
  
  switch (type) {
    case 'route:progress': {
      const progress = payload.progressPct;
      SYSTEM_STATE.activeRouteProgress = Math.round(progress);
      
      let speed = 0;
      if (payload.stage === 'TRANSIT') {
        speed = payload.isFerryTransit ? 25 : Math.floor(75 + Math.random() * 15);
      }
      SYSTEM_STATE.currentAutopilotSpeed = speed;
      
      synchronizeUI();
      checkActiveRouteSurcharges();
      
      if (payload.message) {
        appendTerminalLine(`TELEMETRY: [${payload.driverName || 'Driver'}] ${payload.message}`, "info");
      }
      break;
    }
    
    case 'route:stage_update': {
      if (payload.message) {
        appendTerminalLine(`STAGE_UPDATE: ${payload.message}`, "success");
      }
      break;
    }
    
    case 'route:completed': {
      AUDIO.playSuccess();
      if (payload.message) {
        appendTerminalLine(`COMPLETED: ${payload.message}`, "success");
      }
      fetchBalances();
      checkActiveRouteSurcharges();
      break;
    }
    
    case 'time_sync': {
      // Sync clock to global server time
      const date = new Date(payload.simulatedTimeUnix * 1000);
      const timeOptions = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };
      const dateFormatted = date.toLocaleDateString('en-US', timeOptions).toUpperCase();
      const timeFormatted = date.toTimeString().split(' ')[0];
      
      UI_NODES.systemClock.textContent = `${dateFormatted} ${timeFormatted} [${payload.season}]`;
      break;
    }
    
    case 'dispatch:autopilot_resolution': {
      if (payload.message) {
        appendTerminalLine(`RESOLUTION: ${payload.message}`, "info");
      }
      fetchBalances();
      checkActiveRouteSurcharges();
      break;
    }
    
    case 'border:cleared': {
      AUDIO.playSuccess();
      appendTerminalLine(`BORDER: ${payload.message || 'Customs cleared!'}`, "success");
      closeCheckpoint();
      fetchBalances();
      break;
    }
    
    case 'border:bust': {
      AUDIO.playFailure();
      appendTerminalLine(`BORDER BUSTED: ${payload.message || 'Contraband seized!'}`, "warn");
      closeCheckpoint();
      fetchBalances();
      break;
    }
    
    case 'border:bribe_success': {
      AUDIO.playSuccess();
      appendTerminalLine(`BORDER BRIBE: ${payload.message || 'Bribe accepted!'}`, "success");
      closeCheckpoint();
      fetchBalances();
      break;
    }
    
    case 'border:bribe_fail': {
      AUDIO.playFailure();
      appendTerminalLine(`BORDER BRIBE FAIL: ${payload.message || 'Bribe rejected!'}`, "warn");
      closeCheckpoint();
      fetchBalances();
      break;
    }
    
    case 'border:run_success': {
      AUDIO.playSuccess();
      appendTerminalLine(`BORDER ESCAPE: ${payload.message || 'Run successful!'}`, "success");
      closeCheckpoint();
      fetchBalances();
      break;
    }
    
    case 'border:run_fail': {
      AUDIO.playFailure();
      appendTerminalLine(`BORDER CRASH: ${payload.message || 'Run failed, crashed!'}`, "warn");
      closeCheckpoint();
      fetchBalances();
      break;
    }
    
    case 'alert:driver_wreck':
    case 'alert:driver_snitched':
    case 'alert:engine_breakdown':
    case 'alert:weigh_station_fine':
    case 'alert:ice_slide': {
      AUDIO.playFailure();
      if (payload.message) {
        appendTerminalLine(`ALERT: ${payload.message}`, "warn");
      }
      fetchBalances();
      break;
    }
    
    case 'error': {
      appendTerminalLine(`WS ERROR: ${payload.message || 'Unknown protocol error'}`, "warn");
      break;
    }
    
    default:
      console.log("Unhandled WS message type:", type, msg);
  }
}

async function fetchBalances() {
  if (!SYSTEM_STATE.token) return;
  try {
    const response = await fetch(`${SYSTEM_STATE.restUrl}/api/finance/valuation`, {
      headers: {
        'Authorization': `Bearer ${SYSTEM_STATE.token}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      SYSTEM_STATE.cleanFunds = data.legalBalance;
      SYSTEM_STATE.dirtyFunds = data.blackMarketBalance;
      SYSTEM_STATE.policeHeat = data.policeHeat;
      synchronizeUI();
    }
  } catch (err) {
    console.error("Failed to fetch valuation/balances:", err);
  }
}

async function fetchFleet() {
  if (!SYSTEM_STATE.token) {
    // If offline or no token, default to all unlocked
    SYSTEM_STATE.ownedGarages = new Set(Object.keys(CITIES_DATASET));
    updateMapHighlights();
    return;
  }
  try {
    const response = await fetch(`${SYSTEM_STATE.restUrl}/api/garage`, {
      headers: {
        'Authorization': `Bearer ${SYSTEM_STATE.token}`
      }
    });
    if (response.ok) {
      const garages = await response.json();
      SYSTEM_STATE.ownedGarages = new Set(Object.keys(CITIES_DATASET)); // FOREVER UNLOCKED OVERRIDE
      updateMapHighlights();
      // Also update sidebar if a city is currently selected
      if (SYSTEM_STATE.selectedCityId) {
        handleCitySelection(SYSTEM_STATE.selectedCityId);
      }

      let activeTruckId = null;
      for (const garage of garages) {
        if (garage.trucks && garage.trucks.length > 0) {
          activeTruckId = garage.trucks[0].id;
          break;
        }
      }
      SYSTEM_STATE.activeTruckId = activeTruckId;
      if (activeTruckId) {
        console.log(`WS/REST: Active Truck registered: ${activeTruckId}`);
      } else {
        appendTerminalLine("GARAGE: No active transport rigs found. Buy one from the dealership.", "warn");
      }
    }
  } catch (err) {
    console.error("Failed to fetch fleet/garages:", err);
  }
}

async function handleApiLogin() {
  const restUrl = UI_NODES.apiUrlInput.value.trim();
  const username = UI_NODES.apiUsernameInput.value.trim();
  const password = UI_NODES.apiPasswordInput.value;
  
  if (!restUrl || !username || !password) {
    appendTerminalLine("AUTH: All gateway fields are required.", "warn");
    AUDIO.playFailure();
    return;
  }
  
  appendTerminalLine("AUTH: Handshaking with REST API Gateway...", "info");
  
  try {
    const response = await fetch(`${restUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    
    if (response.ok) {
      const data = await response.json();
      SYSTEM_STATE.token = data.token;
      SYSTEM_STATE.restUrl = restUrl;
      SYSTEM_STATE.user = data.user;
      
      localStorage.setItem("lx_token", data.token);
      localStorage.setItem("lx_rest_url", restUrl);
      localStorage.setItem("lx_user", JSON.stringify(data.user));
      
      UI_NODES.apiCompanyName.textContent = data.user.companyName;
      UI_NODES.apiCompanyId.textContent = data.user.companyId;
      
      SYSTEM_STATE.cleanFunds = data.user.legalBalance;
      SYSTEM_STATE.dirtyFunds = data.user.blackMarketBalance;
      SYSTEM_STATE.policeHeat = data.user.heat;
      synchronizeUI();
      
      appendTerminalLine(`AUTH: Access granted for Operator ${data.user.username}.`, "success");
      
      connectWebSocket(data.token, restUrl);
    } else {
      const errData = await response.json();
      appendTerminalLine(`AUTH FAILURE: ${errData.message || 'Invalid credentials.'}`, "warn");
      AUDIO.playFailure();
    }
  } catch (err) {
    console.error("API login error:", err);
    appendTerminalLine("AUTH FAILURE: Connection to API Gateway timed out or refused.", "warn");
    AUDIO.playFailure();
  }
}

async function handleApiRegister() {
  const restUrl = UI_NODES.apiUrlInput.value.trim();
  const username = UI_NODES.apiUsernameInput.value.trim();
  const password = UI_NODES.apiPasswordInput.value;
  
  if (!restUrl || !username || !password) {
    appendTerminalLine("AUTH: Call-sign and decryption key are required.", "warn");
    AUDIO.playFailure();
    return;
  }
  
  appendTerminalLine("AUTH: Registering new corporate gateway index...", "info");
  
  try {
    const response = await fetch(`${restUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    
    if (response.ok) {
      appendTerminalLine("AUTH: Initialization successful! Decryption key registered. Log in to authenticate.", "success");
      AUDIO.playSuccess();
      UI_NODES.apiPasswordInput.value = "";
    } else {
      const errData = await response.json();
      appendTerminalLine(`REGISTRATION FAILED: ${errData.message || 'Invalid input.'}`, "warn");
      AUDIO.playFailure();
    }
  } catch (err) {
    console.error("API register error:", err);
    appendTerminalLine("REGISTRATION FAILED: Connection to API Gateway timed out or refused.", "warn");
    AUDIO.playFailure();
  }
}

function handleApiDisconnect() {
  if (SYSTEM_STATE.socket) {
    SYSTEM_STATE.socket.close(1000, "User logout");
  }
  
  SYSTEM_STATE.token = null;
  SYSTEM_STATE.user = null;
  SYSTEM_STATE.activeTruckId = null;
  
  localStorage.removeItem("lx_token");
  localStorage.removeItem("lx_user");
  
  UI_NODES.apiUnauthView.style.display = "block";
  UI_NODES.apiAuthView.style.display = "none";
  UI_NODES.apiCompanyName.textContent = "---";
  UI_NODES.apiCompanyId.textContent = "---";
  
  appendTerminalLine("AUTH: Operator session terminated cleanly.", "warn");
  AUDIO.playFailure();
}

async function restoreSessionOnBoot() {
  const token = localStorage.getItem("lx_token");
  const restUrl = localStorage.getItem("lx_rest_url") || "http://localhost:3000";
  const userStr = localStorage.getItem("lx_user");
  
  if (token && userStr) {
    try {
      const user = JSON.parse(userStr);
      appendTerminalLine(`AUTH: Restoring previous session for Operator ${user.username}...`, "info");
      
      const response = await fetch(`${restUrl}/api/garage`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (response.ok) {
        SYSTEM_STATE.token = token;
        SYSTEM_STATE.restUrl = restUrl;
        SYSTEM_STATE.user = user;
        
        UI_NODES.apiUrlInput.value = restUrl;
        UI_NODES.apiUsernameInput.value = user.username;
        
        UI_NODES.apiCompanyName.textContent = user.companyName;
        UI_NODES.apiCompanyId.textContent = user.companyId;
        
        connectWebSocket(token, restUrl);
      } else {
        localStorage.removeItem("lx_token");
        localStorage.removeItem("lx_user");
        appendTerminalLine("AUTH: Saved operator session has expired.", "warn");
      }
    } catch (err) {
      console.error("Session restoration error:", err);
      appendTerminalLine("AUTH: Gateway unreachable. Falling back to local offline sandbox...", "warn");
    }
  }
}

/**
 * ==========================================================================
 * TACTICAL GRAPHICS & CALIBRATION CONSOLE ENGINE
 * ==========================================================================
 */
function initializeGraphicsCalibration() {
  // A. Sliders input listeners to update CSS variables dynamically
  if (UI_NODES.sliderVignette) {
    UI_NODES.sliderVignette.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value).toFixed(2);
      if (UI_NODES.valVignette) UI_NODES.valVignette.textContent = val;
      document.documentElement.style.setProperty('--vignette-intensity', val);
      clearActivePreset();
    });
  }

  if (UI_NODES.sliderScanline) {
    UI_NODES.sliderScanline.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value).toFixed(2);
      if (UI_NODES.valScanline) UI_NODES.valScanline.textContent = val;
      document.documentElement.style.setProperty('--scanline-alpha', val);
      clearActivePreset();
    });
  }

  if (UI_NODES.sliderCurvature) {
    UI_NODES.sliderCurvature.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value).toFixed(1);
      if (UI_NODES.valCurvature) UI_NODES.valCurvature.textContent = val;
      document.documentElement.style.setProperty('--curvature-val', val);
      clearActivePreset();
    });
  }

  if (UI_NODES.sliderDensity) {
    UI_NODES.sliderDensity.addEventListener("input", (e) => {
      const val = e.target.value;
      if (UI_NODES.valDensity) UI_NODES.valDensity.textContent = val + "px";
      document.documentElement.style.setProperty('--scanline-spacing', val + "px");
      clearActivePreset();
    });
  }

  // B. Preset profiles
  if (UI_NODES.btnPresetStandard) {
    UI_NODES.btnPresetStandard.addEventListener("click", () => {
      applyPresetProfile(0.60, 0.15, 6.0, 4);
      UI_NODES.btnPresetStandard.classList.add("active-preset");
      if (UI_NODES.btnPresetUltra) UI_NODES.btnPresetUltra.classList.remove("active-preset");
      appendTerminalLine("SYSTEM: Graphics preset profile 'STANDARD (Battery)' applied.", "success");
    });
  }

  if (UI_NODES.btnPresetUltra) {
    UI_NODES.btnPresetUltra.addEventListener("click", () => {
      applyPresetProfile(0.85, 0.30, 10.0, 6);
      UI_NODES.btnPresetUltra.classList.add("active-preset");
      if (UI_NODES.btnPresetStandard) UI_NODES.btnPresetStandard.classList.remove("active-preset");
      appendTerminalLine("SYSTEM: Graphics preset profile 'ULTRA_HD (High-End)' applied.", "success");
    });
  }

  // C. Support Overlay Close Button
  if (UI_NODES.closeSupportBtn) {
    UI_NODES.closeSupportBtn.addEventListener("click", () => {
      // Toggle off the support overlay state
      SYSTEM_STATE.dropdowns.support = false;
      if (UI_NODES.supportMenu) UI_NODES.supportMenu.style.display = "none";
      appendTerminalLine("HUD: Map overlay 'SUPPORT' closed.", "info");
    });
  }
}

function clearActivePreset() {
  if (UI_NODES.btnPresetStandard) UI_NODES.btnPresetStandard.classList.remove("active-preset");
  if (UI_NODES.btnPresetUltra) UI_NODES.btnPresetUltra.classList.remove("active-preset");
}

function applyPresetProfile(vignette, scanline, curvature, density) {
  // Update UI slider inputs
  if (UI_NODES.sliderVignette) UI_NODES.sliderVignette.value = vignette;
  if (UI_NODES.sliderScanline) UI_NODES.sliderScanline.value = scanline;
  if (UI_NODES.sliderCurvature) UI_NODES.sliderCurvature.value = curvature;
  if (UI_NODES.sliderDensity) UI_NODES.sliderDensity.value = density;

  // Update value display text
  if (UI_NODES.valVignette) UI_NODES.valVignette.textContent = vignette.toFixed(2);
  if (UI_NODES.valScanline) UI_NODES.valScanline.textContent = scanline.toFixed(2);
  if (UI_NODES.valCurvature) UI_NODES.valCurvature.textContent = curvature.toFixed(1);
  if (UI_NODES.valDensity) UI_NODES.valDensity.textContent = density + "px";

  // Update CSS variables on :root
  document.documentElement.style.setProperty('--vignette-intensity', vignette);
  document.documentElement.style.setProperty('--scanline-alpha', scanline);
  document.documentElement.style.setProperty('--curvature-val', curvature);
  document.documentElement.style.setProperty('--scanline-spacing', density + "px");
}

function getCityCountry(cityName) {
  if (!cityName) return "Unknown";
  const key = cityName.toLowerCase();
  if (CITIES_DATASET[key]) {
    return CITIES_DATASET[key].country;
  }
  // Fallback heuristics if not in dataset
  if (key === 'siauliai' || key === 'panevezys' || key === 'kaunas' || key === 'klaipeda' || key === 'vilnius') return "Lithuania";
  if (key === 'tallinn' || key === 'tartu' || key === 'parnu') return "Estonia";
  if (key === 'riga' || key === 'liepaja' || key === 'daugavpils') return "Latvia";
  if (key === 'stockholm' || key === 'visby' || key === 'malmoe') return "Sweden";
  if (key === 'helsinki' || key === 'turku') return "Finland";
  if (key === 'gdansk' || key === 'warsaw' || key === 'krakow') return "Poland";
  if (key === 'berlin' || key === 'hamburg') return "Germany";
  if (key === 'minsk' || key === 'brest') return "Belarus (External)";
  if (key === 'kaliningrad') return "Russia (External)";
  return "Unknown";
}

async function checkActiveRouteSurcharges() {
  if (!SYSTEM_STATE.token) return;
  try {
    const response = await fetch(`${SYSTEM_STATE.restUrl}/api/dispatch/active`, {
      headers: { 'Authorization': `Bearer ${SYSTEM_STATE.token}` }
    });
    if (!response.ok) return;
    const routes = await response.json();
    
    let anyActiveSurcharge = false;
    for (const route of routes) {
      const origin = route.originCity || (route.legalContract ? route.legalContract.origin : null) || (route.contrabandJob ? route.contrabandJob.origin : null);
      const dest = route.destinationCity || (route.legalContract ? route.legalContract.destination : null) || (route.contrabandJob ? route.contrabandJob.destination : null);
      
      if (!origin || !dest) continue;
      
      const originCountry = getCityCountry(origin);
      const destCountry = getCityCountry(dest);
      
      if (originCountry !== destCountry) {
        // It crosses countries! Now calculate range for this specific truck and driver.
        const truck = route.truck;
        const driver = route.driver;
        const distance = route.legalContract ? route.legalContract.distanceKm : (route.contrabandJob ? 350.0 : 350.0);
        
        if (truck) {
          const isEV = truck.model.toLowerCase().includes('ev') || truck.model.toLowerCase().includes('electric');
          const rate = isEV ? 1.5 : 0.35;
          const truckFactor = truck.fuelTankMod === 'CHASSIS_CAVITY' ? 1.1 : 1.0;
          const driverFactor = (driver && driver.trait === 'LEAD_FOOT') ? 1.1 : 1.0;
          
          let weightFactor = 1.0;
          const cargoType = route.legalContract ? route.legalContract.cargoType : null;
          const cargoClass = route.contrabandJob ? route.contrabandJob.cargoClass : null;
          
          if (cargoType) {
            switch (cargoType) {
              case 'STEEL_COILS': weightFactor = 1.5; break;
              case 'TIMBER': weightFactor = 1.3; break;
              case 'AGRICULTURAL_MACHINERY': weightFactor = 1.2; break;
              case 'DAIRY_PRODUCTS': weightFactor = 1.1; break;
              case 'PHARMACEUTICALS': weightFactor = 1.0; break;
              case 'ELECTRONICS': weightFactor = 0.9; break;
            }
          } else if (cargoClass) {
            switch (cargoClass) {
              case 'CLASS_C': weightFactor = 1.4; break;
              case 'CLASS_B': weightFactor = 1.1; break;
              case 'CLASS_A': weightFactor = 0.9; break;
            }
          }
          
          const range = truck.fuelCapacity / (rate * truckFactor * driverFactor * weightFactor);
          if (distance > range) {
            anyActiveSurcharge = true;
            break;
          }
        }
      }
    }
    
    const strip = document.getElementById("surcharge-strip");
    if (strip) {
      strip.style.display = anyActiveSurcharge ? "flex" : "none";
    }
  } catch (err) {
    console.error("Failed to check active route surcharges:", err);
  }
}
