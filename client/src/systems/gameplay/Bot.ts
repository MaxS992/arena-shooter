import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { PLAYER_RADIUS } from "shared";
import type { AnimationSet } from "../assetLoader/AssetLoader.js";

export type BotState = "patrol" | "chase" | "attack" | "dead";

const BOT_SPEED_PATROL = 2.5;
const BOT_SPEED_CHASE = 5;
const BOT_SIGHT_RANGE = 25;
const BOT_ATTACK_RANGE = 20;
const BOT_FIRE_RATE = 1.2;
const BOT_DAMAGE = 5;
const BOT_ACCURACY = 0.25;
const BOT_RESPAWN_TIME = 5;
const BOT_MAX_HP = 80;
const BOT_REACT_TIME = 0.6;

const TINT_COLORS = [0xff4444, 0x44ff44, 0xffaa00, 0xff44ff, 0x44ffff, 0xff8844, 0x8844ff, 0x44ff88];

export class Bot {
  mesh: THREE.Object3D;
  hp = BOT_MAX_HP;
  maxHp = BOT_MAX_HP;
  state: BotState = "patrol";
  position: THREE.Vector3;
  velocity = new THREE.Vector3();
  yaw = 0;
  fireCooldown = 0;
  respawnTimer = 0;
  patrolTarget = new THREE.Vector3();
  private reactTimer = 0;
  private tintColor: number;
  score = 0;

  // Animation
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private currentAction: THREE.AnimationAction | null = null;
  private currentAnimName = "";

  // Raycast targets — collect skinned meshes
  private raycastMeshes: THREE.Mesh[] = [];

