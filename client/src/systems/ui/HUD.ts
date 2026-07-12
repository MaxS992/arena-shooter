import type { KillFeedEntry } from "../gameplay/GameState.js";

let crosshairSize = 4;
let targetCrosshairSize = 4;

export function createHUD(container: HTMLElement): void {
  // Crosshair
  const ch = document.createElement("div");
  ch.id = "crosshair";
  ch.innerHTML = `
    <div class="ch-line ch-top"></div>
    <div class="ch-line ch-bottom"></div>
    <div class="ch-line ch-left"></div>
    <div class="ch-line ch-right"></div>
    <div class="ch-dot"></div>
  `;
  container.appendChild(ch);

  // Health bar
  const hpContainer = document.createElement("div");
  hpContainer.id = "hp-container";
  hpContainer.innerHTML = `
    <div id="hp-bar-bg">
      <div id="hp-bar-fill"></div>
      <div id="hp-bar-damage"></div>
    </div>
    <div id="hp-text">100</div>
  `;
  container.appendChild(hpContainer);

  // Ammo
  const ammoEl = document.createElement("div");
  ammoEl.id = "ammo-display";
  ammoEl.innerHTML = `
    <div id="weapon-name">Assault Rifle</div>
    <div id="ammo-count"><span id="ammo-current">30</span><span id="ammo-sep">/</span><span id="ammo-max">30</span></div>
  `;
  container.appendChild(ammoEl);

  // Kill feed
  const kf = document.createElement("div");
  kf.id = "kill-feed";
  container.appendChild(kf);

  // Score
  const score = document.createElement("div");
  score.id = "score-display";
  score.innerHTML = `<span id="kills">0</span> <span class="score-sep">K</span> <span id="deaths">0</span> <span class="score-sep">D</span>`;
  container.appendChild(score);

  // Reload indicator
  const reload = document.createElement("div");
  reload.id = "reload-indicator";
  reload.textContent = "RELOADING";
  reload.style.display = "none";
  container.appendChild(reload);

  // Death screen
  const deathScreen = document.createElement("div");
  deathScreen.id = "death-screen";
  deathScreen.innerHTML = `
    <div class="death-text">ELIMINATED</div>
    <div id="respawn-timer"></div>
  `;
  deathScreen.style.display = "none";
  container.appendChild(deathScreen);

  // Hit marker
  const hitMarker = document.createElement("div");
  hitMarker.id = "hit-marker";
  hitMarker.innerHTML = `
    <div class="hm-line hm-tl"></div>
    <div class="hm-line hm-tr"></div>
    <div class="hm-line hm-bl"></div>
    <div class="hm-line hm-br"></div>
  `;
  hitMarker.style.display = "none";
  container.appendChild(hitMarker);

  // Inject styles
  const style = document.createElement("style");
  style.textContent = HUD_CSS;
  document.head.appendChild(style);
}

