// public/ai-generator-utils.js
// Contains the core physics simulation and map parsing logic.
// FIX:
// 1. Corrected `parseReferenceMap` to use `mapSize` directly as the
//    spawnRadius, based on the provided State file [cite: 1-2, 1-3, 1-4].

import { getSpawnDiameter as getSpawnDiameterInternal, distance } from "./utils-client.js";

// ----------------------------------------------------------------
// --- PHYSICS CONSTANTS (DERIVED FROM YOUR DATA) ---
// ----------------------------------------------------------------
export const PHYSICS_SETTINGS = {
  TIME_STEP: 1 / 30,

  // Baseline defaults. The auto-tuner will find the precise values.
  FORCE_SCALE: 8.997,
  JUMP_SCALE: 0.28067564102564097,
  DRAG_FACTOR: -0.01,

  // These are the confirmed in-game force values
  GRAVITY_FORCE: 20,
  MOVE_FORCE: 12,
  UP_FORCE: -12, 
  DOWN_FORCE: 12,
  JUMP_IMPULSE: -312,

  BOUNCE_FACTOR: 0.0,
};

// ----------------------------------------------------------------
// --- PHYSICS PLAYER CLASS (REVISED) ---
// ----------------------------------------------------------------

export class PhysicsPlayer {
  constructor(x, y, radius) {
    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.accel = { x: 0, y: 0 };
    this.radius = radius; // This will now be 9
    this.isGrounded = true;
    this.wasGrounded = true; 
    this.justJumped = false;
  }

  update(input, map) {
    const { TIME_STEP } = PHYSICS_SETTINGS;

    this.isGrounded = false;
    this.applyInput(input); // Get acceleration (which now includes drag)

    // Handle Jump Impulse
    if (!input.up) {
      this.justJumped = false;
    }
    if (input.up && this.wasGrounded && !this.justJumped) {
      this.vel.y = PHYSICS_SETTINGS.JUMP_IMPULSE * PHYSICS_SETTINGS.JUMP_SCALE;
      this.wasGrounded = false;
      this.justJumped = true;
    }

    // Update velocity
    this.vel.x += this.accel.x * TIME_STEP;
    this.vel.y += this.accel.y * TIME_STEP;

    // Update position
    this.pos.x += this.vel.x * TIME_STEP;
    this.pos.y += this.vel.y * TIME_STEP;

    const collisionResult = this.handleCollisions(map);
    this.wasGrounded = this.isGrounded;
    return collisionResult;
  }

  applyInput(input) {
    const { FORCE_SCALE, GRAVITY_FORCE, MOVE_FORCE, UP_FORCE, DOWN_FORCE, DRAG_FACTOR } = PHYSICS_SETTINGS;

    this.accel = { x: 0, y: 0 };

    // --- Vertical Acceleration ---
    this.accel.y = GRAVITY_FORCE * FORCE_SCALE; // Gravity
    if (input.up && !this.wasGrounded) {
      this.accel.y += UP_FORCE * FORCE_SCALE;
    }
    if (input.down) {
      this.accel.y += DOWN_FORCE * FORCE_SCALE;
    }
    // Apply vertical drag
    this.accel.y += (this.vel.y * DRAG_FACTOR);


    // --- Horizontal Acceleration ---
    if (input.left) {
      this.accel.x = -MOVE_FORCE * FORCE_SCALE;
    } else if (input.right) {
      this.accel.x = MOVE_FORCE * FORCE_SCALE;
    }
    // Apply horizontal drag
    this.accel.x += (this.vel.x * DRAG_FACTOR);
  }

