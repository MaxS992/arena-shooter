import { Room, Client } from "@colyseus/core";
import { ArenaState, PlayerState, KillEvent } from "./schema/ArenaState.js";
import { serverConfig } from "../config/index.js";
import { movementTuning, PLAYER_RADIUS } from "shared";

const ARENA_HALF = 19;
const RESPAWN_TIME = 3;
const PLAYER_HEIGHT = 1.8;

interface PlayerInput {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  jump: boolean;
  slide: boolean;
  slideJustPressed: boolean;
  yaw: number;
  pitch: number;
  shoot: boolean;
  reload: boolean;
  weapon: string;
  seq: number;
}

interface ServerPlayerData {
  input: PlayerInput;
  velocity: { x: number; y: number; z: number };
  state: "grounded" | "sliding" | "airborne";
  slideTime: number;
  coyoteTimer: number;
  jumpBufferTimer: number;
  slideOnLand: boolean;
  slideIntentTicks: number;
  slideWasDown: boolean;
  fireCooldown: number;
  reloadTimer: number;
  ammo: number;
}

const SPAWN_POINTS: [number, number, number][] = [
  [10, 0, 10],
  [-10, 0, -10],
  [10, 0, -10],
  [-10, 0, 10],
  [0, 0, 15],
  [0, 0, -15],
  [15, 0, 0],
  [-15, 0, 0],
];

const WEAPON_DEFS: Record<string, { damage: number; fireRate: number; maxAmmo: number; reloadTime: number; range: number; pellets: number; spread: number; headshotMult: number }> = {
  rifle: { damage: 18, fireRate: 10, maxAmmo: 30, reloadTime: 1.8, range: 200, pellets: 1, spread: 0.015, headshotMult: 2.0 },
  shotgun: { damage: 12, fireRate: 1.2, maxAmmo: 6, reloadTime: 2.5, range: 30, pellets: 8, spread: 0.08, headshotMult: 1.5 },
  smg: { damage: 12, fireRate: 16, maxAmmo: 25, reloadTime: 1.4, range: 80, pellets: 1, spread: 0.025, headshotMult: 1.8 },
};

export class ArenaFFARoom extends Room<ArenaState> {
  private playerData = new Map<string, ServerPlayerData>();

  onCreate(): void {
    this.setState(new ArenaState());
    this.setSimulationInterval((dt) => this.tick(dt), serverConfig.tickMs);
    this.onMessage("input", (client, message) => this.onInput(client, message));
    this.onMessage("shoot", (client, message) => this.onShoot(client, message));
    this.maxClients = 8;
  }

  onJoin(client: Client): void {
    const spawn = SPAWN_POINTS[this.state.players.size % SPAWN_POINTS.length];
    const state = new PlayerState();
    state.id = client.id;
    state.x = spawn[0];
    state.y = spawn[1];
    state.z = spawn[2];
    state.health = 100;
    state.maxHealth = 100;
    state.ammo = 30;
    state.maxAmmo = 30;
    state.alive = true;
    this.state.players.set(client.id, state);

    this.playerData.set(client.id, {
      input: { moveX: 0, moveZ: 0, sprint: false, jump: false, slide: false, slideJustPressed: false, yaw: 0, pitch: 0, shoot: false, reload: false, weapon: "rifle", seq: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      state: "grounded",
      slideTime: 0,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      slideOnLand: false,
      slideIntentTicks: 0,
      slideWasDown: false,
      fireCooldown: 0,
      reloadTimer: 0,
      ammo: 30,
    });

    this.broadcast("playerJoined", { id: client.id, total: this.state.players.size });
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.id);
    this.playerData.delete(client.id);
    this.broadcast("playerLeft", { id: client.id });
  }

  private onInput(client: Client, message: unknown): void {
    const data = this.playerData.get(client.id);
    if (!data) return;
    const input = message as Partial<PlayerInput>;
    data.input.moveX = Math.max(-1, Math.min(1, input.moveX ?? 0));
    data.input.moveZ = Math.max(-1, Math.min(1, input.moveZ ?? 0));
    data.input.sprint = !!input.sprint;
    data.input.jump = !!input.jump;
    const slideNow = !!input.slide;
    data.input.slideJustPressed = slideNow && !data.slideWasDown;
    data.slideWasDown = slideNow;
    data.input.slide = slideNow;
    data.input.yaw = typeof input.yaw === "number" ? input.yaw : data.input.yaw;
    data.input.pitch = typeof input.pitch === "number" ? input.pitch : data.input.pitch;
    data.input.reload = !!input.reload;
    if (input.weapon && WEAPON_DEFS[input.weapon]) {
      data.input.weapon = input.weapon;
    }
    if (typeof input.seq === "number") data.input.seq = input.seq;
  }

