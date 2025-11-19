/* ai-generator-map.js
   Generates a flat-top polygon and simulates a complex, configurable maneuver.
   - Moves to the platform edge with predictive stopping.
   - Jumps at a random point in the run (configurable).
   - Jump height and fall speed are randomized (configurable).
   - Moves the Cap Zone to the final stopping position.
   - **REVISED**: Generates "death" polygons by "carving" the
     simulation path from the canvas, using the robust logic
     from auto-generator-path.js.
*/

import State from "./state.js";
import UI from "./ui.js";
import * as Network from "./network.js"; // Added Network import
import {
  PhysicsPlayer,
  PhysicsMap,
  parseStateObjects,
  PHYSICS_SETTINGS,
} from "./sim-utils.js";
import {
  splitAndFormatPolygons, // Kept for old logic (if any)
  randomFloat,
  randomInt,
  randChoice,
  getRandomType,
  computePathLengths,
  rdpSimplify,
  createValidPolygonObject,
  splitConcaveIntoConvex,
  splitAndMergeConvex,
  clampToCanvasPoint,
  buildSegmentBlob,
  ringToMultiPolygon,
  signedArea,
  areaOfRing,
  dedupeRing,
  intersectRayRightWithSegment,
  stitchHoleIntoOuter,
} from "./utils-client.js";

import { showToast } from "./utils-client.js";

// --- Config (tweakable) ---
const CONFIG = {
  CANVAS_PADDING: 20,
  TOP_MARGIN: 6,
  POLYGON_TOP_WIDTH: 140,
  POLYGON_DEPTH: 44,
  MAX_SIM_SEC: 10,
  STOP_TOLERANCE: 0.1,

  // --- Maneuver Config ---
  MANEUVER_DISTANCE_RANGE_DIAMETERS: [1.0, 10.0],
  JUMP_PROBABILITY: 1.0, // (0.0 to 1.0)
  // (Portion of run, e.g., 0.1=10% thru, 0.9=90% thru)
  JUMP_INITIATION_RANGE: [0.1, 0.9],

  // --- Jump Height Config ---
  JUMP_HEIGHT_WEIGHTS: {
    tap: 1,
    mid: 1,
    full: 1,
  },
  // Jump hold settings:
  // - tap: short fixed hold
  // - mid: randomized hold (only case with randomness)
  // - full: -1 means hold until apex
  JUMP_HOLD: {
    tap: 0.05,
    midRange: [0.08, 0.22],
    full: -1,
  },

  // --- Fall Speed Config ---
  FALL_INPUT_WEIGHTS: {
    up: 1,
    none: 1,
    down: 1,
  },

  // --- Path Tunnel Config ---
  PATH_DEATH_TUNNEL: {
    enabled: true,
    // padding: 10, // (Padding is now controlled by player diameter in new func)
    // thickness: 15, // (Thickness is also controlled by player diameter)
    // polyType: "death", // (This is set in generateTunnelFromPath)
    // sampleCount: 30, // (Handled by new func)
    // stepJitterFactor: 0.1, // (Handled by new func)
    minTriggerLength: 50,
  },
};

// --- End Config ---

// --- Polygon Generation (Unchanged) ---
function makeFlatTopPoly(canvasW, canvasH) {
  const topWidth = CONFIG.POLYGON_TOP_WIDTH;
  const depth = CONFIG.POLYGON_DEPTH;
  const half = topWidth / 2;

  const topY = randomFloat(
    CONFIG.CANVAS_PADDING,
    canvasH - CONFIG.CANVAS_PADDING - depth,
  );
  const cx = randomFloat(
    CONFIG.CANVAS_PADDING + half,
    canvasW - CONFIG.CANVAS_PADDING - half,
  );

  const v_arr = [];
  v_arr.push({ x: -half, y: 0 }); // v[0]: left top
  v_arr.push({ x: half, y: 0 }); // v[1]: right top

  const numExtraVerts = randomInt(2, 5);
  const points = [];
  for (let i = 0; i < numExtraVerts; i++) {
    const angle =
      (Math.PI * (i + 0.5 + randomFloat(-0.1, 0.1))) / (numExtraVerts + 1);
    const radius = randomFloat(half * 0.5, half + depth);
    points.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius + randomFloat(0, depth * 0.2),
    });
  }
  points.sort((a, b) => b.x - a.x);
  v_arr.push(...points);

  return {
    id: "gen-poly-" + Date.now(),
    type: "poly",
    v: v_arr,
    c: { x: cx, y: topY },
    a: 0,
    scale: 1,
    polyType: "none",
  };
}

