let currentTargetId = null;

async function fetchTargets() {
  try {
    const res = await fetch('/api/underworld/targets', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (!res.ok) return;
    const targets = await res.json();
    
    const list = document.getElementById('sabotage-target-list');
    list.innerHTML = '';

    targets.forEach(t => {
      const el = document.createElement('div');
      el.style.padding = '8px';
      el.style.border = '1px solid rgba(255, 51, 51, 0.3)';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.justifyContent = 'space-between';
      el.innerHTML = `
        <span style="color: var(--neon-red);">${t.name}</span>
        <span style="color: var(--text-muted);">REP: ${t.reputationScore}</span>
      `;
      el.onclick = () => {
        currentTargetId = t.id;
        document.getElementById('selected-target-display').innerHTML = `
          <span style="color: var(--text-bright);">TARGET ACQUIRED:</span>
          <span style="color: var(--neon-red); font-weight: bold; margin-left: 10px;">${t.name}</span>
        `;
      };
      list.appendChild(el);
    });

  } catch (err) {
    console.error('Failed to fetch targets', err);
  }
}

async function launchSabotage(type) {
  if (!currentTargetId) {
    alert("SELECT A TARGET FIRST");
    return;
  }

  try {
    const res = await fetch('/api/underworld/sabotage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ targetId: currentTargetId, type })
    });
    const data = await res.json();
    
    const logBox = document.getElementById('sabotage-logs');
    const entry = document.createElement('div');
    if (res.ok) {
      entry.style.color = '#00ff00';
      entry.innerText = `[SUCCESS] ${data.message} | Damage: $${data.event.costToRepair}`;
    } else {
      entry.style.color = '#ff3333';
      entry.innerText = `[FAILED] ${data.error}`;
    }
    logBox.prepend(entry);
    
  } catch (err) {
    console.error(err);
  }
}

// Ensure init
document.addEventListener('DOMContentLoaded', () => {
  fetchTargets();
});
