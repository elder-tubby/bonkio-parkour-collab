// public/ai-generator-utils.js
// Contains the core physics simulation and map parsing logic.

import { distance } from "./utils-client.js";

// ----------------------------------------------------------------
// --- PHYSICS CONSTANTS ---
// ----------------------------------------------------------------
export const PHYSICS_SETTINGS = {
  TIME_STEP: 1 / 30,
  DRAG_FACTOR: -0.015,
  GRAVITY_FORCE: 20,
  MOVE_ACCEL_FORCE: 12,
  JUMP_FORCE: -10, // -10 wworks
  BOUNCE_FACTOR: 0.0,
  // MASS: player.diameter,
  // Ball can only jump if ground normal.y is <= this value
  // cos(29.5 degrees) = 0.8703
  MAX_JUMP_SLOPE_NORMAL: -0.8703,
  // Ball is considered "grounded" if normal.y is <= this value
  // cos(60 degrees) = 0.5
  MAX_GROUND_SLOPE_NORMAL: -0.5,
  JUMP_VELOCITY_TOLERANCE: 30, // must have |vel.y| <= this to be allowed to jump

};

// ----------------------------------------------------------------
// --- GEOMETRY HELPERS ---
// ----------------------------------------------------------------

/**
 * Rotates a 2D point around the origin (0,0).
 */
function rotatePoint(pt, angleDeg) {
  const r = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: pt.x * cos - pt.y * sin, y: pt.x * sin + pt.y * cos };
}

/**
 * Calculates the absolute-coordinate vertices of a state object.
 */
function getAbsoluteVertices(obj) {
  const a = obj.a || 0;
  const s = obj.scale || 1;
  const c = obj.c || { x: 0, y: 0 };
  const v = obj.v || [];

  return v.map((lv) => {
    const scaled = { x: lv.x * s, y: lv.y * s };
    const rotated = rotatePoint(scaled, a);
    return { x: c.x + rotated.x, y: c.y + rotated.y };
  });
}

/**
 * Parses the real-time objects from State into a simple list for the physics engine.
 * Polygons are broken down into their constituent lines.
 * @param {Array<Object>} stateObjects - The array from `State.get("objects")`
 * @returns {Array<Object>} A list of objects for `PhysicsMap`
 */
export function parseStateObjects(stateObjects) {
  const physicsObjects = [];
  if (!Array.isArray(stateObjects)) return [];

  for (const obj of stateObjects) {
    if (obj.noPhysics) continue;

    if (obj.type === "line") {
      // Logic for lines
      const { start, end, height } = obj;
      if (!start || !end) continue;
      physicsObjects.push({
        type: "line",
        start: obj.start,
        end: obj.end,
        height: height || 4,
        isDeath: obj.lineType === "death",
      });
    } else if (obj.type === "circle") {
      // Logic for circles
      const { c, radius } = obj;
      if (!c || !radius) continue;
      physicsObjects.push({
        type: "circle",
        c: obj.c,
        radius: obj.radius,
        isDeath: obj.circleType === "death",
      });
    } else if (obj.type === "poly") {
      // Logic for polygons: break into lines
      const absVerts = getAbsoluteVertices(obj);
      if (absVerts.length < 2) continue;
      const isDeath = obj.polyType === "death";

      for (let i = 0; i < absVerts.length; i++) {
        const p1 = absVerts[i];
        const p2 = absVerts[(i + 1) % absVerts.length]; // Wrap around
        physicsObjects.push({
          type: "line",
          start: p1,
          end: p2,
          height: 4, // Polygons are treated as thin lines
          isDeath: isDeath,
        });
      }
    }
  }
  return physicsObjects;
}

// ----------------------------------------------------------------
// --- PHYSICS PLAYER CLASS (REVISED) ---
// ----------------------------------------------------------------

export class PhysicsPlayer {
  constructor(x, y, radius) {
    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.accel = { x: 0, y: 0 };
    this.radius = radius;
    this.mass = 0.111234705; // User-defined value
    // this.mass = radius * 2
  
    this.isGrounded = true;
    this.wasGrounded = true;
    this.canJump = true;
  }

  /**
   * Resets the player's state to the spawn position.
   */
  respawn(spawnPos) {
    this.pos.x = spawnPos.x;
    this.pos.y = spawnPos.y;
    this.vel.x = 0;
    this.vel.y = 0;
    this.accel.x = 0;
    this.accel.y = 0;
    this.isGrounded = true;
    this.wasGrounded = true;
    this.canJump = true;
  }

