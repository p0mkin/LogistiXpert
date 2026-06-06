
  // ============================================================
  // STAFF PAGE — ISOLATED SCRIPT
  // All code is wrapped in a self-executing function to prevent
  // any variable leakage or global collision from crashing the page
  // ============================================================
  (function StaffPageApp() {
    'use strict';

    // ── CONSTANTS ──────────────────────────────────────────────
    const ROLES = {
      purchasing_agent: {
        id: 'purchasing_agent',
        name: 'Purchasing Agent',
        icon: '🛒',
        desc: 'Secures fleet-wide discounts on vehicle acquisitions and parts procurement.',
        color: '#00ff66',
        glow: 'rgba(0,255,102,0.15)',
        bg: 'rgba(0,255,102,0.06)',
        border: 'rgba(0,255,102,0.12)',
        unit: '% discount',
        base: 5.0,
        positiveDesc: 'Reduces truck purchase price and maintenance costs.',
        negativeDesc: 'Apprentice surcharges inflate procurement costs.',
      },
      lead_mechanic: {
        id: 'lead_mechanic',
        name: 'Lead Mechanic',
        icon: '🔧',
        desc: 'Accelerates terminal overhauls and slashes emergency roadside repair fees.',
        color: '#bd00ff',
        glow: 'rgba(189,0,255,0.15)',
        bg: 'rgba(189,0,255,0.06)',
        border: 'rgba(189,0,255,0.12)',
        unit: '% repair discount',
        base: 10.0,
        positiveDesc: 'Cuts terminal and breakdown repair bills.',
        negativeDesc: 'Apprentice fumbles cause 25% repair surcharges.',
      },
      router: {
        id: 'router',
        name: 'LogistiXpert Router',
        icon: '🗺️',
        desc: 'Optimizes cargo routing for maximum yield per delivery cycle.',
        color: '#ff6600',
        glow: 'rgba(255,102,0,0.15)',
        bg: 'rgba(255,102,0,0.06)',
        border: 'rgba(255,102,0,0.12)',
        unit: '% payout boost',
        base: 15.0,
        positiveDesc: 'Increases payout on all completed deliveries.',
        negativeDesc: 'Apprentice routing errors cause delivery fee deductions.',
      },
    };

    const RANK_NAMES = {1:'Apprentice', 2:'Junior Associate', 3:'Senior Specialist', 4:'Expert Coordinator', 5:'LogistiXpert'};
    const RANK_MULT  = {1:-0.25, 2:0.20, 3:0.50, 4:0.85, 5:1.25};
    const SEM_COSTS  = [0, 5000, 12000, 28000, 65000]; // index = current level
    const PROM_COSTS = [0, 8000, 20000, 45000, 100000]; // index = current rank
    const UNLOCK_COSTS = {purchasing_agent:0, lead_mechanic:15000, router:35000};

    // ── STATE ───────────────────────────────────────────────────
    let state = {
      staff: null,
      balance: 0,
      heat: 0,
      loading: false,
    };

    // ── SAFE DOM HELPER ─────────────────────────────────────────
    function $id(id) {
      try { return document.getElementById(id); } catch(e) { return null; }
    }

    function safeSetText(id, text) {
      try { const el = $id(id); if (el) el.textContent = text; } catch(e) {}
    }

    // ── MINI TOAST (fallback if shared.js toast not ready) ──────
    function toast(msg, type) {
      try {
        if (typeof showToast === 'function') {
          showToast(msg, type || 'info');
        }
      } catch(e) {}
    }

    // ── HEADER BALANCE UPDATE ───────────────────────────────────
    function updateHeaderStats(balance, heat) {
      try {
        const b = parseFloat(balance) || 0;
        const h = parseFloat(heat) || 0;
        state.balance = b;
        state.heat = h;

        safeSetText('header-clean-balance', '$' + b.toLocaleString('en-US', {minimumFractionDigits: 2}));
        safeSetText('header-heat', Math.round(h) + '%');

        // Also sync global header elements (other pages' pattern)
        safeSetText('clean-amount', '$' + b.toLocaleString('en-US', {minimumFractionDigits: 2}));
        safeSetText('dirty-amount', '$' + (parseFloat(SYSTEM_STATE.dirtyFunds)||0).toLocaleString('en-US', {minimumFractionDigits: 2}));

        // Heat alarm
        const heatOverlay = $id('heat-flash-overlay');
        if (heatOverlay) {
          if (h >= 70) heatOverlay.classList.add('alarming');
          else heatOverlay.classList.remove('alarming');
        }
      } catch(err) {
        console.warn('[Staff] updateHeaderStats error (non-fatal):', err);
      }
    }

    // ── DATA FETCH ──────────────────────────────────────────────
    async function fetchStaffData() {
      if (!SYSTEM_STATE.token) return null;
      try {
        const res = await fetch(SYSTEM_STATE.restUrl + '/api/staff', {
          headers: { 'Authorization': 'Bearer ' + SYSTEM_STATE.token }
        });
        if (!res.ok) return null;
        return await res.json();
      } catch(err) {
        console.error('[Staff] Fetch failed:', err);
        return null;
      }
    }

    // ── MORALE CALCULATION ──────────────────────────────────────
    function computeMorale(s) {
      if (!s.unlocked) return 30;
      const r = (s.rank || 1);
      const l = (s.level || 1);
      return Math.min(100, Math.round((r / 5) * 60 + (l / 5) * 40));
    }

    // ── EFFECT CALCULATION ──────────────────────────────────────
    function computeEffect(role, s) {
      const r = s.rank || 1;
      const l = s.level || 1;
      return role.base * l * RANK_MULT[r];
    }

    // ── ROI ESTIMATE ────────────────────────────────────────────
    function computeROI(effect) {
      return Math.round(effect * 280);
    }

    function computeTotalTrainingCost(level) {
      let total = 0;
      for (let i = 1; i < (level||1); i++) total += SEM_COSTS[i] || 0;
      return total;
    }

    function computeTotalRankCost(rank) {
      let total = 0;
      for (let i = 1; i < (rank||1); i++) total += PROM_COSTS[i] || 0;
      return total;
    }

    // ── BUILD LOCKED CARD ────────────────────────────────────────
    function buildLockedCard(role) {
      const cost = UNLOCK_COSTS[role.id] || 0;
      const canHire = state.balance >= cost;

      const card = document.createElement('div');
      card.className = 'scard';
      card.dataset.roleId = role.id;
      card.style.setProperty('--role-color', role.color);
      card.style.setProperty('--role-glow', role.glow);
      card.style.setProperty('--role-bg', role.bg);
      card.style.setProperty('--role-border', role.border);
      card.style.borderColor = 'rgba(255,0,60,0.1)';

      card.innerHTML = `
        <div class="scard-topbar" style="background: rgba(255,0,60,0.4);"></div>
        <div class="scard-body">
          <div class="scard-role-header">
            <div class="scard-role-icon" style="background:rgba(255,0,60,0.08); border-color:rgba(255,0,60,0.15);">${role.icon}</div>
            <div class="scard-role-info">
              <div class="scard-role-name" style="color: var(--neon-red);">${role.name.toUpperCase()}</div>
              <div class="scard-role-desc">${role.desc}</div>
            </div>
            <div class="scard-status-pill pill-locked">VACANT</div>
          </div>
          <div class="scard-divider"></div>
          <div class="scard-vacant">
            <div class="scard-vacant-icon">🔒</div>
            <div class="scard-vacant-title">SLOT UNOCCUPIED</div>
            <div class="scard-vacant-desc">
              ${role.positiveDesc}<br><br>
              When hired, starts at <span style="color:var(--neon-orange)">Apprentice</span> rank — 
              book seminars and promotions to unlock full potential.
            </div>
          </div>
          <div class="scard-actions">
            <button class="scard-btn primary" ${!canHire ? 'disabled' : ''} data-action="hire">
              <span>${cost === 0 ? '✦ HIRE — FREE' : '✦ HIRE COORDINATOR'}</span>
              <span class="scard-btn-cost">${cost === 0 ? 'IMMEDIATE' : '$' + cost.toLocaleString() + ' CLEAN'}</span>
            </button>
          </div>
        </div>
      `;

      card.querySelector('[data-action="hire"]').addEventListener('click', () => onHire(role.id, cost));
      addTilt(card);
      return card;
    }

    // ── BUILD ACTIVE CARD ────────────────────────────────────────
    function buildActiveCard(role, s) {
      const rank = s.rank || 1;
      const level = s.level || 1;
      const effect = computeEffect(role, s);
      const isPos = effect > 0;
      const isNeg = effect < 0;
      const morale = computeMorale(s);
      const moraleClass = morale >= 70 ? 'hi' : morale >= 40 ? 'md' : 'lo';
      const moraleEmoji = morale >= 70 ? '😎' : morale >= 40 ? '😐' : '😤';
      const roi = computeROI(effect);

      const nextSemCost = s.nextUpgradeCost;
      const nextPromCost = s.nextPromotionCost;
      const canSem  = nextSemCost  !== null && state.balance >= nextSemCost;
      const canProm = nextPromCost !== null && state.balance >= nextPromCost;

      // Level dots
      let levelDotsHTML = '';
      for (let i = 0; i < 5; i++) {
        levelDotsHTML += `<div class="scard-dot ${i < level ? 'on' : ''}"></div>`;
      }
      // Rank pips
      let rankPipsHTML = '';
      for (let i = 0; i < 5; i++) {
        rankPipsHTML += `<div class="scard-dot ${i < rank ? 'on' : ''}"></div>`;
      }

      const effectClass = isPos ? 'pos' : (isNeg ? 'neg' : 'zero');
      const effectSign  = isPos ? '+' : '';
      const effectLabel = isPos
        ? `✦ ACTIVE: ${effectSign}${effect.toFixed(2)}${role.unit}`
        : (isNeg
          ? `⚠ PENALTY: ${effect.toFixed(2)}${role.unit}`
          : '○ INACTIVE — TRAIN TO ACTIVATE');

      const card = document.createElement('div');
      card.className = 'scard';
      card.dataset.roleId = role.id;
      card.style.setProperty('--role-color', role.color);
      card.style.setProperty('--role-glow', role.glow);
      card.style.setProperty('--role-bg', role.bg);
      card.style.setProperty('--role-border', role.border);
      card.style.borderColor = role.border;

      card.innerHTML = `
        <div class="scard-topbar" style="background: ${role.color};"></div>
        <div class="scard-body">

          <!-- Role header -->
          <div class="scard-role-header">
            <div class="scard-role-icon" style="background:${role.bg}; border-color:${role.border};">${role.icon}</div>
            <div class="scard-role-info">
              <div class="scard-role-name">${role.name.toUpperCase()}</div>
              <div class="scard-role-desc">${role.desc}</div>
            </div>
            <div class="scard-status-pill ${morale >= 40 ? 'pill-active' : 'pill-warn'}">
              ${moraleEmoji} ${morale >= 70 ? 'SHARP' : morale >= 40 ? 'STABLE' : 'JADED'}
            </div>
          </div>

          <div class="scard-divider"></div>

          <!-- Effect banner -->
          <div class="scard-effect ${effectClass}">
            ${effectLabel}
            <div class="scard-effect-sub">${isPos ? role.positiveDesc : role.negativeDesc}</div>
          </div>

          <!-- Morale -->
          <div class="scard-morale">
            <div class="scard-morale-label">MORALE</div>
            <div class="scard-morale-track">
              <div class="scard-morale-fill ${moraleClass}" style="width:${morale}%"></div>
            </div>
            <div class="scard-morale-val">${morale}%</div>
          </div>

          <div class="scard-divider"></div>

          <!-- Training level -->
          <div class="scard-track-section">
            <div class="scard-track-header">
              <span class="scard-track-label">🎓 TRAINING SEMINARS</span>
              <span class="scard-track-val">Lv ${level} / 5</span>
            </div>
            <div class="scard-track-dots">${levelDotsHTML}</div>
            <button class="scard-btn ${canSem ? 'primary' : ''}" ${canSem ? '' : 'disabled'} data-action="seminar">
              <span>${nextSemCost === null ? '✦ MAX TRAINING ACHIEVED' : 'BOOK SEMINAR'}</span>
              <span class="scard-btn-cost">${nextSemCost === null ? '' : '$' + nextSemCost.toLocaleString() + ' CLEAN'}</span>
            </button>
          </div>

          <div class="scard-divider"></div>

          <!-- Rank -->
          <div class="scard-track-section">
            <div class="scard-track-header">
              <span class="scard-track-label">⭐ RANK TIER</span>
              <span class="scard-track-val" style="font-size:9px;">${RANK_NAMES[rank].toUpperCase()} &nbsp;·&nbsp; ${RANK_MULT[rank] > 0 ? '+' : ''}${RANK_MULT[rank].toFixed(2)}× mult</span>
            </div>
            <div class="scard-track-dots">${rankPipsHTML}</div>
            <button class="scard-btn ${canProm ? 'primary' : ''}" ${canProm ? '' : 'disabled'} data-action="promote">
              <span>${nextPromCost === null ? '✦ LOGISTIXPERT ELITE — MAX RANK' : 'PROMOTE TO ' + (RANK_NAMES[rank + 1] || 'LOGISTIXPERT').toUpperCase()}</span>
              <span class="scard-btn-cost">${nextPromCost === null ? '' : '$' + nextPromCost.toLocaleString() + ' CLEAN'}</span>
            </button>
          </div>

          <div class="scard-divider"></div>

          <!-- ROI -->
          <div class="scard-roi-grid">
            <div class="scard-roi-cell">
              <div class="scard-roi-label">EFFECT</div>
              <div class="scard-roi-val ${isPos ? 'val-green' : (isNeg ? 'val-red' : 'val-muted')}">
                ${isPos ? '+' : ''}${effect.toFixed(1)}${role.unit.split(' ')[0]}
              </div>
            </div>
            <div class="scard-roi-cell">
              <div class="scard-roi-label">EST. MONTHLY</div>
              <div class="scard-roi-val ${roi >= 0 ? 'val-green' : 'val-red'}">
                ${roi >= 0 ? '+' : ''}$${Math.abs(roi).toLocaleString()}
              </div>
            </div>
            <div class="scard-roi-cell">
              <div class="scard-roi-label">TRAINING SPENT</div>
              <div class="scard-roi-val val-blue">$${computeTotalTrainingCost(level).toLocaleString()}</div>
            </div>
            <div class="scard-roi-cell">
              <div class="scard-roi-label">RANK SPENT</div>
              <div class="scard-roi-val val-blue">$${computeTotalRankCost(rank).toLocaleString()}</div>
            </div>
          </div>

        </div>
      `;

      // Attach actions
      const semBtn = card.querySelector('[data-action="seminar"]');
      if (semBtn && !semBtn.disabled && nextSemCost !== null) {
        semBtn.addEventListener('click', () => onSeminar(role.id, nextSemCost, role.color, level + 1));
      }
      const promBtn = card.querySelector('[data-action="promote"]');
      if (promBtn && !promBtn.disabled && nextPromCost !== null) {
        promBtn.addEventListener('click', () => onPromote(role.id, nextPromCost, role.color, rank + 1));
      }

      addTilt(card);
      return card;
    }

    // ── RENDER ROSTER ────────────────────────────────────────────
    function renderRoster(data) {
      try {
        const grid = $id('staff-roster-grid');
        if (!grid) return;

        grid.innerHTML = '';

        const roleIds = ['purchasing_agent', 'lead_mechanic', 'router'];
        roleIds.forEach(roleId => {
          try {
            const role = ROLES[roleId];
            const s = data && data.staff && data.staff[roleId];
            if (!role) return;

            const card = (s && s.unlocked)
              ? buildActiveCard(role, s)
              : buildLockedCard(role);

            grid.appendChild(card);
          } catch(cardErr) {
            console.error('[Staff] Card render error for', roleId, ':', cardErr);
            // Render a fallback error card so the rest don't break
            const errCard = document.createElement('div');
            errCard.className = 'scard';
            errCard.innerHTML = `
              <div style="padding:20px; font-family:monospace; font-size:10px; color:rgba(255,0,60,0.8);">
                ⚠ CARD RENDER ERROR — ${roleId}<br>
                <span style="opacity:0.5">${cardErr && cardErr.message || 'Unknown error'}</span>
              </div>
            `;
            grid.appendChild(errCard);
          }
        });

        // Update badge
        const badge = $id('roster-status-badge');
        if (badge) {
          badge.textContent = 'SYNCED_' + new Date().toLocaleTimeString();
          badge.className = 'staff-section-badge badge-green';
        }
      } catch(err) {
        console.error('[Staff] renderRoster failed:', err);
      }
    }

    // ── LOAD / REFRESH ────────────────────────────────────────────
    async function loadStaff() {
      if (state.loading) return;
      state.loading = true;

      try {
        // Set badge to loading
        const badge = $id('roster-status-badge');
        if (badge) { badge.textContent = 'LOADING...'; badge.className = 'staff-section-badge'; }

        const data = await fetchStaffData();

        if (!data) {
          toast('Cannot reach personnel server — check connection.', 'error');
          if (badge) { badge.textContent = 'OFFLINE'; badge.className = 'staff-section-badge badge-red'; }
          return;
        }

        state.staff = data.staff;
        updateHeaderStats(data.legalBalance, SYSTEM_STATE.policeHeat);
        renderRoster(data);

      } catch(err) {
        console.error('[Staff] loadStaff error:', err);
        toast('Staff load error: ' + (err && err.message || 'unknown'), 'error');
      } finally {
        state.loading = false;
      }
    }

    function refreshRoster() {
      try { if (typeof AUDIO !== 'undefined') AUDIO.playClick(); } catch(e) {}
      toast('Refreshing roster...', 'info', 1500);
      loadStaff();
    }
    window.refreshRoster = refreshRoster;

    // ── ACTIONS ────────────────────────────────────────────────────
    async function postStaffAction(endpoint, body) {
      const res = await fetch(SYSTEM_STATE.restUrl + '/api/staff/' + endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SYSTEM_STATE.token,
        },
        body: JSON.stringify(body),
      });
      return { ok: res.ok, data: await res.json() };
    }

    function onHire(roleId, cost) {
      try { AUDIO.playClick(); } catch(e) {}
      const role = ROLES[roleId];
      const doHire = async () => {
        try {
          const { ok, data } = await postStaffAction('unlock', { roleId });
          if (ok) {
            try { AUDIO.playSuccess(); } catch(e) {}
            state.balance = parseFloat(data.legalBalance) || state.balance;
            SYSTEM_STATE.cleanFunds = state.balance;
            updateHeaderStats(state.balance, state.heat);
            toast('✦ ' + role.name + ' hired and operational!', 'success');
            await loadStaff();
          } else {
            try { AUDIO.playFailure(); } catch(e) {}
            toast('HIRE ERROR: ' + (data.message || 'unknown'), 'error');
          }
        } catch(err) {
          toast('Network error during hire.', 'error');
        }
      };

      if (cost > 0) {
        try {
          showConfirmModal({
            title: 'HIRE COORDINATOR',
            message: 'Hire a <strong>' + role.name + '</strong>.<br>They start at Apprentice rank and require training to become effective.',
            cost: 'Cost: $' + cost.toLocaleString() + ' Clean Cash',
            color: role.color,
            onConfirm: doHire,
          });
        } catch(e) { doHire(); }
      } else {
        doHire();
      }
    }

    function onSeminar(roleId, cost, color, newLevel) {
      try { AUDIO.playClick(); } catch(e) {}
      const role = ROLES[roleId];
      const doUpgrade = async () => {
        try {
          const { ok, data } = await postStaffAction('upgrade', { roleId });
          if (ok) {
            try { AUDIO.playSuccess(); } catch(e) {}
            state.balance = parseFloat(data.legalBalance) || state.balance;
            SYSTEM_STATE.cleanFunds = state.balance;
            updateHeaderStats(state.balance, state.heat);
            toast('Seminar complete — ' + role.name + ' now Level ' + newLevel + '!', 'success');
            burstParticles(roleId, color);
            await loadStaff();
          } else {
            try { AUDIO.playFailure(); } catch(e) {}
            toast('SEMINAR ERROR: ' + (data.message || 'unknown'), 'error');
          }
        } catch(err) {
          toast('Network error during seminar.', 'error');
        }
      };

      try {
        showConfirmModal({
          title: 'BOOK SEMINAR',
          message: 'Send <strong>' + role.name + '</strong> to a specialist training seminar.<br>Increases base effect multiplier.',
          cost: 'Cost: $' + cost.toLocaleString() + ' Clean Cash',
          color: color,
          onConfirm: doUpgrade,
        });
      } catch(e) { doUpgrade(); }
    }

    function onPromote(roleId, cost, color, newRank) {
      try { AUDIO.playClick(); } catch(e) {}
      const role = ROLES[roleId];
      const newRankName = RANK_NAMES[newRank] || 'LogistiXpert';
      const doPromote = async () => {
        try {
          const { ok, data } = await postStaffAction('promote', { roleId });
          if (ok) {
            try { AUDIO.playSuccess(); } catch(e) {}
            state.balance = parseFloat(data.legalBalance) || state.balance;
            SYSTEM_STATE.cleanFunds = state.balance;
            updateHeaderStats(state.balance, state.heat);
            toast('🌟 PROMOTED — ' + role.name + ' is now ' + newRankName + '!', 'success', 5000);
            burstParticles(roleId, color);
            await loadStaff();
          } else {
            try { AUDIO.playFailure(); } catch(e) {}
            toast('PROMOTE ERROR: ' + (data.message || 'unknown'), 'error');
          }
        } catch(err) {
          toast('Network error during promotion.', 'error');
        }
      };

      try {
        showConfirmModal({
          title: 'PROMOTE COORDINATOR',
          message: 'Promote <strong>' + role.name + '</strong> to <strong>' + newRankName + '</strong>.<br>Dramatically increases effectiveness multiplier.',
          cost: 'Cost: $' + cost.toLocaleString() + ' Clean Cash',
          color: color,
          onConfirm: doPromote,
        });
      } catch(e) { doPromote(); }
    }

    // ── 3D TILT ────────────────────────────────────────────────────
    function addTilt(card) {
      card.addEventListener('mousemove', function(e) {
        try {
          const r = this.getBoundingClientRect();
          const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
          const dy = (e.clientY - (r.top  + r.height / 2)) / (r.height / 2);
          this.style.transform = 'perspective(700px) rotateY(' + (dx * 4) + 'deg) rotateX(' + (-dy * 3) + 'deg) translateZ(3px)';
        } catch(e) {}
      });
      card.addEventListener('mouseleave', function() {
        this.style.transform = '';
      });
    }

    // ── PARTICLE BURST ─────────────────────────────────────────────
    function burstParticles(roleId, color) {
      try {
        const card = document.querySelector('[data-role-id="' + roleId + '"]');
        if (!card) return;
        const r = card.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top  + r.height / 2;

        for (let i = 0; i < 18; i++) {
          const p = document.createElement('div');
          p.className = 'particle-burst';
          const angle = (i / 18) * Math.PI * 2;
          const dist  = 60 + Math.random() * 80;
          p.style.cssText = [
            'left:' + cx + 'px',
            'top:' + cy + 'px',
            'background:' + color,
            'box-shadow:0 0 4px ' + color,
            '--dx:' + (Math.cos(angle) * dist).toFixed(1) + 'px',
            '--dy:' + (Math.sin(angle) * dist).toFixed(1) + 'px',
            'animation-delay:' + (Math.random() * 0.08).toFixed(3) + 's',
          ].join(';');
          document.body.appendChild(p);
          setTimeout(() => { try { p.remove(); } catch(e) {} }, 1000);
        }

        card.classList.add('rank-up-flash');
        setTimeout(() => { try { card.classList.remove('rank-up-flash'); } catch(e) {} }, 800);
      } catch(err) {}
    }

    // ── HEX PARTICLE CANVAS ─────────────────────────────────────────
    function initHexParticles() {
      try {
        const canvas = document.getElementById('staff-particle-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let W = 0, H = 0;
        const hexes = [];
        const colors = ['#00ff66', '#bd00ff', '#ff6600', '#00e5ff'];

        function resize() {
          W = canvas.width  = window.innerWidth;
          H = canvas.height = window.innerHeight;
        }

        function spawnHex() {
          return {
            x: Math.random() * W,
            y: Math.random() * H,
            r: 4 + Math.random() * 12,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 0.03 + Math.random() * 0.08,
            vx: (Math.random() - 0.5) * 0.12,
            vy: -0.08 - Math.random() * 0.2,
            rot: Math.random() * Math.PI * 2,
            vrot: (Math.random() - 0.5) * 0.004,
          };
        }

        function drawHex(cx, cy, r, rot) {
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = rot + (i / 6) * Math.PI * 2;
            if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
            else          ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
          }
          ctx.closePath();
        }

        function frame() {
          ctx.clearRect(0, 0, W, H);
          hexes.forEach((h, i) => {
            h.x += h.vx; h.y += h.vy; h.rot += h.vrot;
            if (h.y + h.r < 0) hexes[i] = Object.assign(spawnHex(), { y: H + h.r });
            ctx.save();
            ctx.globalAlpha = h.alpha;
            ctx.strokeStyle = h.color;
            ctx.lineWidth = 0.7;
            drawHex(h.x, h.y, h.r, h.rot);
            ctx.stroke();
            ctx.restore();
          });
          requestAnimationFrame(frame);
        }

        resize();
        window.addEventListener('resize', resize);
        for (let i = 0; i < 50; i++) hexes.push(spawnHex());
        requestAnimationFrame(frame);
      } catch(err) {
        console.warn('[Staff] Hex particles init failed (non-fatal):', err);
      }
    }

    // ── NEWS TICKER ─────────────────────────────────────────────────
    function initTicker() {
      try {
        const container = document.getElementById('ticker-inner');
        if (!container) return;

        const items = [
          { text: 'POLICE INTEL: Increased checkpoint activity reported on Warsaw–Berlin corridor', cls: 'bad' },
          { text: 'MARKET FLASH: Clean cargo rates up 8% across Schengen zone this week', cls: 'good' },
          { text: 'LOGISTICS REPORT: Brest checkpoint delays averaging +3.5 hours — plan routes accordingly', cls: 'hot' },
          { text: 'EMPLOYEE TIP: Trained coordinators reduce operational overhead by 12–40% vs. unmanaged routes', cls: '' },
          { text: 'CONTRABAND ALERT: Class-III cargo seizure reported near Kaliningrad exclave border post', cls: 'bad' },
          { text: 'MARKET UPDATE: Stockholm–Helsinki sea-lane traffic volume up 22% this quarter', cls: 'good' },
          { text: 'LOGISTICS INTEL: Route optimization yields 15% higher payload efficiency on Nordic circuits', cls: 'good' },
          { text: 'SECURITY: Three rival operators detained at Gdańsk terminal — consolidation opportunity detected', cls: 'hot' },
          { text: 'STAFF INTEL: LogistiXpert-ranked Router generates 1.25× delivery multiplier — invest now', cls: '' },
          { text: 'POLICE HEAT: Patrol density along Baltic coastal routes elevated — maintain safe policy', cls: 'bad' },
          { text: 'MARKET FLASH: Contraband class-II premiums trending up 31% — high-risk operations profitable', cls: 'hot' },
          { text: 'TERMINAL UPDATE: Minsk facility reports 70% police heat — external market operation recommended', cls: 'bad' },
        ];

        // Duplicate for seamless loop
        const fullItems = [...items, ...items];
        container.innerHTML = fullItems.map(item =>
          `<span class="ticker-item ${item.cls}">◈ ${item.text}</span>`
        ).join('');
      } catch(err) {
        console.warn('[Staff] Ticker init failed (non-fatal):', err);
      }
    }

    // ── KEYBOARD SHORTCUTS ──────────────────────────────────────────
    function initKeyboard() {
      document.addEventListener('keydown', function(e) {
        try {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
          const key = e.key ? e.key.toUpperCase() : '';
          if (key === 'R') { refreshRoster(); }
          else if (key === 'H') {
            // Quick-hire all affordable
            if (state.staff) {
              Object.keys(ROLES).forEach(roleId => {
                const s = state.staff[roleId];
                const cost = UNLOCK_COSTS[roleId] || 0;
                if (s && !s.unlocked && state.balance >= cost) {
                  onHire(roleId, cost);
                }
              });
            }
          }
          else if (key === 'ESCAPE') { window.location.href = 'index.html'; }
        } catch(err) {}
      });
    }

    // ── BOOTSTRAP ───────────────────────────────────────────────────
    function boot() {
      try {
        // Start visual systems first — independent of data
        initHexParticles();
        initTicker();
        initKeyboard();

        // Then load data
        // Slight delay to let the DOM settle and shared.js finish its own DOMContentLoaded handlers
        setTimeout(loadStaff, 250);

        // Also update header from SYSTEM_STATE if already populated (from shared.js fetchBalances)
        setTimeout(() => {
          updateHeaderStats(SYSTEM_STATE.cleanFunds, SYSTEM_STATE.policeHeat);
        }, 1000);

      } catch(err) {
        console.error('[Staff] Boot error:', err);
      }
    }

    // Boot as soon as DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot(); // already loaded
    }

  })(); // end StaffPageApp IIFE
  