export function updateHUD(
  hp: number,
  maxHp: number,
  ammo: number,
  maxAmmo: number,
  weaponName: string,
  kills: number,
  deaths: number,
  killFeed: KillFeedEntry[],
  reloading: boolean,
  alive: boolean,
  respawnTimer: number,
  hitMarkerActive: boolean,
  hitMarkerKill: boolean,
  shooting: boolean,
  moving: boolean,
): void {
  // HP
  const hpFill = document.getElementById("hp-bar-fill");
  const hpDmg = document.getElementById("hp-bar-damage");
  const hpText = document.getElementById("hp-text");
  const pct = Math.max(0, hp / maxHp * 100);
  if (hpFill) hpFill.style.width = `${pct}%`;
  if (hpDmg) {
    const currentW = parseFloat(hpDmg.style.width || "100");
    const target = pct;
    hpDmg.style.width = `${currentW + (target - currentW) * 0.1}%`;
  }
  if (hpText) hpText.textContent = `${Math.ceil(hp)}`;
  if (hpFill) {
    if (pct < 25) hpFill.style.background = "linear-gradient(90deg, #ff2222, #ff4444)";
    else if (pct < 50) hpFill.style.background = "linear-gradient(90deg, #ff8800, #ffaa00)";
    else hpFill.style.background = "linear-gradient(90deg, #00cc66, #00ff88)";
  }

  // Ammo
  const ammoCur = document.getElementById("ammo-current");
  const ammoMax = document.getElementById("ammo-max");
  const weaponEl = document.getElementById("weapon-name");
  if (ammoCur) {
    ammoCur.textContent = `${ammo}`;
    ammoCur.style.color = ammo <= 5 ? "#ff4444" : "#ffffff";
  }
  if (ammoMax) ammoMax.textContent = `${maxAmmo}`;
  if (weaponEl) weaponEl.textContent = weaponName;

  // Score
  const killsEl = document.getElementById("kills");
  const deathsEl = document.getElementById("deaths");
  if (killsEl) killsEl.textContent = `${kills}`;
  if (deathsEl) deathsEl.textContent = `${deaths}`;

  // Kill feed
  const kf = document.getElementById("kill-feed");
  if (kf) {
    kf.innerHTML = killFeed
      .slice(-5)
      .reverse()
      .map((e) => {
        const killerClass = e.killer === "Player" ? "kf-player" : "";
        const victimClass = e.victim === "Player" ? "kf-player" : "";
        return `<div class="kf-entry"><span class="${killerClass}">${e.killer}</span> <span class="kf-weapon">${e.weapon}</span> <span class="${victimClass}">${e.victim}</span></div>`;
      })
      .join("");
  }

  // Reload
  const reloadEl = document.getElementById("reload-indicator");
  if (reloadEl) reloadEl.style.display = reloading ? "block" : "none";

  // Death screen
  const deathScreen = document.getElementById("death-screen");
  const respawnEl = document.getElementById("respawn-timer");
  if (deathScreen) deathScreen.style.display = alive ? "none" : "flex";
  if (respawnEl) respawnEl.textContent = `Respawn in ${Math.ceil(respawnTimer)}s`;

  // Hit marker
  const hm = document.getElementById("hit-marker");
  if (hm) {
    hm.style.display = hitMarkerActive ? "block" : "none";
    if (hitMarkerActive) {
      hm.className = hitMarkerKill ? "hm-kill" : "";
    }
  }

  // Dynamic crosshair
  targetCrosshairSize = shooting ? 12 : moving ? 8 : 4;
  crosshairSize += (targetCrosshairSize - crosshairSize) * 0.2;
  const gap = crosshairSize;
  const lines = document.querySelectorAll<HTMLElement>(".ch-line");
  if (lines.length === 4) {
    lines[0].style.transform = `translate(-50%, 0) translateY(-${gap + 12}px)`;
    lines[1].style.transform = `translate(-50%, 0) translateY(${gap}px)`;
    lines[2].style.transform = `translate(0, -50%) translateX(-${gap + 12}px)`;
    lines[3].style.transform = `translate(0, -50%) translateX(${gap}px)`;
  }
}

