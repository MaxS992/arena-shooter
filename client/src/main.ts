/**
 * Entry: init systems, game loop, FPS movement, bots (offline) or multiplayer, shooting, effects, audio.
 */

import * as THREE from "three";
import { Client as ColyseusClient } from "colyseus.js";
import { GameLoop } from "./core/GameLoop.js";
import { clientConfig } from "./config/index.js";
import { InputSampler } from "./systems/input/InputState.js";
import { FPSCamera } from "./systems/camera/FPSCamera.js";
import { FPSMovementController } from "./systems/movement/FPSMovementController.js";
import { SceneManager } from "./systems/rendering/SceneManager.js";
import { createHUD, updateHUD } from "./systems/ui/HUD.js";
import { createDebugOverlay, updateDebugOverlay } from "./debug/DebugOverlay.js";
import { WeaponSystem } from "./systems/gameplay/Weapon.js";
import { Bot } from "./systems/gameplay/Bot.js";
import { GameState } from "./systems/gameplay/GameState.js";
import { EffectsSystem } from "./systems/effects/Effects.js";
import { AudioManager } from "./systems/audio/AudioManager.js";
import { FPSWeaponView } from "./systems/gameplay/FPSWeaponView.js";
import { loadDummyModel, loadAnimations, type AnimationSet } from "./systems/assetLoader/AssetLoader.js";
import { PLAYER_EYE_HEIGHT, CROUCH_EYE_HEIGHT } from "shared";

// ── DOM Setup ───────────────────────────────────────────
const app = document.getElementById("app")!;

window.addEventListener(
  "keydown",
  (e: KeyboardEvent) => {
    const code = e.code;
    const key = e.key?.toLowerCase();
    if (e.ctrlKey && (code === "KeyW" || code === "KeyN" || code === "KeyT" || key === "w" || key === "n" || key === "t")) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  { capture: true }
);

const canvas = document.createElement("canvas");
app.appendChild(canvas);

function getCanvasSize() {
  return { w: canvas.clientWidth || window.innerWidth, h: canvas.clientHeight || window.innerHeight };
}

// ── Systems ─────────────────────────────────────────────
const { w: initW, h: initH } = getCanvasSize();
const sceneManager = new SceneManager(canvas);
const cameraSystem = new FPSCamera(90, initW / initH || 16 / 9, 0.1, 1000);
sceneManager.resize(initW, initH);
cameraSystem.resize(initW, initH);

const inputSampler = new InputSampler();
inputSampler.requestPointerLock(canvas);

const movement = new FPSMovementController();
const weapon = new WeaponSystem("rifle");
const gameState = new GameState();
const effects = new EffectsSystem(sceneManager.getScene(), app);
const audio = new AudioManager();
const raycaster = new THREE.Raycaster();

const fpsWeaponView = new FPSWeaponView();

createHUD(app);
if (clientConfig.debugOverlay) createDebugOverlay(app);

const physics = { raycast: (): boolean => false };
const loop = new GameLoop();

// ── Multiplayer ─────────────────────────────────────────
let colyseusClient: ColyseusClient | null = null;
let room: Awaited<ReturnType<ColyseusClient["joinOrCreate"]>> | null = null;
let isMultiplayer = false;
let myId = "";
let inputSeq = 0;

// Remote player rendering
interface RemotePlayer {
  mesh: THREE.Group;
  bodyMesh: THREE.Mesh;
  headMesh: THREE.Mesh;
  targetPos: THREE.Vector3;
  targetYaw: number;
  currentPos: THREE.Vector3;
  currentYaw: number;
  alive: boolean;
  hp: number;
}
const remotePlayers = new Map<string, RemotePlayer>();

function createRemotePlayerMesh(id: string): RemotePlayer {
  const group = new THREE.Group();
  const color = hashColor(id);

  const bodyGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.2, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 0.7;
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  const headGeo = new THREE.SphereGeometry(0.22, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.5 });
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.position.y = 1.5;
  headMesh.castShadow = true;
  group.add(headMesh);

  const visorGeo = new THREE.BoxGeometry(0.3, 0.08, 0.12);
  const visorMat = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xaa0000, emissiveIntensity: 0.5 });
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 1.52, 0.15);
  group.add(visor);

  const gunGeo = new THREE.BoxGeometry(0.08, 0.08, 0.5);
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const gun = new THREE.Mesh(gunGeo, gunMat);
  gun.position.set(0.25, 1.1, 0.3);
  group.add(gun);

  // Name tag
  const nameCanvas = document.createElement("canvas");
  nameCanvas.width = 256;
  nameCanvas.height = 64;
  const ctx2d = nameCanvas.getContext("2d")!;
  ctx2d.fillStyle = "rgba(0,0,0,0.5)";
  ctx2d.fillRect(0, 0, 256, 64);
  ctx2d.fillStyle = "#ffffff";
  ctx2d.font = "bold 28px Arial";
  ctx2d.textAlign = "center";
  ctx2d.fillText(`Player ${id.slice(0, 4)}`, 128, 42);
  const nameTexture = new THREE.CanvasTexture(nameCanvas);
  const nameMat = new THREE.SpriteMaterial({ map: nameTexture, transparent: true, opacity: 0.8 });
  const nameSprite = new THREE.Sprite(nameMat);
  nameSprite.position.y = 2.1;
  nameSprite.scale.set(1.5, 0.4, 1);
  group.add(nameSprite);

  sceneManager.getScene().add(group);

  return {
    mesh: group,
    bodyMesh,
    headMesh,
    targetPos: new THREE.Vector3(),
    targetYaw: 0,
    currentPos: new THREE.Vector3(),
    currentYaw: 0,
    alive: true,
    hp: 100,
  };
}