// --- Simulation Logic (Unchanged) ---
function computeTopSegment(poly) {
  const c = poly.c;
  const v0 = poly.v[0];
  const v1 = poly.v[1];
  const p1 = { x: c.x + v0.x, y: c.y + v0.y };
  const p2 = { x: c.x + v1.x, y: c.y + v1.y };
  return {
    leftX: Math.min(p1.x, p2.x),
    rightX: Math.max(p1.x, p2.x),
    y: p1.y,
  };
}

function placeSpawnOnPoly(poly) {
  const top = computeTopSegment(poly);
  const currentSpawn = State.get("spawnCircle");
  const diameter = currentSpawn?.diameter || 12;
  const minX = top.leftX + diameter;
  const maxX = top.rightX - diameter;
  let cx = (minX + maxX) / 2;
  if (minX < maxX) {
    cx = randomFloat(minX, maxX);
  }
  const spawnY = top.y - diameter / 2 - CONFIG.TOP_MARGIN;
  State.set("spawnCircle", { ...currentSpawn, x: cx, y: spawnY });
}

function predictStoppingDistance(currentPlayer, map) {
  const ghostPlayer = new PhysicsPlayer(
    currentPlayer.pos.x,
    currentPlayer.pos.y,
    currentPlayer.radius,
  );
  ghostPlayer.vel = { ...currentPlayer.vel };
  ghostPlayer.mass = currentPlayer.mass;

  let distance = 0;
  const input = { up: false, down: false, left: false, right: false };
  const initialDir = Math.sign(ghostPlayer.vel.x);
  if (initialDir === 0) return 0;

  if (initialDir === 1) input.left = true;
  else input.right = true;

  const maxBrakeSteps = Math.ceil(5 / PHYSICS_SETTINGS.TIME_STEP);
  for (let i = 0; i < maxBrakeSteps; i++) {
    const startX = ghostPlayer.pos.x;
    ghostPlayer.update(input, map);
    distance += Math.abs(ghostPlayer.pos.x - startX);
    if (
      Math.sign(ghostPlayer.vel.x) !== initialDir ||
      Math.abs(ghostPlayer.vel.x) < CONFIG.STOP_TOLERANCE
    ) {
      return distance;
    }
  }
  return distance;
}

function getRandomJumpDuration() {
  const type = getRandomType(CONFIG.JUMP_HEIGHT_WEIGHTS);

  if (type === "tap") {
    return CONFIG.JUMP_HOLD && typeof CONFIG.JUMP_HOLD.tap === "number"
      ? CONFIG.JUMP_HOLD.tap
      : 0.05;
  }

  if (type === "mid") {
    const range = CONFIG.JUMP_HOLD?.midRange || [0.08, 0.22];
    return randomFloat(range[0], range[1]);
  }

  if (type === "full") {
    return CONFIG.JUMP_HOLD && typeof CONFIG.JUMP_HOLD.full === "number"
      ? CONFIG.JUMP_HOLD.full
      : -1;
  }

  return 0.05;
}

