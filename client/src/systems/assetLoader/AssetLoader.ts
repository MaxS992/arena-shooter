import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const gltfLoader = new GLTFLoader();

export async function loadGLB(url: string): Promise<THREE.Group> {
  const gltf = await gltfLoader.loadAsync(url);
  return gltf.scene;
}

export function createPlaceholderMesh(): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.5, 1.8, 0.5);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8888ff });
  return new THREE.Mesh(geo, mat);
}

export async function loadPlayerModel(url: string): Promise<THREE.Object3D> {
  if (!url.trim()) return createPlaceholderMesh();
  try {
    return await loadGLB(url);
  } catch {
    return createPlaceholderMesh();
  }
}

export interface DummyLoadResult {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

export async function loadDummyModel(url: string): Promise<DummyLoadResult> {
  if (!url.trim()) return { scene: createPlaceholderMesh(), animations: [] };
  try {
    const gltf = await gltfLoader.loadAsync(url);
    return { scene: gltf.scene, animations: gltf.animations ?? [] };
  } catch {
    return { scene: createPlaceholderMesh(), animations: [] };
  }
}

/** Load a single animation clip from a separate GLB file */
export async function loadAnimationClip(url: string): Promise<THREE.AnimationClip | null> {
  try {
    const gltf = await gltfLoader.loadAsync(url);
    return gltf.animations?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Animation clip names mapped to file paths */
export const ANIMATION_FILES: Record<string, string> = {
  idle: "/models/animations/rifleidle.glb",
  idleAim: "/models/animations/rilfeaimidle.glb",
  walk: "/models/animations/walking.glb",
  walkBack: "/models/animations/walkingBackwards.glb",
  run: "/models/animations/runForward.glb",
  runBack: "/models/animations/runBackwards.glb",
  strafeLeft: "/models/animations/strafeLeft.glb",
  strafeRight: "/models/animations/straferight.glb",
  jump: "/models/animations/jumprifle.glb",
  fire: "/models/animations/firingrifle.glb",
  reload: "/models/animations/reloading.glb",
  hit: "/models/animations/hitreaction.glb",
};

export interface AnimationSet {
  clips: Map<string, THREE.AnimationClip>;
}

/** Load all animation clips */
export async function loadAnimations(): Promise<AnimationSet> {
  const clips = new Map<string, THREE.AnimationClip>();
  const entries = Object.entries(ANIMATION_FILES);
  const results = await Promise.allSettled(
    entries.map(([, url]) => loadAnimationClip(url))
  );
  for (let i = 0; i < entries.length; i++) {
    const [name] = entries[i];
    const result = results[i];
    if (result.status === "fulfilled" && result.value) {
      result.value.name = name;
      clips.set(name, result.value);
    }
  }
  return { clips };
}