  constructor(
    spawnPos: THREE.Vector3,
    index: number,
    modelTemplate: THREE.Object3D | null,
    animations: AnimationSet | null
  ) {
    this.tintColor = TINT_COLORS[index % TINT_COLORS.length];
    this.position = spawnPos.clone();

    if (modelTemplate) {
      this.mesh = cloneSkeleton(modelTemplate);
      this.mesh.scale.setScalar(1);
      // Clone materials per bot and apply unique tint
      this.mesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          this.raycastMeshes.push(mesh);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          // Clone material so each bot has its own
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map(m => {
              const cloned = m.clone();
              this.applyTint(cloned as THREE.MeshStandardMaterial);
              return cloned;
            });
          } else {
            mesh.material = mesh.material.clone();
            this.applyTint(mesh.material as THREE.MeshStandardMaterial);
          }
        }
      });

      // Setup animations
      if (animations && animations.clips.size > 0) {
        this.mixer = new THREE.AnimationMixer(this.mesh);
        for (const [name, clip] of animations.clips) {
          const action = this.mixer.clipAction(clip);
          this.actions.set(name, action);
        }
        this.playAnimation("idle");
      }
    } else {
      // Fallback procedural mesh
      this.mesh = this.createFallbackMesh();
    }

    this.mesh.position.copy(this.position);
    this.pickPatrolTarget();
  }

  private applyTint(mat: THREE.MeshStandardMaterial): void {
    if (!mat.color) return;
    const name = mat.name?.toLowerCase() ?? "";
    if (name.includes("body") || name === "vanguardbodymat") {
      // Blend tint with original color instead of replacing
      const tint = new THREE.Color(this.tintColor);
      mat.color.lerp(tint, 0.6);
      mat.emissive.copy(tint);
      mat.emissiveIntensity = 0.15;
    }
  }

  private createFallbackMesh(): THREE.Group {
    const group = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.2, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: this.tintColor, roughness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    body.castShadow = true;
    group.add(body);
    this.raycastMeshes.push(body);

    const headGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffccaa });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.5;
    head.castShadow = true;
    group.add(head);
    this.raycastMeshes.push(head);

    return group;
  }

  private playAnimation(name: string): void {
    if (name === this.currentAnimName) return;
    const action = this.actions.get(name);
    if (!action) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(0.2);
    }
    action.reset().fadeIn(0.2).play();
    this.currentAction = action;
    this.currentAnimName = name;
  }

  private pickPatrolTarget(): void {
    this.patrolTarget.set(
      (Math.random() - 0.5) * 30,
      0,
      (Math.random() - 0.5) * 30
    );
  }

  update(dt: number, playerPos: THREE.Vector3, obstacles: THREE.Mesh[]): { fired: boolean; hitPlayer: boolean; damage: number } {
    let fired = false;
    let hitPlayer = false;
    let damage = 0;

    // Update animation mixer
    if (this.mixer) this.mixer.update(dt);

    if (this.state === "dead") {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return { fired, hitPlayer, damage };
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.position);
    toPlayer.y = 0;
    const distToPlayer = toPlayer.length();
    const canSeePlayer = distToPlayer < BOT_SIGHT_RANGE && this.hasLineOfSight(playerPos, obstacles);

    const prevState = this.state;
    if (canSeePlayer && distToPlayer < BOT_ATTACK_RANGE) {
      this.state = "attack";
    } else if (canSeePlayer) {
      this.state = "chase";
    } else {
      this.state = "patrol";
      this.reactTimer = 0;
    }

    if (this.state === "attack" && prevState !== "attack") {
      this.reactTimer = BOT_REACT_TIME;
    }
    if (this.reactTimer > 0) this.reactTimer -= dt;

    // Movement
    const speed = this.state === "patrol" ? BOT_SPEED_PATROL : BOT_SPEED_CHASE;
    let moveTarget: THREE.Vector3;

    if (this.state === "patrol") {
      moveTarget = this.patrolTarget;
      if (this.position.distanceTo(this.patrolTarget) < 2) this.pickPatrolTarget();
    } else {
      moveTarget = playerPos.clone();
      moveTarget.y = 0;
      if (this.state === "attack" && distToPlayer < 15) {
        const strafePhase = Date.now() * 0.002 + this.tintColor * 0.01;
        const strafeDir = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();
        moveTarget.add(strafeDir.multiplyScalar(Math.sin(strafePhase) * 6));
      }
      if (distToPlayer < 6) {
        const away = toPlayer.clone().normalize().multiplyScalar(-3);
        moveTarget.add(away);
      }
    }

    const moveDir = new THREE.Vector3().subVectors(moveTarget, this.position);
    moveDir.y = 0;
    if (moveDir.length() > 0.5) {
      moveDir.normalize();
      this.velocity.x += (moveDir.x * speed - this.velocity.x) * Math.min(1, dt * 5);
      this.velocity.z += (moveDir.z * speed - this.velocity.z) * Math.min(1, dt * 5);
    } else {
      this.velocity.x *= 0.85;
      this.velocity.z *= 0.85;
    }

    // Smooth rotation
    if (this.state !== "patrol" && distToPlayer > 0.1) {
      const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
      let diff = targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 6);
    } else if (Math.hypot(this.velocity.x, this.velocity.z) > 0.5) {
      this.yaw = Math.atan2(this.velocity.x, this.velocity.z);
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // Arena bounds
    const limit = 18.5;
    this.position.x = Math.max(-limit, Math.min(limit, this.position.x));
    this.position.z = Math.max(-limit, Math.min(limit, this.position.z));

    // Obstacle avoidance
    for (const obs of obstacles) {
      const box = new THREE.Box3().setFromObject(obs);
      box.expandByScalar(PLAYER_RADIUS + 0.2);
      if (box.containsPoint(this.position)) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        const push = new THREE.Vector3().subVectors(this.position, center);
        push.y = 0;
        if (push.length() > 0.01) {
          push.normalize().multiplyScalar(0.8);
          this.position.add(push);
        }
      }
    }

    this.position.y = 0;

    // Animation selection
    const horSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.state === "attack" && this.reactTimer <= 0) {
      this.playAnimation("fire");
    } else if (horSpeed > 4) {
      this.playAnimation("run");
    } else if (horSpeed > 1) {
      this.playAnimation("walk");
    } else if (this.state === "attack") {
      this.playAnimation("idleAim");
    } else {
      this.playAnimation("idle");
    }

    // Shooting
    if (this.state === "attack" && this.fireCooldown <= 0 && canSeePlayer && this.reactTimer <= 0) {
      fired = true;
      this.fireCooldown = 1 / BOT_FIRE_RATE;
      const distFactor = Math.max(0.1, 1 - (distToPlayer / BOT_SIGHT_RANGE));
      if (Math.random() < BOT_ACCURACY * distFactor) {
        hitPlayer = true;
        damage = BOT_DAMAGE;
      }
    }

    // Sync mesh
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;

    return { fired, hitPlayer, damage };
  }

  private hasLineOfSight(playerPos: THREE.Vector3, obstacles: THREE.Mesh[]): boolean {
    if (obstacles.length === 0) return true;
    const origin = this.position.clone();
    origin.y = 1.2;
    const target = playerPos.clone();
    target.y = 1.2;
    const dir = new THREE.Vector3().subVectors(target, origin);
    const dist = dir.length();
    dir.normalize();
    const ray = new THREE.Raycaster(origin, dir, 0, dist);
    return ray.intersectObjects(obstacles, false).length === 0;
  }

  takeDamage(amount: number): boolean {
    this.hp -= amount;
    // Flash emissive on all meshes
    this.mesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (mat.emissive) {
          mat.emissive.setHex(0xff0000);
          mat.emissiveIntensity = 0.8;
        }
      }
    });
    setTimeout(() => {
      if (this.state !== "dead") {
        this.mesh.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive) {
              mat.emissive.setHex(0x000000);
              mat.emissiveIntensity = 0;
            }
          }
        });
      }
    }, 120);

    if (this.hp <= 0) { this.die(); return true; }
    return false;
  }

  private die(): void {
    this.state = "dead";
    this.hp = 0;
    this.mesh.visible = false;
    this.respawnTimer = BOT_RESPAWN_TIME;
    this.playAnimation("hit");
  }

  private respawn(): void {
    this.state = "patrol";
    this.hp = BOT_MAX_HP;
    this.position.set((Math.random() - 0.5) * 28, 0, (Math.random() - 0.5) * 28);
    this.mesh.position.copy(this.position);
    this.mesh.visible = true;
    this.velocity.set(0, 0, 0);
    this.reactTimer = 0;
    this.pickPatrolTarget();
    this.playAnimation("idle");
    this.mesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (mat.emissive) {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
      }
    });
  }

  getMeshesForRaycast(): THREE.Object3D[] {
    return this.raycastMeshes.length > 0 ? this.raycastMeshes : [this.mesh];
  }
}
