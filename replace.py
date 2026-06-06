import sys

with open('web/sabotage.html', 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

new_ui = '''      <!-- UNDERWORLD SABOTAGE PANEL -->
      <section class="panel-cyber panel-red sabotage-panel" style="flex: 1; display: flex; flex-direction: column;">
        <div class="panel-title-strip" style="background: var(--neon-red-glow);">
          <h2 class="panel-title" style="color: var(--neon-red);">CORPORATE SABOTAGE NETWORK</h2>
          <span class="panel-serial" style="color: var(--neon-red);">SYS_SAB_01</span>
        </div>

        <div style="padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); height: 100%; overflow-y: auto;">
          <div class="glitch-text" style="color: var(--neon-red); font-size: 1.2rem; margin-bottom: var(--space-2);">TARGET SELECTION & OPERATIONS</div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
            
            <!-- Target List -->
            <div class="target-list-container" style="background: rgba(10, 5, 5, 0.6); border: 1px solid var(--neon-red); padding: var(--space-3); border-radius: var(--radius-sm);">
              <h3 style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: var(--space-3);">IDENTIFIED SYNDICATES</h3>
              <div id="sabotage-target-list" style="display: flex; flex-direction: column; gap: var(--space-2); max-height: 400px; overflow-y: auto;">
                <div style="color: var(--text-muted);">Scanning for vulnerable targets...</div>
              </div>
            </div>

            <!-- Sabotage Controls -->
            <div class="sabotage-actions-container" style="background: rgba(10, 5, 5, 0.6); border: 1px solid var(--neon-red); padding: var(--space-3); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: var(--space-3);">
              <h3 style="color: var(--text-muted); font-size: 0.85rem;">OPERATIONAL DIRECTIVES</h3>
              
              <div id="selected-target-display" style="padding: var(--space-3); background: rgba(255, 51, 51, 0.1); border-left: 3px solid var(--neon-red);">
                <span style="color: var(--neon-red);">NO TARGET SELECTED</span>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
                <button class="action-btn btn-red" onclick="launchSabotage('TIRE_BLOWOUT')" style="--neon-red: #ff5555;">
                  <span class="btn-label">TIRE BLOWOUT</span>
                  <span style="font-size: 0.75rem; opacity: 0.8;">$5,000 BM</span>
                </button>
                <button class="action-btn btn-red" onclick="launchSabotage('ENGINE_FIRE')" style="--neon-red: #ff3333;">
                  <span class="btn-label">ENGINE FIRE</span>
                  <span style="font-size: 0.75rem; opacity: 0.8;">$15,000 BM</span>
                </button>
                <button class="action-btn btn-red" onclick="launchSabotage('CARGO_THEFT')" style="--neon-red: #cc0000;">
                  <span class="btn-label">CARGO THEFT</span>
                  <span style="font-size: 0.75rem; opacity: 0.8;">$25,000 BM</span>
                </button>
                <button class="action-btn btn-red" onclick="launchSabotage('DRIVER_ASSAULT')" style="--neon-red: #990000;">
                  <span class="btn-label">DRIVER ASSAULT</span>
                  <span style="font-size: 0.75rem; opacity: 0.8;">$40,000 BM</span>
                </button>
              </div>
            </div>

          </div>

          <!-- Sabotage Log -->
          <div class="sabotage-log-container" style="margin-top: auto; background: rgba(10, 5, 5, 0.6); border: 1px solid var(--neon-red); padding: var(--space-3); border-radius: var(--radius-sm);">
             <h3 style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: var(--space-3);">EVENT LOG</h3>
             <div id="sabotage-logs" style="height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem;">
             </div>
          </div>
        </div>
      </section>'''

lines = lines[:146] + new_ui.split('\n') + lines[506:]

with open('web/sabotage.html', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
