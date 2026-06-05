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
// Country border polygon data for SVG overlay
const COUNTRY_BORDERS = [
  { name: "Finland",    color: "rgba(80,200,255,0.10)",  points: "380,20 530,20 530,140 460,190 380,140" },
  { name: "Estonia",   color: "rgba(80,200,255,0.10)",  points: "450,140 560,130 570,190 480,210 440,185" },
  { name: "Latvia",    color: "rgba(100,220,120,0.10)", points: "440,185 570,190 590,260 500,280 420,260" },
  { name: "Lithuania", color: "rgba(100,220,120,0.10)", points: "400,260 500,280 620,300 630,380 460,390 370,360" },
  { name: "Sweden",    color: "rgba(80,180,255,0.08)",  points: "130,80 280,60 340,200 300,400 130,380" },
  { name: "Poland",    color: "rgba(220,80,80,0.08)",   points: "140,380 460,350 640,380 640,500 200,520 120,480" },
  { name: "Germany",   color: "rgba(200,180,80,0.08)",  points: "50,380 140,380 140,520 50,520" },
  { name: "Belarus",   color: "rgba(180,80,80,0.12)",   points: "620,300 760,300 800,480 650,490 600,400" },
  { name: "Ukraine",   color: "rgba(220,160,20,0.08)",  points: "650,490 800,480 900,550 850,580 640,570" },
  { name: "Russia-KGD",color: "rgba(255,60,60,0.12)",   points: "340,310 440,310 450,390 340,400" },
];