  private onShoot(client: Client, message: unknown): void {
    const player = this.state.players.get(client.id);
    const data = this.playerData.get(client.id);
    if (!player || !data || !player.alive) return;

    const weapon = WEAPON_DEFS[data.input.weapon] ?? WEAPON_DEFS.rifle;

    if (data.fireCooldown > 0 || data.reloadTimer > 0 || data.ammo <= 0) return;

    data.ammo--;
    player.ammo = data.ammo;
    data.fireCooldown = 1 / weapon.fireRate;
    player.shooting = true;

    if (data.ammo <= 0) {
      data.reloadTimer = weapon.reloadTime;
    }

    // Server-side hitscan
    const msg = message as { dirX?: number; dirY?: number; dirZ?: number };
    if (typeof msg.dirX !== "number") return;

    const originX = player.x;
    const originY = player.y + 1.6; // eye height
    const originZ = player.z;
    const dirX = msg.dirX;
    const dirY = msg.dirY ?? 0;
    const dirZ = msg.dirZ ?? 0;
    const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
    if (dirLen < 0.01) return;
    const ndx = dirX / dirLen;
    const ndy = dirY / dirLen;
    const ndz = dirZ / dirLen;

    // Check hits against all other players
    for (const [targetId, targetState] of this.state.players.entries()) {
      if (targetId === client.id || !targetState.alive) continue;

      // Simple capsule-ray intersection (approximate with cylinder + sphere)
      const hit = this.rayVsCapsule(
        originX, originY, originZ,
        ndx, ndy, ndz,
        targetState.x, targetState.y, targetState.z,
        PLAYER_RADIUS, PLAYER_HEIGHT,
        weapon.range
      );

      if (hit) {
        const isHeadshot = hit.y > targetState.y + PLAYER_HEIGHT * 0.75;
        const damage = Math.round(weapon.damage * (isHeadshot ? weapon.headshotMult : 1));

        targetState.health -= damage;

        // Send hit feedback to shooter
        client.send("hitConfirm", {
          targetId,
          damage,
          headshot: isHeadshot,
          x: hit.x, y: hit.y, z: hit.z,
        });

        // Send damage to target
        const targetClient = this.clients.find(c => c.id === targetId);
        if (targetClient) {
          targetClient.send("damaged", { damage, attackerId: client.id });
        }

        if (targetState.health <= 0) {
          targetState.health = 0;
          targetState.alive = false;
          targetState.respawnTimer = RESPAWN_TIME;
          targetState.deaths++;
          player.kills++;

          const killEvent = new KillEvent();
          killEvent.killer = client.id;
          killEvent.victim = targetId;
          killEvent.weapon = data.input.weapon;
          killEvent.time = this.state.gameTime;
          this.state.killFeed.push(killEvent);
          if (this.state.killFeed.length > 10) {
            this.state.killFeed.shift();
          }

          this.broadcast("kill", {
            killer: client.id,
            victim: targetId,
            weapon: data.input.weapon,
            headshot: isHeadshot,
          });
        }

        break; // Only hit first player in line
      }
    }
  }

  private rayVsCapsule(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    cx: number, cy: number, cz: number,
    radius: number, height: number,
    maxDist: number
  ): { x: number; y: number; z: number } | null {
    // Approximate: check ray vs AABB first, then refine with cylinder
    // Ray vs infinite cylinder (XZ plane)
    const ex = ox - cx;
    const ez = oz - cz;
    const a = dx * dx + dz * dz;
    const b = 2 * (ex * dx + ez * dz);
    const c = ex * ex + ez * ez - radius * radius;

    if (a < 0.0001) return null; // Ray parallel to Y axis, check distance
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;

    const sqrtDisc = Math.sqrt(disc);
    let t = (-b - sqrtDisc) / (2 * a);
    if (t < 0) t = (-b + sqrtDisc) / (2 * a);
    if (t < 0 || t > maxDist) return null;

    const hitY = oy + dy * t;
    if (hitY < cy || hitY > cy + height) {
      // Check sphere caps
      // Top sphere
      const topY = cy + height;
      const tTop = (topY - oy) / (dy || 0.0001);
      if (tTop > 0 && tTop < maxDist) {
        const hx = ox + dx * tTop - cx;
        const hz = oz + dz * tTop - cz;
        if (hx * hx + hz * hz < radius * radius) {
          return { x: ox + dx * tTop, y: topY, z: oz + dz * tTop };
        }
      }
      return null;
    }

    return { x: ox + dx * t, y: hitY, z: oz + dz * t };
  }

