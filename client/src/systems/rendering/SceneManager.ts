import * as THREE from "three";
import { registerObstacle } from "../movement/arenaCollision.js";

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly obstacles: THREE.Mesh[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x0a0a1a);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.scene.background = new THREE.Color(0x0a0a1a);
    this.scene.fog = new THREE.FogExp2(0x0a0a1a, 0.008);

    // Ambient
    const ambient = new THREE.AmbientLight(0x445577, 0.6);
    this.scene.add(ambient);

    // Hemisphere light for natural fill
    const hemi = new THREE.HemisphereLight(0x6688cc, 0x223344, 0.4);
    this.scene.add(hemi);

    // Main directional (sun-like)
    const dir = new THREE.DirectionalLight(0xffeedd, 1.2);
    dir.position.set(15, 30, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -25;
    dir.shadow.camera.right = 25;
    dir.shadow.camera.top = 25;
    dir.shadow.camera.bottom = -25;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 60;
    dir.shadow.bias = -0.001;
    this.scene.add(dir);

    // Fill light
    const fill = new THREE.DirectionalLight(0x4466aa, 0.3);
    fill.position.set(-10, 10, -10);
    this.scene.add(fill);

    // Build arena
    this.buildArena();
  }

  private buildArena(): void {
    // Floor: large grid-textured plane
    const floorGeo = new THREE.PlaneGeometry(44, 44);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.9,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Floor grid lines
    const gridHelper = new THREE.GridHelper(44, 22, 0x2a2a4a, 0x1e1e3a);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);

    // Arena walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a2a4e, roughness: 0.7 });
    const wallH = 6;
    const wallConfigs: [number, number, number, number, number, number][] = [
      [44, wallH, 0.5, 0, wallH / 2, 22],    // north
      [44, wallH, 0.5, 0, wallH / 2, -22],   // south
      [0.5, wallH, 44, 22, wallH / 2, 0],    // east
      [0.5, wallH, 44, -22, wallH / 2, 0],   // west
    ];
    for (const [w, h, d, x, y, z] of wallConfigs) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const wall = new THREE.Mesh(geo, wallMat);
      wall.position.set(x, y, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
    }

    // Obstacle material
    const obsMat = new THREE.MeshStandardMaterial({ color: 0x3a3a5e, roughness: 0.6 });
    const obsMatAccent = new THREE.MeshStandardMaterial({ color: 0x4a3a6e, roughness: 0.5 });
    const obsMatWarm = new THREE.MeshStandardMaterial({ color: 0x5a3a3e, roughness: 0.5 });

    // Center structure - cross-shaped cover
    this.addObstacle(new THREE.BoxGeometry(2, 3, 2), obsMat, 0, 1.5, 0);
    this.addObstacle(new THREE.BoxGeometry(6, 2, 1), obsMat, 0, 1, 0);
    this.addObstacle(new THREE.BoxGeometry(1, 2, 6), obsMat, 0, 1, 0);

    // Corner covers (4 L-shaped)
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      this.addObstacle(new THREE.BoxGeometry(3, 2.5, 1), obsMatAccent, sx * 12, 1.25, sz * 12);
      this.addObstacle(new THREE.BoxGeometry(1, 2.5, 3), obsMatAccent, sx * 13, 1.25, sz * 12);
    }

    // Mid cover boxes
    this.addObstacle(new THREE.BoxGeometry(4, 1.5, 1.5), obsMatWarm, 8, 0.75, 0);
    this.addObstacle(new THREE.BoxGeometry(4, 1.5, 1.5), obsMatWarm, -8, 0.75, 0);
    this.addObstacle(new THREE.BoxGeometry(1.5, 1.5, 4), obsMatWarm, 0, 0.75, 8);
    this.addObstacle(new THREE.BoxGeometry(1.5, 1.5, 4), obsMatWarm, 0, 0.75, -8);

    // Ramps
    for (const [x, z, ry] of [[15, 6, 0], [-15, -6, Math.PI], [6, -15, Math.PI / 2], [-6, 15, -Math.PI / 2]] as [number, number, number][]) {
      const rampGeo = new THREE.BoxGeometry(4, 0.3, 5);
      const ramp = new THREE.Mesh(rampGeo, obsMat);
      ramp.position.set(x, 0.8, z);
      ramp.rotation.set(0.3, ry, 0);
      ramp.castShadow = true;
      ramp.receiveShadow = true;
      this.scene.add(ramp);
    }

    // Elevated platforms
    for (const [x, z] of [[15, 15], [-15, -15]]) {
      const platGeo = new THREE.BoxGeometry(5, 0.4, 5);
      const plat = new THREE.Mesh(platGeo, obsMatAccent);
      plat.position.set(x, 1.6, z);
      plat.castShadow = true;
      plat.receiveShadow = true;
      this.scene.add(plat);
    }

    // Accent lights around arena
    const lightColors = [0xff4444, 0x44aaff, 0xff44ff, 0x44ffaa];
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const light = new THREE.PointLight(lightColors[i], 0.6, 20);
      light.position.set(Math.cos(angle) * 16, 3, Math.sin(angle) * 16);
      this.scene.add(light);

      // Light source visual
      const bulbGeo = new THREE.SphereGeometry(0.15, 8, 8);
      const bulbMat = new THREE.MeshBasicMaterial({ color: lightColors[i] });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.copy(light.position);
      this.scene.add(bulb);
    }

    // Ceiling lights
    for (const [x, z] of [[0, 0], [10, 10], [-10, -10], [10, -10], [-10, 10]]) {
      const light = new THREE.PointLight(0xffeedd, 0.4, 15);
      light.position.set(x, 5.5, z);
      this.scene.add(light);
    }
  }

  private addObstacle(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.obstacles.push(mesh);

    // Register collision AABB
    const params = (geo as THREE.BoxGeometry).parameters;
    if (params) {
      const hw = params.width / 2;
      const hh = params.height / 2;
      const hd = params.depth / 2;
      registerObstacle(x - hw, x + hw, z - hd, z + hd, y - hh, y + hh);
    }

    return mesh;
  }

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
  }

  getScene(): THREE.Scene {
    return this.scene;
  }
}