function simulateManeuver(spawn, poly, params) {
  const dt = PHYSICS_SETTINGS.TIME_STEP;
  const maxSteps = Math.ceil(CONFIG.MAX_SIM_SEC / dt);
  const map = new PhysicsMap(parseStateObjects([poly]), {
    x: spawn.x,
    y: spawn.y,
  });
  const player = new PhysicsPlayer(spawn.x, spawn.y, spawn.diameter / 2);

  const maneuverLengthDiameters = randomFloat(
    CONFIG.MANEUVER_DISTANCE_RANGE_DIAMETERS[0],
    CONFIG.MANEUVER_DISTANCE_RANGE_DIAMETERS[1],
  );
  const maneuverLengthPixels = maneuverLengthDiameters * spawn.diameter;
  const targetX = spawn.x + maneuverLengthPixels * params.dir;
  const topEdge = computeTopSegment(poly);

  const simState = {
    horizontal: "RUNNING",
    vertical: "GROUNDED",
    willJump: Math.random() < CONFIG.JUMP_PROBABILITY,
    hasJumped: false,
    jumpHoldRemaining: 0,
    currentFallBehavior: null,
    targetX: targetX,
    jumpInitiationX:
      spawn.x +
      (targetX - spawn.x) *
        randomFloat(
          CONFIG.JUMP_INITIATION_RANGE[0],
          CONFIG.JUMP_INITIATION_RANGE[1],
        ),
  };

  const traj = [];

  for (let step = 0; step < maxSteps; step++) {
    const input = { up: false, down: false, left: false, right: false };
    const wasGrounded = player.isGrounded;

    // --- 1. HORIZONTAL STATE ---
    if (simState.horizontal === "RUNNING") {
      input.right = params.dir === 1;
      input.left = params.dir === -1;
      const stoppingDist = predictStoppingDistance(player, map);
      const distToTarget = Math.abs(simState.targetX - player.pos.x);
      if (distToTarget <= stoppingDist) {
        simState.horizontal = "STOPPING";
      }
    } else if (simState.horizontal === "STOPPING") {
      if (player.vel.x > CONFIG.STOP_TOLERANCE) input.left = true;
      else if (player.vel.x < -CONFIG.STOP_TOLERANCE) input.right = true;
      else simState.horizontal = "STOPPED";
    }

    // --- 2. JUMP TRIGGER ---
    if (simState.willJump && !simState.hasJumped && wasGrounded) {
      const passedTrigger =
        params.dir === 1
          ? player.pos.x >= simState.jumpInitiationX
          : player.pos.x <= simState.jumpInitiationX;

      if (passedTrigger) {
        simState.hasJumped = true;
        simState.jumpHoldRemaining = getRandomJumpDuration();
        input.up = true;
        simState.vertical = "JUMP_ASCEND";
      }
    }

    const VY_EPS = 0.02;

    // --- 3. VERTICAL STATE ---
    if (simState.vertical === "JUMP_ASCEND") {
      if (simState.jumpHoldRemaining > 0) {
        input.up = true;
        simState.jumpHoldRemaining -= dt;
      } else if (simState.jumpHoldRemaining === -1 && player.vel.y < VY_EPS) {
        input.up = true;
      } else {
        simState.jumpHoldRemaining = 0;
        simState.vertical = "FALLING";
      }
    } else if (simState.vertical === "FALLING") {
      if (simState.currentFallBehavior === null) {
        simState.currentFallBehavior = getRandomType(CONFIG.FALL_INPUT_WEIGHTS);
      }
      if (simState.currentFallBehavior === "up" && player.vel.y >= VY_EPS) {
        const ghost = new PhysicsPlayer(
          player.pos.x,
          player.pos.y,
          player.radius,
        );
        ghost.vel = { ...player.vel };
        ghost.mass = player.mass;
        const ghostInput = { ...input, up: false, down: false };
        ghost.update(ghostInput, map);
        if (!ghost.isGrounded) {
          input.up = true;
        }
      } else if (simState.currentFallBehavior === "down") {
        input.down = true;
      }
    }

    // --- 4. UPDATE ---
    const res = player.update(input, map);
    traj.push({ x: player.pos.x, y: player.pos.y });

    // --- 5. POST-UPDATE STATE ---
    const isNowGrounded = player.isGrounded;
    if (isNowGrounded) {
      simState.vertical = "GROUNDED";
      simState.currentFallBehavior = null;
    } else if (wasGrounded) {
      if (simState.vertical !== "JUMP_ASCEND") {
        simState.vertical = "FALLING";
      }
    }

    // --- 6. END CONDITION ---
    const isHorizontallyStopped = simState.horizontal === "STOPPED";
    if (
      (simState.willJump && isHorizontallyStopped && isNowGrounded) ||
      (!simState.willJump && isHorizontallyStopped)
    ) {
      break;
    }

    // --- 7. Fail-safes ---
    if (res === "DIED" || player.pos.y > topEdge.y + 100) break;
  }

  return traj;
}