const CITIES_DATASET = {
  // === FINLAND ===
  helsinki: {
    id: "helsinki", name: "Helsinki", country: "Finland", isSchengen: true, isCapital: true,
    purchasable: false, terminalCost: 0,
    coords: { x: 500, y: 40 }, heat: 10,
    connections: ["tallinn", "turku"]
  },
  turku: {
    id: "turku", name: "Turku", country: "Finland", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 180000,
    coords: { x: 400, y: 55 }, heat: 5,
    connections: ["helsinki", "stockholm"]
  },
  // === SWEDEN ===
  stockholm: {
    id: "stockholm", name: "Stockholm", country: "Sweden", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 320000,
    coords: { x: 220, y: 130 }, heat: 12,
    connections: ["turku", "gdansk", "malmoe"]
  },
  malmoe: {
    id: "malmoe", name: "Malmö", country: "Sweden", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 200000,
    coords: { x: 190, y: 340 }, heat: 8,
    connections: ["stockholm", "berlin"]
  },
  // === ESTONIA ===
  tallinn: {
    id: "tallinn", name: "Tallinn", country: "Estonia", isSchengen: true, isCapital: true,
    purchasable: false, terminalCost: 0,
    coords: { x: 500, y: 160 }, heat: 15,
    connections: ["helsinki", "riga", "gdansk"]
  },
  // === LATVIA ===
  riga: {
    id: "riga", name: "Riga", country: "Latvia", isSchengen: true, isCapital: true,
    purchasable: false, terminalCost: 0,
    coords: { x: 520, y: 230 }, heat: 20,
    connections: ["tallinn", "klaipeda", "vilnius"]
  },
  // === LITHUANIA ===
  vilnius: {
    id: "vilnius", name: "Vilnius", country: "Lithuania", isSchengen: true, isCapital: true,
    purchasable: false, terminalCost: 0,
    coords: { x: 580, y: 330 }, heat: 30,
    connections: ["riga", "klaipeda", "brest", "warsaw", "kaunas"]
  },
  klaipeda: {
    id: "klaipeda", name: "Klaipėda", country: "Lithuania", isSchengen: true, isCapital: false,
    purchasable: false, terminalCost: 0,
    coords: { x: 440, y: 300 }, heat: 25,
    connections: ["riga", "vilnius", "kaliningrad"]
  },
  kaunas: {
    id: "kaunas", name: "Kaunas", country: "Lithuania", isSchengen: true, isCapital: false,
    purchasable: false, terminalCost: 0,
    coords: { x: 530, y: 360 }, heat: 22,
    connections: ["vilnius", "warsaw"]
  },
  // === RUSSIA (KALININGRAD EXCLAVE) ===
  kaliningrad: {
    id: "kaliningrad", name: "Kaliningrad", country: "Russia (External)", isSchengen: false, isCapital: false,
    purchasable: true, terminalCost: 500000,
    coords: { x: 380, y: 360 }, heat: 65,
    connections: ["klaipeda", "gdansk", "warsaw"]
  },
  // === POLAND ===
  gdansk: {
    id: "gdansk", name: "Gdańsk", country: "Poland", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 220000,
    coords: { x: 330, y: 385 }, heat: 18,
    connections: ["tallinn", "stockholm", "kaliningrad", "warsaw"]
  },
  warsaw: {
    id: "warsaw", name: "Warsaw", country: "Poland", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 350000,
    coords: { x: 480, y: 450 }, heat: 22,
    connections: ["gdansk", "kaliningrad", "vilnius", "kaunas", "brest", "berlin", "prague"]
  },
  krakow: {
    id: "krakow", name: "Kraków", country: "Poland", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 240000,
    coords: { x: 430, y: 500 }, heat: 16,
    connections: ["warsaw", "prague"]
  },
  // === GERMANY ===
  berlin: {
    id: "berlin", name: "Berlin", country: "Germany", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 600000,
    coords: { x: 140, y: 450 }, heat: 15,
    connections: ["warsaw", "malmoe", "prague", "hamburg"]
  },
  hamburg: {
    id: "hamburg", name: "Hamburg", country: "Germany", isSchengen: true, isCapital: false,
    purchasable: true, terminalCost: 380000,
    coords: { x: 80, y: 380 }, heat: 10,
    connections: ["berlin", "stockholm"]
  },
  prague: {
    id: "prague", name: "Prague", country: "Czech Republic", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 420000,
    coords: { x: 230, y: 490 }, heat: 14,
    connections: ["berlin", "warsaw", "krakow"]
  },
  // === BELARUS BORDER ===
  brest: {
    id: "brest", name: "Brest-Terespol Checkpoint", country: "Belarus Border", isSchengen: false, isCapital: false,
    purchasable: false, terminalCost: 0,
    coords: { x: 640, y: 470 }, heat: 85,
    connections: ["vilnius", "warsaw", "minsk", "kyiv"]
  },
  minsk: {
    id: "minsk", name: "Minsk", country: "Belarus (External)", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 700000,
    coords: { x: 720, y: 400 }, heat: 70,
    connections: ["brest", "vilnius", "kyiv"]
  },
  // === UKRAINE ===
  kyiv: {
    id: "kyiv", name: "Kyiv", country: "Ukraine (External)", isSchengen: false, isCapital: true,
    purchasable: true, terminalCost: 550000,
    coords: { x: 810, y: 530 }, heat: 40,
    connections: ["brest", "minsk"]
  },
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
  restUrl: 'http://localhost:3000'
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
window.addEventListener("DOMContentLoaded", () => {
  bootSystemDiagnostics();
  renderTacticalMap();
  initializeEventListeners();
  initializeGraphicsCalibration(); // Interactive Calibration Sliders
  startSystemTimeLoop();
  synchronizeUI();
  restoreSessionOnBoot(); // Restore session from localStorage if available
});

/**
 * Boot Diagnostic scrolling terminal feedback
 */
function bootSystemDiagnostics() {
  UI_NODES.consoleBox.innerHTML = "";
  SYSTEM_STATE.consoleLines.forEach(line => appendTerminalLine(line.text, line.type));
}

/**
 * Handle system background clocks
 */
function startSystemTimeLoop() {
  setInterval(() => {
    // Add 1 minute to simulated game time every 4 real seconds
    SYSTEM_STATE.simulationTime.setMinutes(SYSTEM_STATE.simulationTime.getMinutes() + 1);
    
    // Refresh digital terminal clock display
    const timeOptions = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };
    const dateFormatted = SYSTEM_STATE.simulationTime.toLocaleDateString('en-US', timeOptions).toUpperCase();
    const timeFormatted = SYSTEM_STATE.simulationTime.toTimeString().split(' ')[0];
    
    UI_NODES.systemClock.textContent = `${dateFormatted} ${timeFormatted}`;

    // Occasional simulated terminal activity
    if (Math.random() < 0.15) {
      triggerSimulatedTelemetry();
    }
  }, 4000);
}

