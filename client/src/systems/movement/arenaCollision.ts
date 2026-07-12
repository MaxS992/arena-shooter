/**
 * Arena collision: outer walls + dynamic obstacle AABBs.
 * 1 unit = 1 m. Player radius from shared PLAYER_RADIUS.
 */

const HALF = 22;
const WALL_HALF_THICK = 0.25;
const MARGIN = 0.001;

/** Walls: [xMin, xMax, zMin, zMax] in world. */
const WALLS: [number, number, number, number][] = [
  [ -HALF, HALF,  HALF - WALL_HALF_THICK,  HALF + WALL_HALF_THICK ],
  [ -HALF, HALF, -HALF - WALL_HALF_THICK, -HALF + WALL_HALF_THICK ],
  [  HALF - WALL_HALF_THICK,  HALF + WALL_HALF_THICK, -HALF, HALF ],
  [ -HALF - WALL_HALF_THICK, -HALF + WALL_HALF_THICK, -HALF, HALF ],
];

/** Obstacle AABBs added at runtime from SceneManager. */
const OBSTACLE_AABBS: { xMin: number; xMax: number; zMin: number; zMax: number; yMin: number; yMax: number }[] = [];

/** Register an obstacle box for collision. Call from SceneManager after building arena. */
export function registerObstacle(xMin: number, xMax: number, zMin: number, zMax: number, yMin: number, yMax: number): void {
  OBSTACLE_AABBS.push({ xMin, xMax, zMin, zMax, yMin, yMax });
}

/** Clear all registered obstacles (for map reload). */
export function clearObstacles(): void {
  OBSTACLE_AABBS.length = 0;
}

export interface ArenaWallResult {
  x: number;
  z: number;
  normalX?: number;
  normalZ?: number;
}

export function resolveArenaWalls(px: number, pz: number, radius: number): ArenaWallResult {
  let x = px;
  let z = pz;
  let normalX: number | undefined;
  let normalZ: number | undefined;
  const r = radius + MARGIN;

  // Outer walls
  for (const [xMin, xMax, zMin, zMax] of WALLS) {
    if (x >= xMin - r && x <= xMax + r && z >= zMin - r && z <= zMax + r) {
      if (x < xMin + r) { x = xMin - r; normalX = 1; }
      else if (x > xMax - r) { x = xMax + r; normalX = -1; }
      if (z < zMin + r) { z = zMin - r; normalZ = 1; }
      else if (z > zMax - r) { z = zMax + r; normalZ = -1; }
    }
  }

  return { x, z, normalX, normalZ };
}

/** Resolve collision against obstacle boxes. Run multiple passes for stability. */
export function resolveObstacles(
  px: number, py: number, pz: number, radius: number, playerHeight: number
): { x: number; y: number; z: number; groundY: number; normalX?: number; normalZ?: number } {
  let x = px;
  let y = py;
  let z = pz;
  let groundY = 0;
  let normalX: number | undefined;
  let normalZ: number | undefined;
  const r = radius + MARGIN;

  // Multiple passes to handle being pushed from one obstacle into another
  for (let pass = 0; pass < 3; pass++) {
    let anyCollision = false;

    for (const obs of OBSTACLE_AABBS) {
      // Player feet = y, head = y + playerHeight
      const feetY = y;

      // On top of obstacle? (feet above or near top surface)
      if (feetY >= obs.yMax - 0.1) {
        // Ground support check: player center must be within XZ bounds
        if (x > obs.xMin + 0.05 && x < obs.xMax - 0.05 && z > obs.zMin + 0.05 && z < obs.zMax - 0.05) {
          groundY = Math.max(groundY, obs.yMax);
        }
        continue;
      }

      // Skip if no Y overlap (player is fully above or below)
      if (feetY >= obs.yMax || feetY + playerHeight <= obs.yMin) continue;

      // Check XZ overlap (expanded by player radius)
      if (x >= obs.xMax + r || x <= obs.xMin - r) continue;
      if (z >= obs.zMax + r || z <= obs.zMin - r) continue;

      // We have a collision — push out along shortest axis
      const pushLeft = x - (obs.xMin - r);   // how deep from left side
      const pushRight = (obs.xMax + r) - x;  // how deep from right side
      const pushBack = z - (obs.zMin - r);
      const pushFront = (obs.zMax + r) - z;

      // All should be positive if we're inside
      if (pushLeft <= 0 || pushRight <= 0 || pushBack <= 0 || pushFront <= 0) continue;

      const min = Math.min(pushLeft, pushRight, pushBack, pushFront);

      if (min === pushLeft) {
        x = obs.xMin - r;
        normalX = -1;
      } else if (min === pushRight) {
        x = obs.xMax + r;
        normalX = 1;
      } else if (min === pushBack) {
        z = obs.zMin - r;
        normalZ = -1;
      } else {
        z = obs.zMax + r;
        normalZ = 1;
      }

      anyCollision = true;
    }

    if (!anyCollision) break;
  }

  return { x, y, z, groundY, normalX, normalZ };
}

/** Remove velocity component into the wall so player can slide off. */
export function applyWallVelocitySlide(
  velocity: { x: number; z: number },
  result: { normalX?: number; normalZ?: number }
): void {
  if (result.normalX !== undefined && result.normalX !== 0) {
    if ((result.normalX > 0 && velocity.x < 0) || (result.normalX < 0 && velocity.x > 0)) {
      velocity.x = 0;
    }
  }
  if (result.normalZ !== undefined && result.normalZ !== 0) {
    if ((result.normalZ > 0 && velocity.z < 0) || (result.normalZ < 0 && velocity.z > 0)) {
      velocity.z = 0;
    }
  }
}