// ... inside playbackTrajectory ...

function playbackTrajectory(traj) {
  let i = 0;
  function step() {
    if (i >= traj.length) {
      // Simulation/Playback Ended
      setTimeout(() => State.set("simulationPreview", null), 500);

      // Goal 2: Visually show the path for 3 seconds
      State.set("generatedPath", traj);
      setTimeout(() => {
        State.set("generatedPath", null);
      }, 3000);

      return;
    }
    const p = traj[i++];
    State.set("simulationPreview", {
      x: p.x,
      y: p.y,
      radius: State.get("spawnCircle")?.diameter / 2 || 6,
    });
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ... rest of file

// -----------------------------------------------------------------
// --- NEW TUNNEL GENERATION LOGIC (FROM AUTO-GENERATOR-PATH.JS) ---
// -----------------------------------------------------------------

// --- Corridor generation ---
function _generateCorridorPolygons(path, state, options = {}) {
  // Find canvas
  const canvasEl =
    document.querySelector &&
    (document.querySelector("canvas") || window.canvas);
  if (
    !canvasEl ||
    typeof canvasEl.width !== "number" ||
    typeof canvasEl.height !== "number"
  ) {
    console.error("Canvas element not found or width/height missing.");
    return null;
  }
  const canvasW = canvasEl.width;
  const canvasH = canvasEl.height;

  if (!path || !Array.isArray(path) || path.length < 1) {
    console.error("Invalid path");
    return null;
  }

  // Corridor width from state (kept from your old code)
  const playerDiameter =
    (state &&
      state.get &&
      state.get("spawnCircle") &&
      state.get("spawnCircle").diameter) ||
    20;
  const PADDING =
    options.tunnelPadding !== undefined ? options.tunnelPadding : 15;
  const totalThickness = playerDiameter + PADDING;
  const HALF_WIDTH = totalThickness / 2;

  // 3. Filter path points OUTSIDE canvas (Ignore them)
  const validPath = path.filter(
    (p) => p.x >= 0 && p.x <= canvasW && p.y >= 0 && p.y <= canvasH,
  );

  // Filter and clamp path
  const filtered = path
    .filter((p) => p && typeof p.x === "number" && typeof p.y === "number")
    .map((p) => clampToCanvasPoint(p, canvasW, canvasH));

  if (filtered.length < 1) return null;

  // --- ⬇️ FIX: Convert to [x, y] format for rdpSimplify ---

  // 1. Convert {x, y} objects to [x, y] arrays
  const pointsAsArrays = filtered.map((p) => [p.x, p.y]);

  // 2. Simplify the path using the [x, y] array format
  const simplifiedAsArrays = rdpSimplify(pointsAsArrays, 0.6);

  // 3. Convert back to {x, y} object format for the rest of the function
  const simplified = simplifiedAsArrays.map((p) => ({ x: p[0], y: p[1] }));

  // --- ⬆️ END FIX ---

  if (simplified.length < 1) {
    console.error("Path has no points after simplification.");
    return null;
  }

  // Build all segment blobs
  const segmentPolys = [];
  const capSteps = 12;
  for (let i = 0; i < simplified.length - 1; i++) {
    const a = simplified[i],
      b = simplified[i + 1];
    const seg = buildSegmentBlob(a, b, HALF_WIDTH, capSteps, canvasW, canvasH);
    if (seg && seg.length >= 4) {
      segmentPolys.push(ringToMultiPolygon(seg));
    }
  }
  // Add small circles at vertices to ensure smooth join (helps with very short segments)
  for (let i = 0; i < simplified.length; i++) {
    const p = simplified[i];
    const circle = buildSegmentBlob(
      p,
      p,
      HALF_WIDTH,
      capSteps,
      canvasW,
      canvasH,
    );
    if (circle && circle.length >= 4) {
      segmentPolys.push(ringToMultiPolygon(circle));
    }
  }

  if (segmentPolys.length === 0) {
    console.error("No blobs created from path");
    return null;
  }

  // Union all polygons into one MultiPolygon (iterative)
  const polyClip =
    window.polygonClipping || window.martinez || window.polygonClippingUMD;
  if (!polyClip || typeof polyClip.union !== "function") {
    console.error("polygon-clipping union not available.");
    return null;
  }

  let unionRes = segmentPolys[0];
  try {
    for (let i = 1; i < segmentPolys.length; i++) {
      unionRes = polyClip.union(unionRes, segmentPolys[i]);
    }
  } catch (e) {
    console.error("Iterative union failed:", e);
    return null;
  }

  if (!unionRes || !Array.isArray(unionRes)) {
    console.error("Union produced invalid result.");
    return null;
  }

  return unionRes;
}

// --- generateTunnelFromPath: public ---
export async function generateTunnelFromPath(path, state, options = {}) {
  try {
    // --- MODIFICATION: Read epsilon from options ---
    const epsilon = options.epsilon || 0;

    const polyClip =
      window.polygonClipping || window.martinez || window.polygonClippingUMD;

    if (
      !polyClip ||
      typeof polyClip.difference !== "function" ||
      typeof polyClip.union !== "function"
    ) {
      console.error("polygon-clipping library not found or missing methods.");
      return;
    }

    const canvasEl =
      document.querySelector &&
      (document.querySelector("canvas") || window.canvas);
    if (!canvasEl) {
      console.error("Canvas not found");
      return;
    }
    const canvasW = canvasEl.width,
      canvasH = canvasEl.height;

    const corridor = _generateCorridorPolygons(path, state, options);
    if (!corridor) {
      console.error("Failed to create corridor");
      return;
    }

    // Clean corridor by unioning it (this helps fix self-intersections)
    let cleanedCorridor;
    try {
      cleanedCorridor = polyClip.union(corridor);
    } catch (e) {
      console.error("Error cleaning corridor with union:", e);
      return;
    }
    if (!Array.isArray(cleanedCorridor)) {
      console.error("Cleaned corridor invalid");
      return;
    }

    // Build full-canvas polygon as a MultiPolygon: [ [ [ [x,y], ... ] ] ]
    const canvasPoly = [
      [
        [
          [0, 0],
          [canvasW, 0],
          [canvasW, canvasH],
          [0, canvasH],
          [0, 0],
        ],
      ],
    ];

    // Subtract corridor from canvas
    let diff;
    try {
      diff = polyClip.difference(canvasPoly, cleanedCorridor);
    } catch (e) {
      console.error("polyClip.difference failed:", e);
      console.error("Canvas polygon:", JSON.stringify(canvasPoly));
      console.error("Corridor polygon:", JSON.stringify(cleanedCorridor));
      return;
    }

    if (!diff || diff.length === 0) {
      console.warn(
        "Difference produced empty result (path may have covered whole canvas).",
      );
      return;
    }

    // ---------------------
    // Post-process the polygons: dedupe, stitch holes, convex decomposition
    // ---------------------
    const MIN_RING_AREA = 1.0;
    const EPS_DEDUPE = 0.5;

    // (Assuming signedArea, areaOfRing, dedupeRing,
    // intersectRayRightWithSegment, and stitchHoleIntoOuter
    // are all imported from utils-client.js)
    const EPS = 1e-9; // Local constant for stitcher

    // Now iterate the difference result
    const allFinalConvexPieces = [];
    for (const mp of diff) {
      if (!Array.isArray(mp) || mp.length === 0) continue;
      const rawOuter = mp[0];
      if (!Array.isArray(rawOuter) || rawOuter.length < 3) continue;
      let outer = dedupeRing(rawOuter, EPS_DEDUPE);

      const rawHoles = mp
        .slice(1)
        .filter((h) => Array.isArray(h) && h.length >= 3);
      let holes = rawHoles
        .map((h) => dedupeRing(h, EPS_DEDUPE))
        .filter((h) => areaOfRing(h) >= MIN_RING_AREA);

      const outerSigned = signedArea(outer);
      holes = holes.map((h) => {
        if (outerSigned * signedArea(h) > 0) {
          h.reverse();
        }
        return h;
      });

      // Stitch holes
      let currentOuter = outer;
      for (const h of holes) {
        currentOuter = stitchHoleIntoOuter(currentOuter, h);
      }

      // Dedup again and feed into convex decomposition
      const holeFree = dedupeRing(currentOuter, EPS_DEDUPE);
      if (areaOfRing(holeFree) < MIN_RING_AREA) continue;

      // --- MODIFICATION: Apply RDP simplification ---
      const polyForSplitting =
        epsilon > 0 ? rdpSimplify(holeFree, epsilon) : holeFree;
      if (epsilon > 0) {
        console.log(
          `[generateTunnel] Simplified polygon from ${holeFree.length} to ${polyForSplitting.length} vertices (epsilon: ${epsilon}).`,
        );
      }
      // --- END MODIFICATION ---

      // === START BLOCK REPLACEMENT ===
      // This block is now identical to LOGIC 2
      try {
        // --- MODIFICATION START ---
        // Use the new Earcut-based splitting function
        if (typeof splitAndMergeConvex === "function") {
          console.log(
            `[generateTunnel] Splitting polygon with ${polyForSplitting.length} vertices...`,
          );
          // Pass in the { v: [...] } format
          const pieces = splitAndMergeConvex({ v: polyForSplitting });

          if (pieces && pieces.length > 0) {
            console.log(
              `[generateTunnel] Split into ${pieces.length} convex pieces.`,
            );
            // The new function returns arrays of vertices [ [x,y], ... ],
            // so we wrap them in the { v: ... } object expected by the old logic.
            allFinalConvexPieces.push(...pieces.map((p) => ({ v: p })));
          } else {
            console.warn(
              "[generateTunnel] Splitting returned no pieces. Adding raw polygon.",
            );
            allFinalConvexPieces.push({ v: polyForSplitting });
          }
        } else {
          // Fallback to old function if new one isn't loaded
          console.error(
            "[generateTunnel] splitAndMergeConvex function not found! Falling back to old splitConcaveIntoConvex.",
          );
          if (typeof splitConcaveIntoConvex === "function") {
            const pieces = splitConcaveIntoConvex({ v: polyForSplitting });
            if (pieces && pieces.length) {
              allFinalConvexPieces.push(...pieces);
              button;
            } else {
              allFinalConvexPieces.push({ v: polyForSplitting });
            }
          } else {
            console.error(
              "[generateTunnel] No split function found. Adding raw polygon.",
            );
            allFinalConvexPieces.push({ v: polyForSplitting });
          }
        }
        // --- MODIFICATION END ---
      } catch (err) {
        console.warn("Splitting function failed; adding raw part:", err);

        allFinalConvexPieces.push({ v: polyForSplitting });
      }
      // === END BLOCK REPLACEMENT ===
    }

    // Format for Network.createObjectsBatch
    const allTunnelPieces = [];
    for (const piece of allFinalConvexPieces) {
      // 'piece.v' is [ [x,y], ... ]
      const abs = piece.v.map((p) => ({ x: p[0], y: p[1] }));

      // Use the new centralized, validating function
      const validPoly = createValidPolygonObject(abs, "death"); // This function handles all checks

      if (validPoly) {
        allTunnelPieces.push(validPoly);
      }
    }
    // ... inside ai-generator-map.js ... inside generateTunnelFromPath ...

    // === REPLACE THE END OF THE FUNCTION WITH THIS ===
    if (allTunnelPieces.length > 0) {
      console.log(
        `[generateTunnel] Generated ${allTunnelPieces.length} pieces.`,
      );

      // MODIFICATION: Allow returning objects for batching
      if (options.returnObjects) {
        return allTunnelPieces;
      }

      if (Network && typeof Network.createObjectsBatch === "function") {
        Network.createObjectsBatch({
          objects: allTunnelPieces,
          isAutoGeneration: true,
        });
      }
    } else {
      console.log("[generateTunnel] No final polygons after processing.");
      return [];
    }
  } catch (err) {
    console.error("generateTunnelFromPath failed:", err);
    return [];
  }
}
// -----------------------------------------------------------------
// --- END OF NEW TUNNEL LOGIC ---
// -----------------------------------------------------------------

/**
 * Main function called by handlers.js to generate the map.
 */
// ... inside ai-generator-map.js ...

export async function generateParkourMap(options = {}) {
  // 7. Empty Canvas Check (Moved to top)
  if (State.get("objects") && State.get("objects").length > 0) {
    showToast("Clear the map before auto-generating!", true);
    return;
  }

  // 8. Exclusive Simulation Check (Relies on existing preview state)
  if (State.get("simulationPreview")) {
    showToast("A simulation is already running!", true);
    return;
  }

  try {
    const canvas = UI.elems.canvas || { width: 800, height: 600 };

    // 1. Create polygon
    const poly = makeFlatTopPoly(canvas.width, canvas.height);

    // 2. Place spawn
    placeSpawnOnPoly(poly);
    const spawn = State.get("spawnCircle");
    if (!spawn) return;

    // Broadcast Spawn
    Network.setSpawnCircle({ x: spawn.x, y: spawn.y });

    // 3. Set simulation parameters
    const simParams = { dir: randChoice([-1, 1]) };

    // 4. Run simulation
    const trajectory = simulateManeuver(spawn, poly, simParams);

    const finalObjects = [poly];

    // 5. Play back & Generate Tunnel
    if (trajectory && trajectory.length > 0) {
      playbackTrajectory(trajectory);

      const finalPos = trajectory[trajectory.length - 1];
      const cz = State.get("capZone") || { width: 30, height: 18.5 };

      const newCz = {
        ...cz,
        x: finalPos.x - cz.width / 2,
        y: finalPos.y - cz.height / 2,
      };
      State.set("capZone", newCz);
      Network.setCapZone({ x: newCz.x, y: newCz.y });

      const { PATH_DEATH_TUNNEL } = CONFIG;
      const { total } = computePathLengths(trajectory);

      if (
        PATH_DEATH_TUNNEL.enabled &&
        total >= PATH_DEATH_TUNNEL.minTriggerLength
      ) {
        // 1. Pass tunnelPadding from options
        const tunnelPolys = await generateTunnelFromPath(trajectory, State, {
          epsilon: 10,
          returnObjects: true,
          tunnelPadding: options.tunnelPadding,
        });

        if (tunnelPolys && tunnelPolys.length > 0) {
          finalObjects.push(...tunnelPolys);
        }
      }
    } else {
      console.warn("Simulation produced no trajectory.");
      State.set("simulationPreview", null);
    }

    // 6. Send Batch
    if (finalObjects.length > 0) {
      console.log(`Sending batch of ${finalObjects.length} objects.`);
      Network.createObjectsBatch({
        objects: finalObjects,
        isAutoGeneration: true,
      });
    }
  } catch (e) {
    console.error("Auto-generation failed:", e);
    showToast("Generation failed.", true);
    State.set("simulationPreview", null);
  }
}