  private tick(dtMs: number): void {
    const dt = dtMs / 1000;
    this.state.gameTime += dt;
    const t = movementTuning;

    this.state.players.forEach((player, id) => {
      const data = this.playerData.get(id);
      if (!data) return;

      // Respawn
      if (!player.alive) {
        player.respawnTimer -= dt;
        if (player.respawnTimer <= 0) {
          player.alive = true;
          player.health = 100;
          const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
          player.x = spawn[0];
          player.y = spawn[1];
          player.z = spawn[2];
          data.velocity = { x: 0, y: 0, z: 0 };
          data.state = "grounded";
          data.ammo = WEAPON_DEFS[data.input.weapon]?.maxAmmo ?? 30;
          player.ammo = data.ammo;
          player.maxAmmo = data.ammo;
        }
        return;
      }

      // Weapon cooldowns
      if (data.fireCooldown > 0) data.fireCooldown -= dt;
      if (data.reloadTimer > 0) {
        data.reloadTimer -= dt;
        if (data.reloadTimer <= 0) {
          const w = WEAPON_DEFS[data.input.weapon] ?? WEAPON_DEFS.rifle;
          data.ammo = w.maxAmmo;
          player.ammo = data.ammo;
        }
      }

      player.shooting = false;

      const input = data.input;

      // Jump buffer & coyote
      if (input.jump) data.jumpBufferTimer = t.jumpBufferTime;
      if (data.state === "grounded") data.coyoteTimer = t.coyoteTime;
      else data.coyoteTimer -= dt;

      // Movement simulation (same as client FPSMovementController)
      if (data.state === "sliding") {
        data.slideTime += dt;
        const hor = Math.hypot(data.velocity.x, data.velocity.z);
        data.velocity.x *= t.slideDecay;
        data.velocity.z *= t.slideDecay;
        data.velocity.y -= t.gravity * dt;
        data.velocity.y = Math.max(data.velocity.y, -t.maxFallSpeed);

        player.x += data.velocity.x * dt;
        player.z += data.velocity.z * dt;
        const nextY = player.y + data.velocity.y * dt;
        if (nextY <= 0) { player.y = 0; data.velocity.y = 0; }
        else player.y = nextY;

        this.clampArena(player, data.velocity);

        const stillSliding = hor >= t.slideMinSpeed && data.slideTime < t.slideDurationMax && player.y <= 0.01;
        if (data.jumpBufferTimer > 0 && stillSliding) {
          const mult = t.slideJumpMultiplier;
          data.velocity.y = t.jumpForce * mult;
          data.velocity.x *= mult;
          data.velocity.z *= mult;
          data.jumpBufferTimer = 0;
          data.state = "airborne";
        } else if (!stillSliding) {
          data.state = player.y <= 0.01 ? "grounded" : "airborne";
        }
      } else if (data.state === "airborne") {
        if (input.slideJustPressed) data.slideOnLand = true;

        const cos = Math.cos(input.yaw);
        const sin = Math.sin(input.yaw);
        const axAir = (input.moveX * cos - input.moveZ * sin) * t.airAccel * dt * 0.3;
        const azAir = (-input.moveX * sin - input.moveZ * cos) * t.airAccel * dt * 0.3;
        data.velocity.x += axAir;
        data.velocity.z += azAir;
        const hor = Math.hypot(data.velocity.x, data.velocity.z);
        if (hor > t.airMaxSpeed) {
          data.velocity.x *= t.airMaxSpeed / hor;
          data.velocity.z *= t.airMaxSpeed / hor;
        }
        data.velocity.y -= t.gravity * dt;
        data.velocity.y = Math.max(data.velocity.y, -t.maxFallSpeed);

        player.x += data.velocity.x * dt;
        player.z += data.velocity.z * dt;
        const nextY = player.y + data.velocity.y * dt;
        if (nextY <= 0) {
          player.y = 0;
          data.velocity.y = 0;
          const horLand = Math.hypot(data.velocity.x, data.velocity.z);
          if (data.slideOnLand && horLand >= t.slideEnterSpeed) {
            data.state = "sliding";
            data.slideTime = 0;
            const boost = Math.max(horLand, t.slideInitialSpeed);
            if (horLand > 0) {
              data.velocity.x = (data.velocity.x / horLand) * boost;
              data.velocity.z = (data.velocity.z / horLand) * boost;
            }
          } else {
            data.state = "grounded";
          }
          data.slideOnLand = false;
        } else {
          player.y = nextY;
        }

        this.clampArena(player, data.velocity);
        data.jumpBufferTimer -= dt;
      } else {
        // Grounded
        if (input.slideJustPressed) data.slideIntentTicks = 8;
        const horSpeed = Math.hypot(data.velocity.x, data.velocity.z);
        if (data.slideIntentTicks > 0 && input.sprint && horSpeed >= t.slideEnterSpeed) {
          data.slideIntentTicks = 0;
          data.state = "sliding";
          data.slideTime = 0;
          const hor = Math.hypot(data.velocity.x, data.velocity.z);
          const boost = Math.max(hor, t.slideInitialSpeed);
          if (hor > 0) {
            data.velocity.x = (data.velocity.x / hor) * boost;
            data.velocity.z = (data.velocity.z / hor) * boost;
          }
        } else {
          if (data.slideIntentTicks > 0) data.slideIntentTicks--;

          const speed = input.sprint ? t.maxSpeedSprint : input.slide ? t.maxSpeedCrouch : t.maxSpeedWalk;
          const cos = Math.cos(input.yaw);
          const sin = Math.sin(input.yaw);
          const accel = input.sprint ? t.accel * (t.maxSpeedSprint / t.maxSpeedWalk) : t.accel;
          const ax = (input.moveX * cos - input.moveZ * sin) * accel * dt;
          const az = (-input.moveX * sin - input.moveZ * cos) * accel * dt;
          data.velocity.x += ax;
          data.velocity.z += az;
          data.velocity.x *= Math.max(0, 1 - t.friction * dt);
          data.velocity.z *= Math.max(0, 1 - t.friction * dt);
          const hor = Math.hypot(data.velocity.x, data.velocity.z);
          if (hor > speed) {
            data.velocity.x *= speed / hor;
            data.velocity.z *= speed / hor;
          }

          if (data.jumpBufferTimer > 0 || (input.jump && data.coyoteTimer > 0)) {
            data.velocity.y = t.jumpForce;
            data.state = "airborne";
            data.jumpBufferTimer = 0;
          } else {
            data.velocity.y -= t.gravity * dt;
            data.velocity.y = Math.max(data.velocity.y, -t.maxFallSpeed);
          }

          player.x += data.velocity.x * dt;
          player.z += data.velocity.z * dt;
          const nextY = player.y + data.velocity.y * dt;
          if (nextY <= 0) {
            player.y = 0;
            data.velocity.y = 0;
            data.state = "grounded";
          } else {
            player.y = nextY;
            data.state = "airborne";
          }

          this.clampArena(player, data.velocity);
          data.jumpBufferTimer -= dt;
        }
      }

      // Sync state
      player.yaw = input.yaw;
      player.pitch = input.pitch;
      player.vx = data.velocity.x;
      player.vy = data.velocity.y;
      player.vz = data.velocity.z;
      player.movementState = data.state;
      player.currentWeapon = data.input.weapon;
    });
  }

  private clampArena(player: PlayerState, velocity: { x: number; z: number }): void {
    const limit = ARENA_HALF - PLAYER_RADIUS;
    if (player.x > limit) { player.x = limit; velocity.x = Math.min(0, velocity.x); }
    if (player.x < -limit) { player.x = -limit; velocity.x = Math.max(0, velocity.x); }
    if (player.z > limit) { player.z = limit; velocity.z = Math.min(0, velocity.z); }
    if (player.z < -limit) { player.z = -limit; velocity.z = Math.max(0, velocity.z); }
  }
}
