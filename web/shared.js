// LogistiXpert Shared Utilities & API Integrations

let parsedUser = null;
try {
  const storedUser = localStorage.getItem("lx_user");
  if (storedUser && storedUser !== "undefined") {
    parsedUser = JSON.parse(storedUser);
  }
} catch (e) {
  console.warn("Could not parse lx_user from localStorage", e);
}

const SYSTEM_STATE = {
  token: localStorage.getItem("lx_token"),
  restUrl: localStorage.getItem("lx_rest_url") || "http://localhost:3000",
  user: parsedUser,
  cleanFunds: 0,
  dirtyFunds: 0,
  policeHeat: 0,
  reputationScore: 0
};

// ==========================================================================
// GLOBAL TOAST NOTIFICATION SYSTEM
// ==========================================================================
(function initToastSystem() {
  const style = document.createElement('style');
  style.textContent = `
    #lx-toast-container {
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    .lx-toast {
      background: rgba(8, 8, 12, 0.97);
      border-radius: 4px;
      padding: 10px 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 260px;
      max-width: 420px;
      box-shadow: 0 4px 32px rgba(0,0,0,0.8);
      pointer-events: all;
      opacity: 0;
      transform: translateX(40px);
      transition: opacity 0.2s cubic-bezier(0.16,1,0.3,1), transform 0.2s cubic-bezier(0.16,1,0.3,1);
      position: relative;
      overflow: hidden;
    }
    .lx-toast.show { opacity: 1; transform: translateX(0); }
    .lx-toast.hide { opacity: 0; transform: translateX(40px); }
    .lx-toast::before {
      content: '';
      position: absolute;
      bottom: 0; left: 0;
      height: 2px;
      width: 100%;
      transform-origin: left;
      animation: lx-toast-timer 3s linear forwards;
    }
    .lx-toast.success { border: 1px solid rgba(0,255,102,0.3); border-left: 3px solid #00ff66; color: #00ff66; }
    .lx-toast.success::before { background: #00ff66; }
    .lx-toast.error { border: 1px solid rgba(255,0,60,0.3); border-left: 3px solid #ff003c; color: #ff003c; }
    .lx-toast.error::before { background: #ff003c; }
    .lx-toast.info { border: 1px solid rgba(0,229,255,0.3); border-left: 3px solid #00e5ff; color: #00e5ff; }
    .lx-toast.info::before { background: #00e5ff; }
    .lx-toast.warning { border: 1px solid rgba(255,102,0,0.3); border-left: 3px solid #ff6600; color: #ff6600; }
    .lx-toast.warning::before { background: #ff6600; }
    .lx-toast-icon { font-size: 14px; flex-shrink: 0; }
    .lx-toast-msg { flex: 1; line-height: 1.4; color: inherit; }
    @keyframes lx-toast-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }
  `;
  document.head.appendChild(style);

  const container = document.createElement('div');
  container.id = 'lx-toast-container';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(container));
})();

function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('lx-toast-container');
  if (!container) return;

  const icons = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' };
  const toast = document.createElement('div');
  toast.className = `lx-toast ${type}`;
  toast.innerHTML = `
    <span class="lx-toast-icon">${icons[type] || 'ℹ'}</span>
    <span class="lx-toast-msg">${message}</span>
  `;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

