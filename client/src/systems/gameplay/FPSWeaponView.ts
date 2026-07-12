import * as THREE from "three";

export class FPSWeaponView {
  readonly group: THREE.Group;
  private muzzleFlash: THREE.Mesh;
  private muzzleLight: THREE.PointLight;
  private kickOffset = 0;
  private kickRecovery = 12;
  private bobPhase = 0;
  private bobAmount = 0;
  private targetBob = 0;
  private swayX = 0;
  private swayY = 0;
  private currentWeaponType = "rifle";

  // Base position (right side, lower — visible in FPS view)
  private basePos = new THREE.Vector3(0.25, -0.18, -0.4);

  constructor() {
    this.group = new THREE.Group();
    this.buildWeapon();

    // Muzzle flash
    const flashGeo = new THREE.SphereGeometry(0.04, 6, 6);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.position.set(0, 0.05, -0.85);
    this.group.add(this.muzzleFlash);

    this.muzzleLight = new THREE.PointLight(0xffaa22, 0, 3);
    this.muzzleLight.position.copy(this.muzzleFlash.position);
    this.group.add(this.muzzleLight);
  }

  private buildWeapon(): void {
    // Clear existing
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
    }

    const gunMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.3, metalness: 0.8 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.6 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

    const s = 1.8; // scale up for visibility

    // Receiver / main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, 0.06 * s, 0.38 * s), gunMat);
    this.group.add(body);

    // Barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015 * s, 0.018 * s, 0.3 * s, 8),
      accentMat
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025 * s, -0.32 * s);
    this.group.add(barrel);

    // Barrel shroud / handguard
    const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.042 * s, 0.045 * s, 0.22 * s), accentMat);
    shroud.position.set(0, 0.012 * s, -0.22 * s);
    this.group.add(shroud);

    // Magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.032 * s, 0.12 * s, 0.055 * s), gripMat);
    mag.position.set(0, -0.09 * s, 0.02 * s);
    this.group.add(mag);

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032 * s, 0.09 * s, 0.04 * s), gripMat);
    grip.position.set(0, -0.08 * s, 0.1 * s);
    grip.rotation.x = 0.25;
    this.group.add(grip);

    // Stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, 0.055 * s, 0.14 * s), accentMat);
    stock.position.set(0, -0.01 * s, 0.24 * s);
    this.group.add(stock);

    // Sight rail
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.028 * s, 0.018 * s, 0.18 * s), accentMat);
    rail.position.set(0, 0.05 * s, -0.05 * s);
    this.group.add(rail);

    // Front sight
    const fSight = new THREE.Mesh(new THREE.BoxGeometry(0.01 * s, 0.025 * s, 0.01 * s), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    fSight.position.set(0, 0.07 * s, -0.18 * s);
    this.group.add(fSight);

    // Rear sight
    const rSight = new THREE.Mesh(new THREE.BoxGeometry(0.028 * s, 0.022 * s, 0.01 * s), accentMat);
    rSight.position.set(0, 0.06 * s, 0.04 * s);
    this.group.add(rSight);

    // Hand (simplified)
    const handMat = new THREE.MeshStandardMaterial({ color: 0xddaa77, roughness: 0.7 });
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.05 * s, 0.09 * s), handMat);
    hand.position.set(0, -0.05 * s, 0.1 * s);
    this.group.add(hand);

    // Forward hand
    const fHand = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.04 * s, 0.07 * s), handMat);
    fHand.position.set(0, -0.025 * s, -0.12 * s);
    this.group.add(fHand);

    // Re-add muzzle flash & light
    if (this.muzzleFlash) {
      this.group.add(this.muzzleFlash);
      this.group.add(this.muzzleLight);
    }
  }

  attachToCamera(camera: THREE.Camera): void {
    camera.add(this.group);
    this.group.position.copy(this.basePos);
  }

  fire(): void {
    this.kickOffset = 0.06;
    // Muzzle flash
    (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 1;
    this.muzzleLight.intensity = 5;
    this.muzzleFlash.scale.setScalar(1 + Math.random() * 0.5);
    this.muzzleFlash.rotation.z = Math.random() * Math.PI;
  }

  update(dt: number, isMoving: boolean, isSprinting: boolean, _isCrouching: boolean): void {
    // Kick recovery
    if (this.kickOffset > 0) {
      this.kickOffset = Math.max(0, this.kickOffset - this.kickRecovery * dt);
    }

    // Muzzle flash fade
    const flashMat = this.muzzleFlash.material as THREE.MeshBasicMaterial;
    if (flashMat.opacity > 0) {
      flashMat.opacity = Math.max(0, flashMat.opacity - dt * 25);
      this.muzzleLight.intensity = flashMat.opacity * 5;
    }

    // Walk bob
    this.targetBob = isMoving ? (isSprinting ? 0.012 : 0.006) : 0;
    this.bobAmount += (this.targetBob - this.bobAmount) * Math.min(1, dt * 8);
    if (isMoving) {
      this.bobPhase += dt * (isSprinting ? 14 : 10);
    } else {
      // Idle sway
      this.bobPhase += dt * 2;
    }

    const bobY = Math.sin(this.bobPhase) * this.bobAmount;
    const bobX = Math.cos(this.bobPhase * 0.5) * this.bobAmount * 0.5;

    // Smooth sway
    this.swayX += (bobX - this.swayX) * Math.min(1, dt * 15);
    this.swayY += (bobY - this.swayY) * Math.min(1, dt * 15);

    // Apply transforms
    this.group.position.set(
      this.basePos.x + this.swayX,
      this.basePos.y + this.swayY,
      this.basePos.z + this.kickOffset
    );

    // Slight rotation on kick
    this.group.rotation.x = -this.kickOffset * 2;
  }

  setWeaponType(type: string): void {
    if (type === this.currentWeaponType) return;
    this.currentWeaponType = type;
    // Could swap model here - for now just rebuild
    this.buildWeapon();
  }
}