  handleCollisions(map) {
    for (const obj of map.objects) {
      if (obj.type === "line") {
        const { start, end, isDeath } = obj;
        const collisionInfo = this.checkLineCollision(start, end, this.pos, this.radius);

        if (collisionInfo.collided) {
          if (isDeath) {
            return "DIED";
          }

          this.pos.x += collisionInfo.normal.x * collisionInfo.penetration;
          this.pos.y += collisionInfo.normal.y * collisionInfo.penetration;

          const dot = this.vel.x * collisionInfo.normal.x + this.vel.y * collisionInfo.normal.y;

          if (dot < 0) {
            const v_normal_x = dot * collisionInfo.normal.x;
            const v_normal_y = dot * collisionInfo.normal.y;
            const v_tangential_x = this.vel.x - v_normal_x;
            const v_tangential_y = this.vel.y - v_normal_y;

            if (collisionInfo.normal.y < -0.5) { // Floor
              this.isGrounded = true;
              this.vel.x = v_tangential_x;
              this.vel.y = v_tangential_y;
            } else { // Wall
              this.vel.x = v_tangential_x;
              this.vel.y = v_tangential_y;
            }

            this.vel.x -= (v_normal_x * PHYSICS_SETTINGS.BOUNCE_FACTOR);
            this.vel.y -= (v_normal_y * PHYSICS_SETTINGS.BOUNCE_FACTOR);
          }
        }
      }
    }
    return null; // Not dead
  }

  checkLineCollision(p1, p2, circlePos, circleRadius) {
    const { dist, closestPoint } = getClosestPointOnLineSegment(p1, p2, circlePos);

    if (dist <= circleRadius) { 
      const penetration = circleRadius - dist;
      const normal = dist < 1e-6
        ? { x: 0, y: -1 } 
        : {
            x: (circlePos.x - closestPoint.x) / dist,
            y: (circlePos.y - closestPoint.y) / dist,
          };
      return { collided: true, penetration, normal, closestPoint };
    }
    return { collided: false };
  }
} // --- END OF PhysicsPlayer CLASS ---


// ----------------------------------------------------------------
// --- (The rest of the file is unchanged) ---
// ----------------------------------------------------------------

export class PhysicsMap {
  constructor(objects, spawn) {
    this.objects = objects;
    this.spawn = spawn;
  }
}

export function parseReferenceMap(mapJSON, canvasWidth, canvasHeight) {
  const data = JSON.parse(mapJSON);
  const GW = canvasWidth;
  const GH = canvasHeight;
  const mapSize = data.mapSize || 9;

  // FIX: The mapSize *is* the radius.
  // The provided State object  confirms
  // mapSize: 9  and diameter: 18 .
  // Removed call to getSpawnDiameterInternal.
  const spawnRadius = mapSize;

  const externalSpawn = {
    x: data.spawn.spawnX + 935,
    y: data.spawn.spawnY + 353, // Corrected from 350
  };
  const canvasSpawn = externalToGame(externalSpawn.x, externalSpawn.y, GW, GH);
  canvasSpawn.radius = spawnRadius; // This will now be 9

  const physicsObjects = [];
  for (const obj of data.objects) {
    if (obj.type === "line") {
      const aExtRad = (obj.angle * Math.PI) / 180;
      const halfLen = obj.width / 2;
      const extStart = {
        x: obj.x - Math.cos(aExtRad) * halfLen,
        y: obj.y - Math.sin(aExtRad) * halfLen,
      };
      const extEnd = {
        x: obj.x + Math.cos(aExtRad) * halfLen,
        y: obj.y + Math.sin(aExtRad) * halfLen,
      };
      physicsObjects.push({
        type: "line",
        start: externalToGame(extStart.x, extStart.y, GW, GH),
        end: externalToGame(extEnd.x, extEnd.y, GW, GH),
        isDeath: obj.isDeath || false,
        isBouncy: obj.isBouncy || false,
      });
    }
  }
  return new PhysicsMap(physicsObjects, canvasSpawn);
}

function externalToGame(extX, extY, GW, GH) {
  const EW = 730;
  const EH = 500;
  const offsetX = 935;
  const offsetY = 350;
  const scaledX = extX - offsetX + EW / 2;
  const scaledY = extY - offsetY + EH / 2;
  const normX = scaledX / EW;
  const normY = scaledY / EH;
  const gameX = normX * GW;
  const gameY = normY * GH;
  return { x: gameX, y: gameY };
}

function getClosestPointOnLineSegment(p1, p2, p) {
  const l2 = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
  if (l2 === 0) return { dist: distance(p, p1), closestPoint: { ...p1 } };
  let t = ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const closestPoint = {
    x: p1.x + t * (p2.x - p1.x),
    y: p1.y + t * (p2.y - p1.y),
  };
  return { dist: distance(p, closestPoint), closestPoint };
}

function getDistanceToLineSegment(p, v, w) {
    const { dist } = getClosestPointOnLineSegment(v, w, p);
    return dist;
}