  update(input, map) {
    const { TIME_STEP, JUMP_FORCE, JUMP_VELOCITY_TOLERANCE } = PHYSICS_SETTINGS;

    // Reset per-frame state
    this.isGrounded = false;
    this.canJump = false;

    this.applyInput(input);

    // Update velocity
    this.vel.x += this.accel.x * TIME_STEP;
    this.vel.y += this.accel.y * TIME_STEP;

    // Update position
    this.pos.x += this.vel.x * TIME_STEP;
    this.pos.y += this.vel.y * TIME_STEP;

    // Handle collisions (sets isGrounded / canJump)
    const collisionResult = this.handleCollisions(map);

    // --- Handle Jump Impulse (AFTER collisions) ---
    const isVelWithinJumpRange =
      this.vel.y >= -JUMP_VELOCITY_TOLERANCE &&
      this.vel.y <= JUMP_VELOCITY_TOLERANCE;

    if (input.up && this.isGrounded && this.canJump && isVelWithinJumpRange) {
      this.vel.y += JUMP_FORCE / this.mass;
      this.isGrounded = false;
      this.canJump = false;
    }

    this.wasGrounded = this.isGrounded;
    return collisionResult;
  }

  
  applyInput(input) {
    const { GRAVITY_FORCE, MOVE_ACCEL_FORCE, DRAG_FACTOR } = PHYSICS_SETTINGS;

    this.accel = { x: 0, y: 0 };

    // --- Vertical Acceleration (a = F / m) ---
    this.accel.y = GRAVITY_FORCE / this.mass; // Gravity
    if (input.up && !this.wasGrounded) {
      this.accel.y += -MOVE_ACCEL_FORCE / this.mass; // Up force
    }
    if (input.down) {
      this.accel.y += MOVE_ACCEL_FORCE / this.mass; // Down force
    }
    this.accel.y += this.vel.y * DRAG_FACTOR;

    // --- Horizontal Acceleration (a = F / m) ---
    if (input.left) {
      this.accel.x = -MOVE_ACCEL_FORCE / this.mass;
    } else if (input.right) {
      this.accel.x = MOVE_ACCEL_FORCE / this.mass;
    }
    this.accel.x += this.vel.x * DRAG_FACTOR;
  }

  handleCollisions(map) {
    for (const obj of map.objects) {
      let collisionInfo = { collided: false };

      if (obj.type === "line") {
        collisionInfo = this.checkLineCollision(
          obj.start,
          obj.end,
          this.pos,
          this.radius,
          obj.height,
        );
      } else if (obj.type === "circle") {
        collisionInfo = this.checkCircleCollision(
          obj.c,
          obj.radius,
          this.pos,
          this.radius,
        );
      }

      if (collisionInfo.collided) {
        if (obj.isDeath) {
          return "DIED";
        }

        // --- Positional correction (push out of penetration) ---
        // Add a tiny epsilon so we are definitely separated after resolution
        const separationBias = 1e-3;
        this.pos.x += collisionInfo.normal.x * (collisionInfo.penetration + separationBias);
        this.pos.y += collisionInfo.normal.y * (collisionInfo.penetration + separationBias);

        const dot =
          this.vel.x * collisionInfo.normal.x +
          this.vel.y * collisionInfo.normal.y;

        // --- Ground detection (unchanged logic) ---
        if (collisionInfo.normal.y <= PHYSICS_SETTINGS.MAX_GROUND_SLOPE_NORMAL) {
          this.isGrounded = true;

          if (collisionInfo.normal.y <= PHYSICS_SETTINGS.MAX_JUMP_SLOPE_NORMAL) {
            this.canJump = true;
          }
        }

        // --- Velocity response: ALWAYS remove the normal component if moving into surface ---
        if (dot < 0) {
          // projection of velocity onto normal
          const v_normal_x = dot * collisionInfo.normal.x;
          const v_normal_y = dot * collisionInfo.normal.y;

          // tangential velocity (velocity without the normal component)
          const v_tangential_x = this.vel.x - v_normal_x;
          const v_tangential_y = this.vel.y - v_normal_y;

          // Remove the normal component so we don't keep moving into the surface
          this.vel.x = v_tangential_x;
          this.vel.y = v_tangential_y;

          // Apply bounce (usually 0)
          this.vel.x -= v_normal_x * PHYSICS_SETTINGS.BOUNCE_FACTOR;
          this.vel.y -= v_normal_y * PHYSICS_SETTINGS.BOUNCE_FACTOR;
        }

        // continue checking other objects (multiple collisions may exist)
      }
    }
    return null;
  }

  
  checkLineCollision(p1, p2, circlePos, circleRadius, lineHeight) {
    const { dist, closestPoint } = getClosestPointOnLineSegment(
      p1,
      p2,
      circlePos,
    );
    const collisionThreshold = circleRadius + lineHeight / 2;

    if (dist <= collisionThreshold) {
      const penetration = collisionThreshold - dist;
      // Normal points from line *to* circle
      const normal =
        dist < 1e-6
          ? { x: 0, y: -1 } // Default to up if directly on top
          : {
              x: (circlePos.x - closestPoint.x) / dist,
              y: (circlePos.y - closestPoint.y) / dist,
            };
      return { collided: true, penetration, normal, closestPoint };
    }
    return { collided: false };
  }

  checkCircleCollision(circleC, circleR, ballPos, ballR) {
    const dist = distance(ballPos, circleC);
    const collisionThreshold = ballR + circleR;

    if (dist < collisionThreshold) {
      const penetration = collisionThreshold - dist;
      // Normal points from circle *to* ball
      const normal =
        dist < 1e-6
          ? { x: 0, y: -1 } // Default
          : {
              x: (ballPos.x - circleC.x) / dist,
              y: (ballPos.y - circleC.y) / dist,
            };
      return { collided: true, penetration, normal };
    }
    return { collided: false };
  }
} // --- END OF PhysicsPlayer CLASS ---

export class PhysicsMap {
  constructor(objects, spawn) {
    this.objects = objects; // Will be updated every frame
    this.spawn = spawn; // Will be updated every frame
  }
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

