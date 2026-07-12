import * as THREE from "three";

export interface WeaponDef {
  name: string;
  damage: number;
  fireRate: number; // rounds per second
  maxAmmo: number;
  reloadTime: number; // seconds
  spread: number; // radians at hipfire
  recoilPitch: number; // radians per shot
  recoilRecovery: number; // radians/s recovery
  headshotMult: number;
  range: number;
  pellets: number; // >1 for shotgun
}

export const WEAPONS: Record<string, WeaponDef> = {
  rifle: {
    name: "Assault Rifle",
    damage: 18,
    fireRate: 10,
    maxAmmo: 30,
    reloadTime: 1.8,
    spread: 0.015,
    recoilPitch: 0.012,
    recoilRecovery: 3.0,
    headshotMult: 2.0,
    range: 200,
    pellets: 1,
  },
  shotgun: {
    name: "Shotgun",
    damage: 12,
    fireRate: 1.2,
    maxAmmo: 6,
    reloadTime: 2.5,
    spread: 0.08,
    recoilPitch: 0.04,
    recoilRecovery: 2.0,
    headshotMult: 1.5,
    range: 30,
    pellets: 8,
  },
  smg: {
    name: "SMG",
    damage: 12,
    fireRate: 16,
    maxAmmo: 25,
    reloadTime: 1.4,
    spread: 0.025,
    recoilPitch: 0.008,
    recoilRecovery: 4.0,
    headshotMult: 1.8,
    range: 80,
    pellets: 1,
  },
};

export class WeaponSystem {
  currentWeapon: WeaponDef;
  ammo: number;
  maxAmmo: number;
  reloading = false;
  reloadTimer = 0;
  fireCooldown = 0;
  recoilOffset = 0;
  private weapons: string[];
  private currentIndex = 0;

  constructor(startWeapon = "rifle") {
    this.weapons = Object.keys(WEAPONS);
    this.currentIndex = this.weapons.indexOf(startWeapon);
    if (this.currentIndex < 0) this.currentIndex = 0;
    this.currentWeapon = WEAPONS[this.weapons[this.currentIndex]];
    this.ammo = this.currentWeapon.maxAmmo;
    this.maxAmmo = this.currentWeapon.maxAmmo;
  }

  switchWeapon(direction: number): void {
    this.currentIndex = (this.currentIndex + direction + this.weapons.length) % this.weapons.length;
    this.currentWeapon = WEAPONS[this.weapons[this.currentIndex]];
    this.ammo = this.currentWeapon.maxAmmo;
    this.maxAmmo = this.currentWeapon.maxAmmo;
    this.reloading = false;
    this.reloadTimer = 0;
    this.fireCooldown = 0.3; // weapon switch delay
  }

  update(dt: number): void {
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.recoilOffset > 0) {
      this.recoilOffset = Math.max(0, this.recoilOffset - this.currentWeapon.recoilRecovery * dt);
    }
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.ammo = this.currentWeapon.maxAmmo;
        this.reloading = false;
      }
    }
  }

  canFire(): boolean {
    return !this.reloading && this.ammo > 0 && this.fireCooldown <= 0;
  }

  fire(): boolean {
    if (!this.canFire()) return false;
    this.ammo--;
    this.fireCooldown = 1 / this.currentWeapon.fireRate;
    this.recoilOffset = Math.min(this.recoilOffset + this.currentWeapon.recoilPitch, 0.15);
    if (this.ammo <= 0) this.startReload();
    return true;
  }

  startReload(): void {
    if (this.reloading || this.ammo === this.currentWeapon.maxAmmo) return;
    this.reloading = true;
    this.reloadTimer = this.currentWeapon.reloadTime;
  }

  getSpreadDirection(camera: THREE.Camera): THREE.Vector3 {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const spread = this.currentWeapon.spread;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    return dir;
  }

  hitscan(
    camera: THREE.Camera,
    targets: THREE.Object3D[],
    raycaster: THREE.Raycaster
  ): { target: THREE.Object3D; point: THREE.Vector3; distance: number }[] {
    const hits: { target: THREE.Object3D; point: THREE.Vector3; distance: number }[] = [];
    const origin = camera.position.clone();
    for (let i = 0; i < this.currentWeapon.pellets; i++) {
      const dir = this.getSpreadDirection(camera);
      raycaster.set(origin, dir);
      raycaster.far = this.currentWeapon.range;
      const intersects = raycaster.intersectObjects(targets, true);
      if (intersects.length > 0) {
        let rootTarget = intersects[0].object;
        while (rootTarget.parent && !targets.includes(rootTarget)) {
          rootTarget = rootTarget.parent;
        }
        hits.push({
          target: rootTarget,
          point: intersects[0].point.clone(),
          distance: intersects[0].distance,
        });
      }
    }
    return hits;
  }
}