function hashColor(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash % 360);
  return new THREE.Color().setHSL(hue / 360, 0.7, 0.5).getHex();
}

async function connectMultiplayer(): Promise<boolean> {
  try {
    colyseusClient = new ColyseusClient(clientConfig.serverUrl);
    room = await colyseusClient.joinOrCreate("arena_ffa");
    myId = room.sessionId;
    isMultiplayer = true;

    (room.state as any).players.onAdd((player: any, key: string) => {
      if (key === myId) return;
      const rp = createRemotePlayerMesh(key);
      rp.targetPos.set(player.x, player.y, player.z);
      rp.currentPos.copy(rp.targetPos);
      rp.mesh.position.copy(rp.currentPos);
      remotePlayers.set(key, rp);

      player.onChange(() => {
        rp.targetPos.set(player.x, player.y, player.z);
        rp.targetYaw = player.yaw;
        rp.alive = player.alive;
        rp.hp = player.health;
        rp.mesh.visible = player.alive;
      });
    });

    (room.state as any).players.onRemove((_player: any, key: string) => {
      const rp = remotePlayers.get(key);
      if (rp) {
        sceneManager.getScene().remove(rp.mesh);
        remotePlayers.delete(key);
      }
    });

    // Hit confirmation from server
    room.onMessage("hitConfirm", (msg: any) => {
      audio.playHit();
      effects.spawnHitParticles(new THREE.Vector3(msg.x, msg.y, msg.z));
      effects.showDamageNumber(
        msg.damage,
        window.innerWidth / 2 + (Math.random() - 0.5) * 40,
        window.innerHeight / 2 - 30,
        msg.headshot
      );
      if (msg.damage >= 100 || !remotePlayers.get(msg.targetId)?.alive) {
        effects.showHitMarker(true);
        audio.playKill();
      } else {
        effects.showHitMarker(false);
      }
    });

    room.onMessage("damaged", (msg: any) => {
      gameState.playerTakeDamage(msg.damage);
      effects.triggerDamageFlash(0.4);
      audio.playDamage();
    });

    room.onMessage("kill", (msg: any) => {
      const killerName = msg.killer === myId ? "You" : `Player ${msg.killer.slice(0, 4)}`;
      const victimName = msg.victim === myId ? "You" : `Player ${msg.victim.slice(0, 4)}`;
      gameState.addKill(killerName, victimName, msg.weapon);
      if (msg.victim === myId) {
        audio.playDeath();
      }
    });

    // Sync own state from server
    (room.state as any).players.onAdd((player: any, key: string) => {
      if (key !== myId) return;
      player.onChange(() => {
        gameState.playerHp = player.health;
        gameState.playerAlive = player.alive;
        gameState.playerKills = player.kills;
        gameState.playerDeaths = player.deaths;
        if (!player.alive) {
          gameState.respawnTimer = player.respawnTimer;
        }
        weapon.ammo = player.ammo;

        // Server reconciliation: snap to server position if too far off
        const dx = player.x - movement.position.x;
        const dz = player.z - movement.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 3) {
          movement.position.x = player.x;
          movement.position.y = player.y;
          movement.position.z = player.z;
        }
      });
    });

    console.log("Connected to server!", room.sessionId);
    return true;
  } catch (e) {
    console.log("Multiplayer connection failed, playing offline with bots", e);
    return false;
  }
}

// ── Bots (offline mode) ─────────────────────────────────
const bots: Bot[] = [];
const NUM_BOTS = 4;
const spawnPositions = [
  new THREE.Vector3(14, 0, 14), new THREE.Vector3(-14, 0, 14),
  new THREE.Vector3(14, 0, -14), new THREE.Vector3(-14, 0, -14),
];

let botModelTemplate: THREE.Object3D | null = null;
let botAnimations: AnimationSet | null = null;

