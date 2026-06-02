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

// 1. DATASETS & CONFIGURATIONS (Baltic & Eastern European Schengen Highway Nodes)
const CITIES_DATASET = {
  tallinn: {
    id: "tallinn",
    name: "Tallinn",
    country: "Estonia",
    isSchengen: true,
    coords: { x: 500, y: 120 },
    heat: 15,
    connections: ["helsinki", "riga", "gdansk"]
  },
  helsinki: {
    id: "helsinki",
    name: "Helsinki",
    country: "Finland",
    isSchengen: true,
    coords: { x: 500, y: 40 },
    heat: 10,
    connections: ["tallinn", "turku"]
  },
  turku: {
    id: "turku",
    name: "Turku",
    country: "Finland",
    isSchengen: true,
    coords: { x: 380, y: 50 },
    heat: 5,
    connections: ["helsinki", "stockholm"]
  },
  stockholm: {
    id: "stockholm",
    name: "Stockholm",
    country: "Sweden",
    isSchengen: true,
    coords: { x: 220, y: 150 },
    heat: 12,
    connections: ["turku", "gdansk"]
  },
  riga: {
    id: "riga",
    name: "Riga",
    country: "Latvia",
    isSchengen: true,
    coords: { x: 520, y: 220 },
    heat: 20,
    connections: ["tallinn", "klaipeda", "vilnius"]
  },
  klaipeda: {
    id: "klaipeda",
    name: "Klaipėda",
    country: "Lithuania",
    isSchengen: true,
    coords: { x: 440, y: 300 },
    heat: 25,
    connections: ["riga", "vilnius", "kaliningrad"]
  },
  vilnius: {
    id: "vilnius",
    name: "Vilnius",
    country: "Lithuania",
    isSchengen: true,
    coords: { x: 580, y: 320 },
    heat: 30,
    connections: ["riga", "klaipeda", "brest", "warsaw"]
  },
  kaliningrad: {
    id: "kaliningrad",
    name: "Kaliningrad",
    country: "Russia (External)",
    isSchengen: false,
    coords: { x: 380, y: 350 },
    heat: 65,
    connections: ["klaipeda", "gdansk", "warsaw"]
  },
  gdansk: {
    id: "gdansk",
    name: "Gdańsk",
    country: "Poland",
    isSchengen: true,
    coords: { x: 320, y: 380 },
    heat: 18,
    connections: ["tallinn", "stockholm", "kaliningrad", "warsaw"]
  },
  warsaw: {
    id: "warsaw",
    name: "Warsaw",
    country: "Poland",
    isSchengen: true,
    coords: { x: 480, y: 440 },
    heat: 22,
    connections: ["gdansk", "kaliningrad", "vilnius", "brest", "berlin"]
  },
  brest: {
    id: "brest",
    name: "Brest-Terespol Checkpoint",
    country: "Belarus Border",
    isSchengen: false,
    coords: { x: 620, y: 460 },
    heat: 85,
    connections: ["vilnius", "warsaw", "kyiv"]
  },
  kyiv: {
    id: "kyiv",
    name: "Kyiv",
    country: "Ukraine (External)",
    isSchengen: false,
    coords: { x: 780, y: 520 },
    heat: 40,
    connections: ["brest"]
  },
  berlin: {
    id: "berlin",
    name: "Berlin",
    country: "Germany",
    isSchengen: true,
    coords: { x: 140, y: 460 },
    heat: 15,
    connections: ["warsaw"]
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
    garage: true,
    support: true
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
  speedometerFill: document.getElementById("speed-fill"),
  speedometerNeedle: document.getElementById("speed-needle"),
  speedometerText: document.getElementById("speed-digit"),
  progressSegments: document.querySelectorAll(".progression-segment"),
  progressPctText: document.getElementById("progress-pct"),
  policeHeatText: document.getElementById("police-heat-val"),
  policeHeatSegments: document.querySelectorAll(".heat-segment"),
  
  // Left Panel Dynamic Nodes
  citySelectorIdle: document.getElementById("selector-idle"),
  citySelectorActive: document.getElementById("selector-active"),
  activeCityName: document.getElementById("active-city-name"),
  activeCityZone: document.getElementById("active-city-zone"),
  activeConnectionsContainer: document.getElementById("active-connections-list"),
  
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
  apiSocketStatus: document.getElementById("api-socket-status")
};

// 4. INITIALIZATION & BOOT LOADER
window.addEventListener("DOMContentLoaded", () => {
  bootSystemDiagnostics();
  renderTacticalMap();
  initializeEventListeners();
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
  const prevPaths = svg.querySelectorAll("path, g, text:not([id])");
  prevPaths.forEach(node => node.remove());

  // A. Draw Route connection lines (tactical transport channels)
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
  document.querySelectorAll(".nav-op-btn, .hud-control-btn, .checkpoint-choice-btn, .simulator-trigger-btn").forEach(btn => {
    btn.addEventListener("mouseenter", () => AUDIO.playHover());
    btn.addEventListener("click", () => AUDIO.playClick());
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

  // Play sci-fi terminal handshake beep
  AUDIO.playHandshake();

  // Visual terminal updates
  appendTerminalLine(`HANDSHAKE: City node '${city.name.toUpperCase()}' selected. Querying databases...`, "info");

  // Synchronize Left control panel
  UI_NODES.citySelectorIdle.style.display = "none";
  UI_NODES.citySelectorActive.classList.add("visible");
  
  UI_NODES.activeCityName.textContent = city.name.toUpperCase();
  UI_NODES.activeCityZone.textContent = `ZONE: ${city.isSchengen ? "ACTIVE (SCHENGEN)" : "RESTRICTED (EXTERNAL)"}`;
  UI_NODES.activeCityZone.style.color = city.isSchengen ? "var(--neon-green)" : "var(--neon-orange)";
  UI_NODES.activeCityZone.style.borderColor = city.isSchengen ? "var(--neon-green)" : "var(--neon-orange)";
  UI_NODES.activeCityZone.style.background = city.isSchengen ? "var(--neon-green-dark)" : "var(--neon-orange-dark)";

  // Clear and list city direct highway connections
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

  // Visually animate / highlight selected node in SVG Map
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
  SYSTEM_STATE.dropdowns[type] = !SYSTEM_STATE.dropdowns[type];
  
  const menu = type === "garage" ? UI_NODES.garageMenu : UI_NODES.supportMenu;
  menu.style.display = SYSTEM_STATE.dropdowns[type] ? "block" : "none";
  
  appendTerminalLine(`HUD: Map overlay '${type.toUpperCase()}' toggled.`, "info");
}

// 7. UI PRESENTATION SYNCHRONIZATION (Updating tickers, telemetry and speedometers)
function synchronizeUI() {
  // Sync financial accounts
  UI_NODES.cleanAmount.textContent = `$${SYSTEM_STATE.cleanFunds.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  UI_NODES.dirtyAmount.textContent = `$${SYSTEM_STATE.dirtyFunds.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  // Sync speedometer dial (84 km/h represents ~50 deg rotate & stroke-dashoffset of 95)
  const targetOffset = 219.9 - (219.9 * (SYSTEM_STATE.currentAutopilotSpeed / 140)); // speed range max 140
  UI_NODES.speedometerFill.style.strokeDashoffset = targetOffset;
  UI_NODES.speedometerNeedle.style.transform = `rotate(${SYSTEM_STATE.currentAutopilotSpeed - 34}deg)`;
  UI_NODES.speedometerText.textContent = SYSTEM_STATE.currentAutopilotSpeed;

  // Sync progress segments (e.g. 74% progress lights up 7 segments of 10)
  UI_NODES.progressPctText.textContent = `${SYSTEM_STATE.activeRouteProgress}%`;
  const filledSegments = Math.round(SYSTEM_STATE.activeRouteProgress / 10);
  UI_NODES.progressSegments.forEach((seg, index) => {
    if (index < filledSegments) {
      seg.classList.add("filled");
    } else {
      seg.classList.remove("filled");
    }
  });

  // Sync police heat Level index (e.g., 25% lights up 3 segments)
  UI_NODES.policeHeatText.textContent = `${SYSTEM_STATE.policeHeat}%`;
  const filledHeat = Math.round(SYSTEM_STATE.policeHeat / 10);
  UI_NODES.policeHeatSegments.forEach((seg, index) => {
    if (index < filledHeat) {
      seg.classList.add("active");
    } else {
      seg.classList.remove("active");
    }
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