// 5. VECTOR ROUTE & NODE RENDERING Engine (SVG projection)
function renderTacticalMap() {
  const svg = UI_NODES.mapSvg;

  // Clean all previous routes & nodes, preserving defs filters
  const prevPaths = svg.querySelectorAll("path, g, polygon, text:not([id])");
  prevPaths.forEach(node => node.remove());

  // A. Draw Country Border Overlays
  COUNTRY_BORDERS.forEach(border => {
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    poly.setAttribute("points", border.points);
    poly.setAttribute("fill", border.color);
    poly.setAttribute("stroke", border.color.replace(/,[^,]+\)$/, ",0.35)"));
    poly.setAttribute("stroke-width", "1");
    poly.setAttribute("stroke-dasharray", "4,3");
    svg.appendChild(poly);
  });

  // B. Draw Route connection lines (tactical transport channels)
  const renderedConnections = new Set();
  
  Object.keys(CITIES_DATASET).forEach(cityId => {
    const city = CITIES_DATASET[cityId];
    
    city.connections.forEach(targetId => {
      const target = CITIES_DATASET[targetId];
      if (!target) return;

      // Unique identifier for route to avoid double drawing
      const connKey = [cityId, targetId].sort().join("-");
      if (renderedConnections.has(connKey)) return;
      renderedConnections.add(connKey);

      // Route parameters
      let strokeColor = "rgba(0, 255, 102, 0.25)";
      let dashArray = "none";
      let filterUrl = "none";

      if (!city.isSchengen || !target.isSchengen) {
        // Warning route (crosses outside the safe zone)
        strokeColor = "rgba(255, 102, 0, 0.4)";
        dashArray = "6, 4";
      }

      if (city.heat > 50 || target.heat > 50) {
        // High risk police blockades
        strokeColor = "rgba(255, 0, 60, 0.6)";
        dashArray = "3, 4";
      }

      // Draw baseline static line path
      const pathLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
      pathLine.setAttribute("d", `M ${city.coords.x} ${city.coords.y} L ${target.coords.x} ${target.coords.y}`);
      pathLine.setAttribute("stroke", strokeColor);
      pathLine.setAttribute("stroke-width", "1.5");
      pathLine.setAttribute("stroke-dasharray", dashArray);
      pathLine.setAttribute("fill", "none");
      svg.appendChild(pathLine);

      // Overlay animated glowing data packet stream if the route is active
      if (city.isSchengen && target.isSchengen && Math.random() < 0.5) {
        const streamPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        streamPath.setAttribute("d", `M ${city.coords.x} ${city.coords.y} L ${target.coords.x} ${target.coords.y}`);
        streamPath.setAttribute("stroke", "var(--neon-green)");
        streamPath.setAttribute("stroke-width", "2.5");
        streamPath.setAttribute("stroke-linecap", "round");
        streamPath.setAttribute("stroke-dasharray", "15, 120");
        streamPath.setAttribute("fill", "none");
        streamPath.style.filter = "url(#glow-green)";
        streamPath.style.animation = "flow-streams 6s linear infinite";
        svg.appendChild(streamPath);
      }
    });
  });

  // B. Draw Interactive City Coordinate Nodes
  Object.keys(CITIES_DATASET).forEach(cityId => {
    const city = CITIES_DATASET[cityId];
    
    // Choose neon color style based on security and region status
    let nodeColor = "var(--neon-green)";
    let nodeFill = "var(--neon-green-dark)";
    let glowFilter = "url(#glow-green)";

    if (!city.isSchengen) {
      nodeColor = "var(--neon-orange)";
      nodeFill = "var(--neon-orange-dark)";
      glowFilter = "url(#glow-orange)";
    }

    if (city.heat > 50) {
      nodeColor = "var(--neon-red)";
      nodeFill = "var(--neon-red-dark)";
      glowFilter = "url(#glow-red)";
    }

    const gGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gGroup.setAttribute("class", "map-node-group");
    gGroup.setAttribute("data-id", city.id);
    if (city.purchasable) {
      gGroup.setAttribute("data-purchasable", "true");
    }
    gGroup.style.setProperty("--node-color", nodeColor);

    // Dynamic click handler
    gGroup.addEventListener("click", () => handleCitySelection(city.id));

    // Outer concentric locator ring
    const outerRing = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    outerRing.setAttribute("cx", city.coords.x);
    outerRing.setAttribute("cy", city.coords.y);
    outerRing.setAttribute("r", "12");
    outerRing.setAttribute("fill", "none");
    outerRing.setAttribute("stroke", nodeColor);
    outerRing.setAttribute("stroke-width", "1");
    outerRing.setAttribute("stroke-opacity", "0.3");
    gGroup.appendChild(outerRing);

    // Inner glowing core
    const corePoint = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    corePoint.setAttribute("cx", city.coords.x);
    corePoint.setAttribute("cy", city.coords.y);
    corePoint.setAttribute("r", "7");
    corePoint.setAttribute("fill", nodeFill);
    corePoint.setAttribute("stroke", nodeColor);
    corePoint.setAttribute("stroke-width", "2");
    corePoint.setAttribute("filter", glowFilter);
    gGroup.appendChild(corePoint);

    // Node micro typography label
    const nodeLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    nodeLabel.setAttribute("x", city.coords.x + 16);
    nodeLabel.setAttribute("y", city.coords.y + 4);
    nodeLabel.setAttribute("fill", nodeColor);
    nodeLabel.setAttribute("font-family", "var(--font-mono)");
    nodeLabel.setAttribute("font-size", "10px");
    nodeLabel.setAttribute("font-weight", "bold");
    nodeLabel.textContent = `NODE_${city.id.slice(0, 3).toUpperCase()}`;
    gGroup.appendChild(nodeLabel);

    svg.appendChild(gGroup);
  });
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

  // Left panel connections list
  if (UI_NODES.activeConnectionsContainer) {
    UI_NODES.activeConnectionsContainer.innerHTML = "";
    city.connections.forEach(connId => {
      const connCity = CITIES_DATASET[connId];
      if (!connCity) return;
      const row = document.createElement("div");
      row.className = "connection-node-row";
      row.innerHTML = `
        <span class="connection-node-name">NODE_${connId.slice(0, 3).toUpperCase()} (${connCity.name})</span>
        <span class="connection-node-dist">${calculateDistance(city.coords, connCity.coords)} KM</span>
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

function calculateDistance(coords1, coords2) {
  const dx = coords2.x - coords1.x;
  const dy = coords2.y - coords1.y;
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
  line.innerHTML = `<span style="color:var(--color-text-muted)">[${time}]</span> ${text}`;
  
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
      break;
    }
    
    case 'dispatch:autopilot_resolution': {
      if (payload.message) {
        appendTerminalLine(`RESOLUTION: ${payload.message}`, "info");
      }
      fetchBalances();
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
  if (!SYSTEM_STATE.token) return;
  try {
    const response = await fetch(`${SYSTEM_STATE.restUrl}/api/garage`, {
      headers: {
        'Authorization': `Bearer ${SYSTEM_STATE.token}`
      }
    });
    if (response.ok) {
      const garages = await response.json();
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
