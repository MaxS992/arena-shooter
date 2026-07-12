/**
 * FPS movement: state machine (grounded / sliding / airborne), sprint, double jump, slide, slide jump.
 * Obstacle collision support via resolveObstacles.
 */

import type { Vec3 } from "shared";
import type { InputState } from "../input/InputState.js";
import { movementTuning } from "shared";
import { PLAYER_RADIUS, PLAYER_HEIGHT } from "shared";
import { resolveArenaWalls, resolveObstacles, applyWallVelocitySlide } from "./arenaCollision.js";

export type MovementStateName = "grounded" | "sliding" | "airborne";

export interface MovementSnapshot {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  grounded: boolean;
  state: MovementStateName;
  crouching: boolean;
}

const MAX_JUMPS = 2; // double jump
const ARENA_LIMIT = 21; // hard clamp so player never leaves arena

export class FPSMovementController {
  position = { x: 0, y: 0, z: 0 };
  velocity = { x: 0, y: 0, z: 0 };
  yaw = 0;
  pitch = 0;
  private state: MovementStateName = "grounded";
  private slideTime = 0;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private crouching = false;
  private slideIntentTicks = 0;
  private slideOnLand = false;
  private jumpsRemaining = MAX_JUMPS;
  private jumpJustPressed = false;
  private jumpWasDown = false;
  private groundY = 0; // current ground height (can be on top of obstacle)

  update(dt: number, input: Readonly<InputState>, _physics: { raycast?: () => boolean }): void {
    const t = movementTuning;

    // One-shot jump detection
    this.jumpJustPressed = input.jump && !this.jumpWasDown;
    this.jumpWasDown = input.jump;

    // Jump buffer
    if (this.jumpJustPressed) this.jumpBufferTimer = t.jumpBufferTime;

    // Coyote time
    if (this.state === "grounded") {
      this.coyoteTimer = t.coyoteTime;
      this.jumpsRemaining = MAX_JUMPS;
    } else {
      this.coyoteTimer -= dt;
    }

    // ── SLIDING ─────────────────────────────────────────
    if (this.state === "sliding") {
      this.slideTime += dt;
      const hor = Math.hypot(this.velocity.x, this.velocity.z);
      this.velocity.x *= t.slideDecay;
      this.velocity.z *= t.slideDecay;
      this.velocity.y -= t.gravity * dt;
      this.velocity.y = Math.max(this.velocity.y, -t.maxFallSpeed);

      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      const nextY = this.position.y + this.velocity.y * dt;

      // Resolve collisions
      const wallResult = resolveArenaWalls(this.position.x, this.position.z, PLAYER_RADIUS);
      this.position.x = wallResult.x;
      this.position.z = wallResult.z;
      applyWallVelocitySlide(this.velocity, wallResult);

      const obsResult = resolveObstacles(this.position.x, nextY, this.position.z, PLAYER_RADIUS, PLAYER_HEIGHT);
      this.position.x = obsResult.x;
      this.position.z = obsResult.z;
      this.groundY = obsResult.groundY;
      applyWallVelocitySlide(this.velocity, obsResult);

      if (nextY <= this.groundY) {
        this.position.y = this.groundY;
        this.velocity.y = 0;
      } else {
        this.position.y = nextY;
      }

      const stillSliding = hor >= t.slideMinSpeed && this.slideTime < t.slideDurationMax && this.position.y <= this.groundY + 0.05;

      // Slide jump
      if (this.jumpBufferTimer > 0 && stillSliding) {
        const mult = t.slideJumpMultiplier;
        this.velocity.y = t.jumpForce * mult;
        this.velocity.x *= mult;
        this.velocity.z *= mult;
        this.jumpBufferTimer = 0;
        this.jumpsRemaining = MAX_JUMPS - 1;
        this.state = "airborne";
      } else if (!stillSliding) {
        this.state = this.position.y <= this.groundY + 0.05 ? "grounded" : "airborne";
      }

      this.yaw = input.yaw;
      this.pitch = input.pitch;
      this.crouching = true;
      this.clampArena();
      return;
    }

    // ── AIRBORNE ────────────────────────────────────────
    if (this.state === "airborne") {
      if (input.slideJustPressed) this.slideOnLand = true;

      // Double jump
      if (this.jumpJustPressed && this.jumpsRemaining > 0) {
        this.velocity.y = t.jumpForce * 0.9; // slightly weaker second jump
        this.jumpsRemaining--;
        this.jumpBufferTimer = 0;
      }

      const cos = Math.cos(this.yaw);
      const sin = Math.sin(this.yaw);
      const axAir = (input.moveX * cos - input.moveZ * sin) * t.airAccel * dt * 0.3;
      const azAir = (-input.moveX * sin - input.moveZ * cos) * t.airAccel * dt * 0.3;
      this.velocity.x += axAir;
      this.velocity.z += azAir;
      const hor = Math.hypot(this.velocity.x, this.velocity.z);
      if (hor > t.airMaxSpeed) {
        this.velocity.x *= t.airMaxSpeed / hor;
        this.velocity.z *= t.airMaxSpeed / hor;
      }
      this.velocity.y -= t.gravity * dt;
      this.velocity.y = Math.max(this.velocity.y, -t.maxFallSpeed);

      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      const nextY = this.position.y + this.velocity.y * dt;

      // Wall collision
      const wallAir = resolveArenaWalls(this.position.x, this.position.z, PLAYER_RADIUS);
      this.position.x = wallAir.x;
      this.position.z = wallAir.z;
      applyWallVelocitySlide(this.velocity, wallAir);

      // Obstacle collision
      const obsAir = resolveObstacles(this.position.x, nextY, this.position.z, PLAYER_RADIUS, PLAYER_HEIGHT);
      this.position.x = obsAir.x;
      this.position.z = obsAir.z;
      this.groundY = obsAir.groundY;
      applyWallVelocitySlide(this.velocity, obsAir);

      if (nextY <= this.groundY) {
        this.position.y = this.groundY;
        this.velocity.y = 0;
        const horLand = Math.hypot(this.velocity.x, this.velocity.z);
        if (this.slideOnLand && horLand >= t.slideEnterSpeed) {
          this.state = "sliding";
          this.slideTime = 0;
          this.crouching = true;
          const boost = Math.max(horLand, t.slideInitialSpeed);
          if (horLand > 0) {
            this.velocity.x = (this.velocity.x / horLand) * boost;
            this.velocity.z = (this.velocity.z / horLand) * boost;
          }
        } else {
          this.state = "grounded";
        }
        this.slideOnLand = false;
      } else {
        this.position.y = nextY;
      }

      this.yaw = input.yaw;
      this.pitch = input.pitch;
      this.jumpBufferTimer -= dt;
      this.crouching = this.state === "sliding";
      this.clampArena();
      return;
    }

    // ── GROUNDED ────────────────────────────────────────

    // Slide entry
    if (input.slideJustPressed) this.slideIntentTicks = 8;
    const horSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.slideIntentTicks > 0 && input.sprint && horSpeed >= t.slideEnterSpeed) {
      this.slideIntentTicks = 0;
      this.state = "sliding";
      this.slideTime = 0;
      this.crouching = true;
      const hor = Math.hypot(this.velocity.x, this.velocity.z);
      const boost = Math.max(hor, t.slideInitialSpeed);
      if (hor > 0) {
        this.velocity.x = (this.velocity.x / hor) * boost;
        this.velocity.z = (this.velocity.z / hor) * boost;
      }
      return;
    }
    if (this.slideIntentTicks > 0) this.slideIntentTicks--;

