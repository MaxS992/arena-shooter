import * as THREE from "three";

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface DamageNumber {
  element: HTMLDivElement;
  life: number;
  x: number;
  y: number;
  vy: number;
}

interface HitMarker {
  time: number;
  kill: boolean;
}

export class EffectsSystem {
  private scene: THREE.Scene;
  private particles: Particle[] = [];
  private damageNumbers: DamageNumber[] = [];
  private container: HTMLElement;
  hitMarker: HitMarker | null = null;
  private damageFlashAlpha = 0;
  private flashOverlay: HTMLDivElement;
  private muzzleFlashLight: THREE.PointLight;
  private muzzleFlashTimer = 0;

  constructor(scene: THREE.Scene, container: HTMLElement) {
    this.scene = scene;
    this.container = container;

    // Damage flash overlay
    this.flashOverlay = document.createElement("div");
    this.flashOverlay.id = "damage-flash";
    this.flashOverlay.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 100;
      background: radial-gradient(ellipse at center, transparent 40%, rgba(255,0,0,0.6) 100%);
      opacity: 0; transition: opacity 0.05s;
    `;
    container.appendChild(this.flashOverlay);

    // Muzzle flash light
    this.muzzleFlashLight = new THREE.PointLight(0xffaa44, 0, 8);
    scene.add(this.muzzleFlashLight);
  }

  update(dt: number, _camera: THREE.Camera): void {
    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
      p.velocity.y -= 15 * dt;
      const alpha = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = alpha;
      const s = 0.5 + (1 - alpha) * 0.5;
      p.mesh.scale.setScalar(s);
    }

    // Damage numbers
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const d = this.damageNumbers[i];
      d.life -= dt;
      if (d.life <= 0) {
        d.element.remove();
        this.damageNumbers.splice(i, 1);
        continue;
      }
      d.y += d.vy * dt;
      d.vy -= 80 * dt;
      d.element.style.left = `${d.x}px`;
      d.element.style.top = `${d.y}px`;
      d.element.style.opacity = `${Math.min(1, d.life * 2)}`;
    }

    // Damage flash
    if (this.damageFlashAlpha > 0) {
      this.damageFlashAlpha = Math.max(0, this.damageFlashAlpha - dt * 3);
      this.flashOverlay.style.opacity = `${this.damageFlashAlpha}`;
    }

    // Hit marker fade
    if (this.hitMarker && Date.now() - this.hitMarker.time > 200) {
      this.hitMarker = null;
    }

    // Muzzle flash
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      this.muzzleFlashLight.intensity = this.muzzleFlashTimer > 0 ? 3 : 0;
    }
  }

  spawnMuzzleFlash(camera: THREE.Camera): void {
    const pos = camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    pos.add(dir.multiplyScalar(1.5));
    pos.y -= 0.2;
    this.muzzleFlashLight.position.copy(pos);
    this.muzzleFlashLight.intensity = 4;
    this.muzzleFlashTimer = 0.05;
  }

  spawnHitParticles(point: THREE.Vector3, color = 0xff4444): void {
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.SphereGeometry(0.04, 4, 4);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(point);
      this.scene.add(mesh);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 4 + 2,
        (Math.random() - 0.5) * 6
      );
      const life = 0.3 + Math.random() * 0.3;
      this.particles.push({ mesh, velocity: vel, life, maxLife: life });
    }
  }

  spawnWallHitParticles(point: THREE.Vector3): void {
    this.spawnHitParticles(point, 0xffcc66);
  }

  showHitMarker(kill = false): void {
    this.hitMarker = { time: Date.now(), kill };
  }

  showDamageNumber(damage: number, screenX: number, screenY: number, isHeadshot = false): void {
    const el = document.createElement("div");
    el.textContent = `${damage}`;
    el.style.cssText = `
      position: fixed; pointer-events: none; z-index: 200;
      font-family: 'Arial Black', sans-serif; font-weight: 900;
      font-size: ${isHeadshot ? "28px" : "20px"};
      color: ${isHeadshot ? "#ffdd00" : "#ffffff"};
      text-shadow: 0 0 4px rgba(0,0,0,0.8), 0 0 8px ${isHeadshot ? "rgba(255,200,0,0.5)" : "rgba(255,0,0,0.3)"};
      left: ${screenX}px; top: ${screenY}px;
      transform: translate(-50%, -50%);
    `;
    this.container.appendChild(el);
    this.damageNumbers.push({
      element: el,
      life: 0.8,
      x: screenX + (Math.random() - 0.5) * 30,
      y: screenY,
      vy: -60,
    });
  }

  triggerDamageFlash(intensity = 0.6): void {
    this.damageFlashAlpha = Math.min(1, this.damageFlashAlpha + intensity);
    this.flashOverlay.style.opacity = `${this.damageFlashAlpha}`;
  }
}
