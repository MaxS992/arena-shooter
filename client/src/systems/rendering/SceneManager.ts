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
    this.renderer.setClearColor(0x111122);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene.background = new THREE.Color(0x111122);
    // Light fog — just enough to fade distant walls, not hide bots
    this.scene.fog = new THREE.Fog(0x111122, 30, 55);

    // Strong ambient so nothing is pitch black
    const ambient = new THREE.AmbientLight(0x8899bb, 1.2);
    this.scene.add(ambient);

    // Hemisphere: bright sky, dim ground
    const hemi = new THREE.HemisphereLight(0xaaccff, 0x445566, 0.8);
    this.scene.add(hemi);

    // Main directional (sun-like)
    const dir = new THREE.DirectionalLight(0xfff0dd, 1.5);
    dir.position.set(12, 25, 8);
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

    // Fill light from opposite side
    const fill = new THREE.DirectionalLight(0x6688cc, 0.6);
    fill.position.set(-10, 15, -10);
    this.scene.add(fill);

    this.buildArena();
  }

  private buildArena(): void {
    // Floor with visible color
    const floorGeo = new THREE.PlaneGeometry(44, 44);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a40,
      roughness: 0.85,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Grid
    const gridHelper = new THREE.GridHelper(44, 22, 0x3a3a5a, 0x2e2e48);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);

    // Arena walls — taller, brighter
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a3a5e, roughness: 0.6 });
    const wallH = 6;
    const wallConfigs: [number, number, number, number, number, number][] = [
      [44, wallH, 0.5, 0, wallH / 2, 22],
      [44, wallH, 0.5, 0, wallH / 2, -22],
      [0.5, wallH, 44, 22, wallH / 2, 0],
      [0.5, wallH, 44, -22, wallH / 2, 0],
    ];
    for (const [w, h, d, x, y, z] of wallConfigs) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const wall = new THREE.Mesh(geo, wallMat);
      wall.position.set(x, y, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
    }

    // Obstacle materials — brighter, more visible
    const obsMat = new THREE.MeshStandardMaterial({ color: 0x4a4a6e, roughness: 0.5 });
    const obsMatAccent = new THREE.MeshStandardMaterial({ color: 0x5a4a7e, roughness: 0.4, metalness: 0.2 });
    const obsMatWarm = new THREE.MeshStandardMaterial({ color: 0x6a4a4e, roughness: 0.4 });

    // Center pillar
    this.addObstacle(new THREE.BoxGeometry(2, 3, 2), obsMat, 0, 1.5, 0);
    // Center cross walls
    this.addObstacle(new THREE.BoxGeometry(6, 2, 1), obsMat, 0, 1, 0);
    this.addObstacle(new THREE.BoxGeometry(1, 2, 6), obsMat, 0, 1, 0);

    // Corner covers (4 L-shapes)
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      this.addObstacle(new THREE.BoxGeometry(3, 2.5, 1), obsMatAccent, sx * 12, 1.25, sz * 12);
      this.addObstacle(new THREE.BoxGeometry(1, 2.5, 3), obsMatAccent, sx * 13, 1.25, sz * 12);
    }

    // Mid cover boxes — lower so you can shoot over them
    this.addObstacle(new THREE.BoxGeometry(4, 1.2, 1.2), obsMatWarm, 8, 0.6, 0);
    this.addObstacle(new THREE.BoxGeometry(4, 1.2, 1.2), obsMatWarm, -8, 0.6, 0);
    this.addObstacle(new THREE.BoxGeometry(1.2, 1.2, 4), obsMatWarm, 0, 0.6, 8);
    this.addObstacle(new THREE.BoxGeometry(1.2, 1.2, 4), obsMatWarm, 0, 0.6, -8);

    // Elevated platforms
    for (const [x, z] of [[15, 15], [-15, -15]]) {
      this.addObstacle(new THREE.BoxGeometry(5, 0.4, 5), obsMatAccent, x, 0.2, z);
    }

    // Accent lights — brighter
    const lightColors = [0xff4444, 0x4499ff, 0xff44ff, 0x44ffaa];
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const light = new THREE.PointLight(lightColors[i], 1.0, 25);
      light.position.set(Math.cos(angle) * 16, 3.5, Math.sin(angle) * 16);
      this.scene.add(light);

      const bulbGeo = new THREE.SphereGeometry(0.2, 8, 8);
      const bulbMat = new THREE.MeshBasicMaterial({ color: lightColors[i] });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.copy(light.position);
      this.scene.add(bulb);
    }

    // Ceiling lights — brighter
    for (const [x, z] of [[0, 0], [10, 10], [-10, -10], [10, -10], [-10, 10]]) {
      const light = new THREE.PointLight(0xffeedd, 0.8, 20);
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