    // Movement
    const speed = input.sprint ? t.maxSpeedSprint : input.slide ? t.maxSpeedCrouch : t.maxSpeedWalk;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const accel = input.sprint ? t.accel * (t.maxSpeedSprint / t.maxSpeedWalk) : t.accel;
    const ax = (input.moveX * cos - input.moveZ * sin) * accel * dt;
    const az = (-input.moveX * sin - input.moveZ * cos) * accel * dt;
    this.velocity.x += ax;
    this.velocity.z += az;
    this.velocity.x *= Math.max(0, 1 - t.friction * dt);
    this.velocity.z *= Math.max(0, 1 - t.friction * dt);
    const hor = Math.hypot(this.velocity.x, this.velocity.z);
    if (hor > speed) {
      this.velocity.x *= speed / hor;
      this.velocity.z *= speed / hor;
    }

    // Jump
    if (this.jumpBufferTimer > 0 || (this.jumpJustPressed && this.coyoteTimer > 0)) {
      this.velocity.y = t.jumpForce;
      this.state = "airborne";
      this.jumpsRemaining = MAX_JUMPS - 1;
      this.jumpBufferTimer = 0;
    } else {
      this.velocity.y -= t.gravity * dt;
      this.velocity.y = Math.max(this.velocity.y, -t.maxFallSpeed);
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    const nextY = this.position.y + this.velocity.y * dt;

    // Wall collision
    const wallGnd = resolveArenaWalls(this.position.x, this.position.z, PLAYER_RADIUS);
    this.position.x = wallGnd.x;
    this.position.z = wallGnd.z;
    applyWallVelocitySlide(this.velocity, wallGnd);

    // Obstacle collision
    const obsGnd = resolveObstacles(this.position.x, nextY, this.position.z, PLAYER_RADIUS, PLAYER_HEIGHT);
    this.position.x = obsGnd.x;
    this.position.z = obsGnd.z;
    this.groundY = obsGnd.groundY;
    applyWallVelocitySlide(this.velocity, obsGnd);

    if (nextY <= this.groundY) {
      this.position.y = this.groundY;
      this.velocity.y = 0;
      this.state = "grounded";
    } else {
      this.position.y = nextY;
      this.state = "airborne";
    }

    this.yaw = input.yaw;
    this.pitch = input.pitch;
    this.jumpBufferTimer -= dt;
    this.crouching = input.slide;
    this.clampArena();
  }

  /** Hard clamp to arena bounds — safety net after all collision. */
  private clampArena(): void {
    if (this.position.x > ARENA_LIMIT) { this.position.x = ARENA_LIMIT; this.velocity.x = Math.min(0, this.velocity.x); }
    if (this.position.x < -ARENA_LIMIT) { this.position.x = -ARENA_LIMIT; this.velocity.x = Math.max(0, this.velocity.x); }
    if (this.position.z > ARENA_LIMIT) { this.position.z = ARENA_LIMIT; this.velocity.z = Math.min(0, this.velocity.z); }
    if (this.position.z < -ARENA_LIMIT) { this.position.z = -ARENA_LIMIT; this.velocity.z = Math.max(0, this.velocity.z); }
  }

  getSnapshot(): MovementSnapshot {
    return {
      position: { ...this.position },
      velocity: { ...this.velocity },
      yaw: this.yaw,
      pitch: this.pitch,
      grounded: this.state === "grounded",
      state: this.state,
      crouching: this.crouching,
    };
  }
}