async function loadBotAssets(): Promise<void> {
  try {
    const [dummyResult, anims] = await Promise.all([
      loadDummyModel(clientConfig.dummyModelUrl),
      loadAnimations(),
    ]);
    botModelTemplate = dummyResult.scene;
    botAnimations = anims;
    console.log(`Loaded bot model + ${anims.clips.size} animations`);
  } catch (e) {
    console.warn("Failed to load bot models, using fallback:", e);
  }
}

function initBots(): void {
  for (let i = 0; i < NUM_BOTS; i++) {
    const bot = new Bot(spawnPositions[i % spawnPositions.length], i, botModelTemplate, botAnimations);
    bots.push(bot);
    sceneManager.getScene().add(bot.mesh);
  }
}

function getBotRaycastTargets(): THREE.Object3D[] {
  const targets: THREE.Object3D[] = [];
  for (const bot of bots) {
    if (bot.state !== "dead") targets.push(...bot.getMeshesForRaycast());
  }
  return targets;
}


function findBotByMesh(mesh: THREE.Object3D): Bot | null {
  for (const bot of bots) {
    // Walk up parent chain to find the bot root mesh
    let obj: THREE.Object3D | null = mesh;
    while (obj) {
      if (obj === bot.mesh) return bot;
      obj = obj.parent;
    }
  }
  return null;
}

// ── Menu & Start ────────────────────────────────────────
const menu = document.getElementById("menu")!;
let gameStarted = false;

async function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  menu.style.display = "none";
  audio.init();
  canvas.requestPointerLock();

  // Add camera to scene so camera children (weapon) render
  sceneManager.getScene().add(cameraSystem.getCamera());
  // Attach FPS weapon to camera
  fpsWeaponView.attachToCamera(cameraSystem.getCamera());

  // Load bot assets first
  await loadBotAssets();

  // Try multiplayer first
  const connected = await connectMultiplayer();
  if (!connected) {
    initBots();
  }

  // Update status display
  const statusEl = document.getElementById("connection-status");
  if (statusEl) {
    statusEl.textContent = isMultiplayer
      ? `ONLINE - ${(room?.state as any)?.players?.size ?? 0} players`
      : "OFFLINE - Playing vs Bots";
    statusEl.style.color = isMultiplayer ? "#44ff88" : "#ffaa44";
  }

  loop.start();
}

// ── Input ───────────────────────────────────────────────
let shooting = false;

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    if (!gameStarted) { startGame(); return; }
    shooting = true;
    audio.init();
  }
});
canvas.addEventListener("mouseup", (e) => { if (e.button === 0) shooting = false; });

window.addEventListener("keydown", (e) => {
  if (!gameStarted) return;
  if (e.code === "Digit1") weapon.switchWeapon(0);
  if (e.code === "Digit2") weapon.switchWeapon(1);
  if (e.code === "Digit3") weapon.switchWeapon(2);
  if (e.code === "KeyR") weapon.startReload();
});
canvas.addEventListener("wheel", (e) => {
  if (!gameStarted) return;
  weapon.switchWeapon(e.deltaY > 0 ? 1 : -1);
});