const HUD_CSS = `
  #crosshair {
    position: fixed; left: 50%; top: 50%; pointer-events: none; z-index: 50;
  }
  .ch-dot {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: 3px; height: 3px; background: rgba(255,255,255,0.9); border-radius: 50%;
  }
  .ch-line {
    position: absolute; background: rgba(255,255,255,0.8);
  }
  .ch-top, .ch-bottom { width: 2px; height: 12px; left: 50%; }
  .ch-left, .ch-right { width: 12px; height: 2px; top: 50%; }
  .ch-top { transform: translate(-50%,0) translateY(-16px); }
  .ch-bottom { transform: translate(-50%,0) translateY(4px); }
  .ch-left { transform: translate(0,-50%) translateX(-16px); }
  .ch-right { transform: translate(0,-50%) translateX(4px); }

  #hp-container {
    position: fixed; bottom: 24px; left: 24px; display: flex; align-items: center; gap: 12px; z-index: 50;
  }
  #hp-bar-bg {
    width: 200px; height: 12px; background: rgba(0,0,0,0.6); border-radius: 6px;
    overflow: hidden; position: relative; border: 1px solid rgba(255,255,255,0.1);
  }
  #hp-bar-fill {
    position: absolute; left: 0; top: 0; height: 100%; width: 100%;
    background: linear-gradient(90deg, #00cc66, #00ff88);
    border-radius: 6px; transition: width 0.15s;
  }
  #hp-bar-damage {
    position: absolute; left: 0; top: 0; height: 100%; width: 100%;
    background: rgba(255,0,0,0.4); border-radius: 6px; z-index: -1;
  }
  #hp-text {
    color: #fff; font-family: 'Arial Black', sans-serif; font-size: 22px;
    font-weight: 900; text-shadow: 0 0 8px rgba(0,0,0,0.8);
    min-width: 36px;
  }

  #ammo-display {
    position: fixed; bottom: 24px; right: 24px; text-align: right; z-index: 50;
  }
  #weapon-name {
    color: rgba(255,255,255,0.5); font-family: monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px;
  }
  #ammo-count {
    font-family: 'Arial Black', sans-serif; font-size: 32px; font-weight: 900;
    color: #fff; text-shadow: 0 0 8px rgba(0,0,0,0.8);
  }
  #ammo-sep { color: rgba(255,255,255,0.3); margin: 0 2px; font-size: 20px; }
  #ammo-max { color: rgba(255,255,255,0.4); font-size: 20px; }

  #kill-feed {
    position: fixed; top: 16px; right: 16px; z-index: 50;
    display: flex; flex-direction: column; gap: 4px;
  }
  .kf-entry {
    background: rgba(0,0,0,0.6); padding: 4px 10px; border-radius: 4px;
    font-family: monospace; font-size: 12px; color: #ccc;
    animation: kf-fade 0.3s ease-out;
  }
  .kf-player { color: #44ff88; font-weight: bold; }
  .kf-weapon { color: #888; font-size: 10px; }
  @keyframes kf-fade { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }

  #score-display {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 50;
    font-family: 'Arial Black', sans-serif; font-size: 20px; color: #fff;
    text-shadow: 0 0 8px rgba(0,0,0,0.8);
  }
  .score-sep { color: rgba(255,255,255,0.3); font-size: 12px; margin: 0 6px; }

  #reload-indicator {
    position: fixed; left: 50%; top: 60%; transform: translateX(-50%);
    font-family: monospace; font-size: 14px; color: #ffaa00;
    text-shadow: 0 0 8px rgba(0,0,0,0.8); letter-spacing: 3px;
    animation: reload-pulse 0.8s ease-in-out infinite;
    z-index: 50;
  }
  @keyframes reload-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }

  #death-screen {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 150;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .death-text {
    font-family: 'Arial Black', sans-serif; font-size: 48px; color: #ff4444;
    text-shadow: 0 0 20px rgba(255,0,0,0.5); letter-spacing: 8px;
    animation: death-zoom 0.5s ease-out;
  }
  #respawn-timer {
    font-family: monospace; font-size: 18px; color: rgba(255,255,255,0.6); margin-top: 16px;
  }
  @keyframes death-zoom { from { transform: scale(2); opacity: 0; } to { transform: scale(1); opacity: 1; } }

  #hit-marker {
    position: fixed; left: 50%; top: 50%; pointer-events: none; z-index: 60;
    width: 20px; height: 20px; transform: translate(-50%, -50%);
  }
  .hm-line {
    position: absolute; width: 8px; height: 2px; background: #fff;
  }
  .hm-tl { top: 2px; left: 2px; transform: rotate(-45deg); }
  .hm-tr { top: 2px; right: 2px; transform: rotate(45deg); }
  .hm-bl { bottom: 2px; left: 2px; transform: rotate(45deg); }
  .hm-br { bottom: 2px; right: 2px; transform: rotate(-45deg); }
  #hit-marker.hm-kill .hm-line { background: #ff4444; height: 3px; width: 10px; }
`;