// ==========================================================================
// GLOBAL CONFIRM MODAL
// ==========================================================================
(function initConfirmModal() {
  const style = document.createElement('style');
  style.textContent = `
    #lx-confirm-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.75);
      backdrop-filter: blur(4px);
      z-index: 999990;
      display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none;
      transition: opacity 0.2s ease;
    }
    #lx-confirm-overlay.active { opacity: 1; pointer-events: all; }
    #lx-confirm-box {
      background: rgba(8, 8, 12, 0.99);
      border: 1px solid rgba(255,255,255,0.1);
      border-top: 2px solid var(--confirm-color, #00e5ff);
      border-radius: 4px;
      padding: 24px;
      min-width: 320px;
      max-width: 480px;
      font-family: 'JetBrains Mono', monospace;
      box-shadow: 0 0 60px rgba(0,0,0,0.9), 0 0 20px var(--confirm-glow, rgba(0,229,255,0.1));
      transform: scale(0.92) translateY(-20px);
      transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
    }
    #lx-confirm-overlay.active #lx-confirm-box { transform: scale(1) translateY(0); }
    #lx-confirm-title {
      font-size: 13px; font-weight: 900; letter-spacing: 2px;
      color: var(--confirm-color, #00e5ff); margin-bottom: 8px;
      text-transform: uppercase;
    }
    #lx-confirm-msg {
      font-size: 11px; color: rgba(240,244,248,0.7);
      line-height: 1.6; margin-bottom: 20px;
    }
    .lx-confirm-cost {
      font-size: 12px; font-weight: bold;
      color: #f0f4f8; margin-bottom: 20px;
      padding: 8px; border-radius: 2px;
      background: rgba(255,255,255,0.04);
      border-left: 2px solid var(--confirm-color, #00e5ff);
    }
    .lx-confirm-btns { display: flex; gap: 8px; }
    .lx-confirm-btn {
      flex: 1; padding: 10px; border-radius: 2px;
      font-family: 'JetBrains Mono', monospace; font-size: 10px;
      font-weight: 700; letter-spacing: 1px; cursor: pointer;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.03); color: rgba(240,244,248,0.5);
      transition: all 0.15s ease; text-transform: uppercase;
    }
    .lx-confirm-btn:hover { background: rgba(255,255,255,0.07); color: #f0f4f8; }
    .lx-confirm-btn.primary {
      border-color: var(--confirm-color, #00e5ff);
      color: var(--confirm-color, #00e5ff);
      background: rgba(0,229,255,0.05);
    }
    .lx-confirm-btn.primary:hover {
      background: rgba(0,229,255,0.12);
      box-shadow: 0 0 12px var(--confirm-glow, rgba(0,229,255,0.2));
    }
  `;
  document.head.appendChild(style);
  document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.createElement('div');
    overlay.id = 'lx-confirm-overlay';
    overlay.innerHTML = `
      <div id="lx-confirm-box">
        <div id="lx-confirm-title">CONFIRM ACTION</div>
        <div id="lx-confirm-msg"></div>
        <div class="lx-confirm-btns">
          <button class="lx-confirm-btn" id="lx-confirm-cancel">ABORT</button>
          <button class="lx-confirm-btn primary" id="lx-confirm-ok">CONFIRM</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('lx-confirm-cancel').addEventListener('click', () => closeConfirmModal());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeConfirmModal(); });
  });
})();

let _confirmCallback = null;
function showConfirmModal({ title, message, cost, color, onConfirm }) {
  const overlay = document.getElementById('lx-confirm-overlay');
  if (!overlay) { if (onConfirm) onConfirm(); return; }

  document.getElementById('lx-confirm-title').textContent = title || 'CONFIRM ACTION';
  document.getElementById('lx-confirm-msg').innerHTML = message || '';
  overlay.style.setProperty('--confirm-color', color || '#00e5ff');
  overlay.style.setProperty('--confirm-glow', color ? color.replace(')', ', 0.15)').replace('rgb', 'rgba') : 'rgba(0,229,255,0.15)');

  const box = document.getElementById('lx-confirm-box');
  // Remove any old cost line
  box.querySelectorAll('.lx-confirm-cost').forEach(el => el.remove());
  if (cost) {
    const costEl = document.createElement('div');
    costEl.className = 'lx-confirm-cost';
    costEl.textContent = cost;
    box.insertBefore(costEl, box.querySelector('.lx-confirm-btns'));
  }

  _confirmCallback = onConfirm;
  overlay.classList.add('active');

  const okBtn = document.getElementById('lx-confirm-ok');
  okBtn.onclick = () => { closeConfirmModal(); if (_confirmCallback) _confirmCallback(); };
}

function closeConfirmModal() {
  const overlay = document.getElementById('lx-confirm-overlay');
  if (overlay) overlay.classList.remove('active');
  _confirmCallback = null;
}

// CyberAudioEngine class (safe version — won't crash on AudioContext policy)
class CyberAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch (e) { /* AudioContext not supported or blocked */ }
  }

  playClick() {
    try {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.05);
    } catch(e) {}
  }

  playSuccess() {
    try {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.setValueAtTime(900, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.25);
    } catch(e) {}
  }

  playFailure() {
    try {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(90, now + 0.3);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.3);
    } catch(e) {}
  }
}

const AUDIO = new CyberAudioEngine();

// Check authentication
function checkAuth() {
  if (!SYSTEM_STATE.token) {
    alert("AUTHENTICATION UPLINK REQUIRED: Please connect and log in on the main dashboard.");
    window.location.href = "index.html";
    return false;
  }
  return true;
}

// Fetch financial balances and update UI
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
      SYSTEM_STATE.reputationScore = (data.reputationScore || 750) / 100; // Normalise scale to 0-10
      synchronizeHeaderUI();
    }
  } catch (err) {
    console.error("Failed to fetch valuation:", err);
  }
}

// Pulse animation for balance change
function pulseBalance(el) {
  if (!el) return;
  el.style.transition = 'color 0.1s';
  el.style.color = '#ffffff';
  el.style.textShadow = '0 0 8px #ffffff';
  setTimeout(() => {
    el.style.color = '';
    el.style.textShadow = '';
  }, 300);
}

// Global UI sync for common header fields
function synchronizeHeaderUI() {
  try {
    const cleanEl = document.getElementById("clean-amount");
    const dirtyEl = document.getElementById("dirty-amount");
    const heatEl = document.getElementById("police-heat-val");
    const heatSegments = document.querySelectorAll(".heat-segments .heat-segment");
    const repValEl = document.getElementById("rep-score-val");
    const repStarsEl = document.getElementById("rep-star-grid");

    const cleanVal = parseFloat(SYSTEM_STATE.cleanFunds) || 0;
    const dirtyVal = parseFloat(SYSTEM_STATE.dirtyFunds) || 0;
    const heatVal = parseFloat(SYSTEM_STATE.policeHeat) || 0;
    const repVal = parseFloat(SYSTEM_STATE.reputationScore) || 0;

    if (cleanEl) {
      const newText = `$${cleanVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      if (cleanEl.textContent !== newText) { pulseBalance(cleanEl); }
      cleanEl.textContent = newText;
    }
    if (dirtyEl) {
      const newText = `$${dirtyVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      if (dirtyEl.textContent !== newText) { pulseBalance(dirtyEl); }
      dirtyEl.textContent = newText;
    }
    if (heatEl) {
      heatEl.textContent = `${Math.round(heatVal)}%`;
    }
    if (heatSegments.length > 0) {
      const activeSegs = Math.round(heatVal / 10);
      heatSegments.forEach((seg, i) => {
        if (i < activeSegs) seg.classList.add("active");
        else seg.classList.remove("active");
      });
    }
    if (repValEl) {
      repValEl.textContent = repVal.toFixed(1);
    }
    if (repStarsEl) {
      const stars = repStarsEl.querySelectorAll(".rep-star");
      stars.forEach((star, i) => {
        const threshold = i + 1;
        if (repVal >= threshold) {
          star.classList.add("filled");
          star.classList.remove("partial");
        } else if (repVal > i && repVal < threshold) {
          star.classList.add("partial");
          star.classList.remove("filled");
        } else {
          star.classList.remove("filled", "partial");
        }
      });
    }
  } catch(err) {
    console.warn('[UI] synchronizeHeaderUI error (non-fatal):', err);
  }
}

// CITIES DATASET reference to compute details locally
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
    connections: ["brest", "minsk", "istanbul"]
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
    connections: ["amsterdam", "paris"]
  },
  paris: {
    id: "paris", name: "Paris", country: "France", isSchengen: true, isCapital: true,
    purchasable: true, terminalCost: 650000,
    lat: 48.85, lon: 2.35, heat: 25,
    connections: ["london", "brussels", "bern"]
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
    connections: ["vienna", "krakow"]
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
    connections: ["kyiv", "vienna", "ankara"]
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

// Standard Initialization for all Sub-pages
window.addEventListener("DOMContentLoaded", () => {
  if (checkAuth()) {
    fetchBalances();
    // Refresh balances every 10 seconds
    setInterval(fetchBalances, 10000);
  }
});