// ── Game Logic ──────────────────────────────────────────
function gameTick(dt: number): void {
  const input = inputSampler.getState();
  gameState.update(dt);
  weapon.update(dt);

  if (!gameState.playerAlive) {
    shooting = false;
    if (gameState.respawnTimer <= 0.1 && gameState.respawnTimer > 0 && !isMultiplayer) {
      movement.position.x = 0; movement.position.y = 0; movement.position.z = 0;
      movement.velocity.x = 0; movement.velocity.y = 0; movement.velocity.z = 0;
    }
  }

  // Client-side prediction: always run movement locally
  if (gameState.playerAlive) {
    movement.update(dt, input, physics);
  }

  const snap = movement.getSnapshot();
  const eyeHeight = snap.crouching ? CROUCH_EYE_HEIGHT : PLAYER_EYE_HEIGHT;
  cameraSystem.setTargetPosition(snap.position.x, snap.position.y + eyeHeight, snap.position.z);
  cameraSystem.setRotation(snap.yaw, snap.pitch - weapon.recoilOffset);

  // Send input to server
  if (isMultiplayer && room) {
    inputSeq++;
    room.send("input", {
      moveX: input.moveX,
      moveZ: input.moveZ,
      sprint: input.sprint,
      jump: input.jump,
      slide: input.slide,
      yaw: input.yaw,
      pitch: input.pitch,
      reload: input.reload,
      weapon: weapon.currentWeapon.name === "Assault Rifle" ? "rifle" : weapon.currentWeapon.name === "Shotgun" ? "shotgun" : "smg",
      seq: inputSeq,
    });
  }

  // Shooting
  if (shooting && gameState.playerAlive && weapon.canFire()) {
    const fired = weapon.fire();
    if (fired) {
      const cam = cameraSystem.getCamera();
      const wName = weapon.currentWeapon.name;
      if (wName === "Shotgun") audio.playShotgun();
      else audio.playShoot();
      effects.spawnMuzzleFlash(cam);
      fpsWeaponView.fire();

      if (isMultiplayer && room) {
        // Send shoot to server with direction for validation
        const dir = weapon.getSpreadDirection(cam);
        room.send("shoot", { dirX: dir.x, dirY: dir.y, dirZ: dir.z });
      } else {
        // Offline: hitscan against bots
        const targets = getBotRaycastTargets();
        const hits = weapon.hitscan(cam, targets, raycaster);
        for (const hit of hits) {
          const bot = findBotByMesh(hit.target);
          if (!bot || bot.state === "dead") continue;
          const isHeadshot = hit.point.y > bot.position.y + 1.4; // above neck = headshot
          const dmg = Math.round(weapon.currentWeapon.damage * (isHeadshot ? weapon.currentWeapon.headshotMult : 1));
          const killed = bot.takeDamage(dmg);
          effects.spawnHitParticles(hit.point);
          audio.playHit();
          const screenPos = hit.point.clone().project(cam);
          effects.showDamageNumber(dmg, (screenPos.x * 0.5 + 0.5) * window.innerWidth, (-screenPos.y * 0.5 + 0.5) * window.innerHeight, isHeadshot);
          if (killed) {
            effects.showHitMarker(true);
            audio.playKill();
            gameState.addKill("Player", `Bot ${bots.indexOf(bot) + 1}`, wName);
          } else {
            effects.showHitMarker(false);
          }
        }
        if (hits.length === 0) {
          // Wall sparks
          const dir = weapon.getSpreadDirection(cam);
          raycaster.set(cam.position.clone(), dir);
          raycaster.far = weapon.currentWeapon.range;
          const wallHits = raycaster.intersectObjects(sceneManager.obstacles, false);
          if (wallHits.length > 0) effects.spawnWallHitParticles(wallHits[0].point);
        }
      }
    }
  }

  // Bot updates (offline only)
  if (!isMultiplayer) {
    const playerPos = new THREE.Vector3(snap.position.x, snap.position.y, snap.position.z);
    for (const bot of bots) {
      const result = bot.update(dt, playerPos, sceneManager.obstacles);
      if (result.fired) audio.playBotShoot();
      if (result.hitPlayer && gameState.playerAlive) {
        const died = gameState.playerTakeDamage(result.damage);
        effects.triggerDamageFlash(0.4);
        audio.playDamage();
        if (died) {
          audio.playDeath();
          gameState.addKill(`Bot ${bots.indexOf(bot) + 1}`, "Player", "Rifle");
          shooting = false;
        }
      }
    }
  }
}

// ── Render ──────────────────────────────────────────────
function gameRender(dt: number): void {
  cameraSystem.update(dt);
  effects.update(dt, cameraSystem.getCamera());

  // Interpolate remote players
  for (const [, rp] of remotePlayers) {
    rp.currentPos.lerp(rp.targetPos, 0.2);
    rp.currentYaw += (rp.targetYaw - rp.currentYaw) * 0.2;
    rp.mesh.position.copy(rp.currentPos);
    rp.mesh.rotation.y = rp.currentYaw;
  }

  sceneManager.render(cameraSystem.getCamera());

  const snap = movement.getSnapshot();
  const isMoving = Math.hypot(snap.velocity.x, snap.velocity.z) > 1;
  const isSprinting = inputSampler.getState().sprint && isMoving;
  fpsWeaponView.update(dt, isMoving, isSprinting, snap.crouching);

  updateHUD(
    gameState.playerHp, gameState.playerMaxHp,
    weapon.ammo, weapon.maxAmmo,
    weapon.currentWeapon.name,
    gameState.playerKills, gameState.playerDeaths,
    gameState.killFeed, weapon.reloading,
    gameState.playerAlive, gameState.respawnTimer,
    effects.hitMarker !== null, effects.hitMarker?.kill ?? false,
    shooting && weapon.fireCooldown > 0, isMoving,
  );

  if (clientConfig.debugOverlay) {
    updateDebugOverlay(snap.velocity, snap.state, inputSampler.getState().sprint);
  }

  // Update connection status
  if (isMultiplayer && room) {
    const statusEl = document.getElementById("connection-status");
    if (statusEl) statusEl.textContent = `ONLINE - ${(room.state as any)?.players?.size ?? 0} players`;
  }
}

loop.setTickCallback(gameTick).setRenderCallback(gameRender);

window.addEventListener("resize", () => {
  const { w, h } = getCanvasSize();
  cameraSystem.resize(w, h);
  sceneManager.resize(w, h);
});

// ── Start ───────────────────────────────────────────────
menu.addEventListener("click", startGame);
