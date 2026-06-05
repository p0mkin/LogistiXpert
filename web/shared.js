// LogistiXpert Shared Utilities & API Integrations

const SYSTEM_STATE = {
  token: localStorage.getItem("lx_token"),
  restUrl: localStorage.getItem("lx_rest_url") || "http://localhost:3000",
  user: localStorage.getItem("lx_user") ? JSON.parse(localStorage.getItem("lx_user")) : null,
  cleanFunds: 0,
  dirtyFunds: 0,
  policeHeat: 0,
  reputationScore: 0
};

// CyberAudioEngine class
class CyberAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  playClick() {
    if (this.muted) return;
    this.init();
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
  }

  playSuccess() {
    if (this.muted) return;
    this.init();
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
  }

  playFailure() {
    if (this.muted) return;
    this.init();
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

// Global UI sync for common header fields
function synchronizeHeaderUI() {
  const cleanEl = document.getElementById("clean-amount");
  const dirtyEl = document.getElementById("dirty-amount");
  const heatEl = document.getElementById("police-heat-val");
  const heatSegments = document.querySelectorAll(".heat-segments .heat-segment");
  const repValEl = document.getElementById("rep-score-val");
  const repStarsEl = document.getElementById("rep-star-grid");

  if (cleanEl) {
    cleanEl.textContent = `$${SYSTEM_STATE.cleanFunds.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  }
  if (dirtyEl) {
    dirtyEl.textContent = `$${SYSTEM_STATE.dirtyFunds.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  }
  if (heatEl) {
    heatEl.textContent = `${SYSTEM_STATE.policeHeat}%`;
  }
  if (heatSegments.length > 0) {
    const activeSegs = Math.round(SYSTEM_STATE.policeHeat / 10);
    heatSegments.forEach((seg, i) => {
      if (i < activeSegs) seg.classList.add("active");
      else seg.classList.remove("active");
    });
  }
  if (repValEl) {
    repValEl.textContent = SYSTEM_STATE.reputationScore.toFixed(1);
  }
  if (repStarsEl) {
    const stars = repStarsEl.querySelectorAll(".rep-star");
    stars.forEach((star, i) => {
      const threshold = i + 1;
      if (SYSTEM_STATE.reputationScore >= threshold) {
        star.classList.add("filled");
        star.classList.remove("partial");
      } else if (SYSTEM_STATE.reputationScore > i && SYSTEM_STATE.reputationScore < threshold) {
        star.classList.add("partial");
        star.classList.remove("filled");
      } else {
        star.classList.remove("filled", "partial");
      }
    });
  }
}

// CITIES DATASET reference to compute details locally
const CITIES_DATASET = {
  helsinki: { id: "helsinki", name: "Helsinki", country: "Finland", isSchengen: true, isCapital: true, purchasable: false, terminalCost: 0 },
  turku: { id: "turku", name: "Turku", country: "Finland", isSchengen: true, isCapital: false, purchasable: true, terminalCost: 180000 },
  stockholm: { id: "stockholm", name: "Stockholm", country: "Sweden", isSchengen: true, isCapital: true, purchasable: true, terminalCost: 320000 },
  malmoe: { id: "malmoe", name: "Malmö", country: "Sweden", isSchengen: true, isCapital: false, purchasable: true, terminalCost: 200000 },
  tallinn: { id: "tallinn", name: "Tallinn", country: "Estonia", isSchengen: true, isCapital: true, purchasable: false, terminalCost: 0 },
  tartu: { id: "tartu", name: "Tartu", country: "Estonia", isSchengen: true, isCapital: false, purchasable: true, terminalCost: 150000 },
  parnu: { id: "parnu", name: "Pärnu", country: "Estonia", isSchengen: true, isCapital: false, purchasable: true, terminalCost: 120000 },
  riga: { id: "riga", name: "Riga", country: "Latvia", isSchengen: true, isCapital: true, purchasable: false, terminalCost: 0 },
  liepaja: { id: "liepaja", name: "Liepāja", country: "Latvia", isSchengen: true, isCapital: false, purchasable: true, terminalCost: 160000 },
  daugavpils: { id: "daugavpils", name: "Daugavpils", country: "Latvia", isSchengen: true, isCapital: false, purchasable: true, terminalCost: 170000 },
  siauliai: { id: "siauliai", name: "Šiauliai", country: "Lithuania", isSchengen: true, isCapital: false, purchasable: false, terminalCost: 0 },
  panevezys: { id: "panevezys", name: "Panevėžys", country: "Lithuania", isSchengen: true, isCapital: false, purchasable: true, terminalCost: 140000 },
  vilnius: { id: "vilnius", name: "Vilnius", country: "Lithuania", isSchengen: true, isCapital: true, purchasable: false, terminalCost: 0 },
  klaipeda: { id: "klaipeda", name: "Klaipėda", country: "Lithuania", isSchengen: true, isCapital: false, purchasable: false, terminalCost: 0 },
  kaunas: { id: "kaunas", name: "Kaunas", country: "Lithuania", isSchengen: true, isCapital: false, purchasable: false, terminalCost: 0 },
  visby: { id: "visby", name: "Visby", country: "Sweden", isSchengen: true, isCapital: false, purchasable: true, terminalCost: 130000 },
  kaliningrad: { id: "kaliningrad", name: "Kaliningrad", country: "Russia (External)", isSchengen: false, isCapital: false, purchasable: true, terminalCost: 500000 },
  gdansk: { id: "gdansk", name: "Gdańsk", country: "Poland", isSchengen: true, isCapital: false, purchasable: true, terminalCost: 220000 },
  warsaw: { id: "warsaw", name: "Warsaw", country: "Poland", isSchengen: true, isCapital: true, purchasable: true, terminalCost: 350000 },
  krakow: { id: "krakow", name: "Kraków", country: "Poland", isSchengen: true, isCapital: false, purchasable: true, terminalCost: 240000 },
  berlin: { id: "berlin", name: "Berlin", country: "Germany", isSchengen: true, isCapital: true, purchasable: true, terminalCost: 600000 },
  hamburg: { id: "hamburg", name: "Hamburg", country: "Germany", isSchengen: true, isCapital: false, purchasable: true, terminalCost: 380000 },
  prague: { id: "prague", name: "Prague", country: "Czech Republic", isSchengen: true, isCapital: true, purchasable: true, terminalCost: 420000 },
  brest: { id: "brest", name: "Brest-Terespol Checkpoint", country: "Belarus Border", isSchengen: false, isCapital: false, purchasable: false, terminalCost: 0 },
  minsk: { id: "minsk", name: "Minsk", country: "Belarus (External)", isSchengen: false, isCapital: true, purchasable: true, terminalCost: 700000 },
  kyiv: { id: "kyiv", name: "Kyiv", country: "Ukraine (External)", isSchengen: false, isCapital: true, purchasable: true, terminalCost: 550000 }
};

// Standard Initialization for all Sub-pages
window.addEventListener("DOMContentLoaded", () => {
  if (checkAuth()) {
    fetchBalances();
    // Refresh balances every 10 seconds
    setInterval(fetchBalances, 10000);
  }
});
