// public/ai-generator.js
// Runs an interactive, user-controlled physics simulation
// based on real-time objects in the State.

import UI from "./ui.js";
import State from "./state.js";
import {
  PhysicsPlayer,
  PhysicsMap,
  parseStateObjects,
  PHYSICS_SETTINGS,
} from "./sim-utils.js";
// --- NEW IMPORT ---
import { generateTunnelFromPath } from "./sim-auto-generator.js";
import { showToast } from "./utils-client.js";
import { startPathDrawing } from "./auto-generator-path.js";
// Store options locally when game starts
let currentSimOptions = {};

// --- Game State ---
let isActive = false;
let player = null;
let map = null;
let keysDown = { w: false, a: false, s: false, d: false };
let animFrameId = null;
let lastTime = 0;
let accumulator = 0;
let playerPath = []; // --- NEW: To store the recorded path ---

/**
 * The main game loop, driven by requestAnimationFrame.
 */
function gameLoop(currentTime) {
  if (!isActive) return;

  const { TIME_STEP } = PHYSICS_SETTINGS;
  const deltaTime = (currentTime - lastTime) / 1000; // in seconds
  lastTime = currentTime;
  accumulator += deltaTime;

  // Use fixed time-step updates for stable physics
  while (accumulator >= TIME_STEP) {
    // --- REAL-TIME MAP UPDATE ---
    // 1. Get current objects from global state
    const stateObjects = State.get("objects") || [];
    // 2. Parse them into physics objects
    map.objects = parseStateObjects(stateObjects);
    // 3. Get current spawn from global state
    const spawnCircle = State.get("spawnCircle");
    map.spawn.x = spawnCircle.x;
    map.spawn.y = spawnCircle.y;
    // 4. Update player radius in case spawn size changed
    player.radius = spawnCircle.diameter / 2;
    // --- END OF MAP UPDATE ---

    const inputs = {
      up: keysDown.w,
      down: keysDown.s,
      left: keysDown.a,
      right: keysDown.d,
    };

    const result = player.update(inputs, map);

    // 2. & 4. Death Condition:
    // - Dies if touching "death" object
    // - Dies if CENTER touches bottom (player.pos.y >= height)
    // - Does NOT die on sides or top
    if (result === "DIED" || player.pos.y >= 500) {
      player.respawn(map.spawn);
      playerPath = [];
      playerPath.push({ x: player.pos.x, y: player.pos.y });
      console.log("[Sim] Player died. Path reset.");
      State.set("generatedPath", playerPath); // Reset viz
    }

    // Goal 4: Stop game if touching Cap Zone
    const cz = State.get("capZone");
    if (cz) {
      // Simple AABB check (player is circle, cz is rect)
      // Determine closest point on rect to circle center
      const closestX = Math.max(cz.x, Math.min(player.pos.x, cz.x + cz.width));
      const closestY = Math.max(cz.y, Math.min(player.pos.y, cz.y + cz.height));
      const dx = player.pos.x - closestX;
      const dy = player.pos.y - closestY;
      if (dx * dx + dy * dy < player.radius * player.radius) {
        console.log("[Sim] Reached Cap Zone!");
        stopGame();
        return;
      }
    }

    accumulator -= TIME_STEP;
  }

  // Goal 3: Optimization & Logging
  // Only add path point if far enough from the last one
  const lastPoint = playerPath[playerPath.length - 1];
  const dist = lastPoint
    ? Math.hypot(player.pos.x - lastPoint.x, player.pos.y - lastPoint.y)
    : Infinity;

  // Constraint: Points must be at least player.diameter away (roughly)
  // Using diameter (radius*2) ensures valid tunnel generation without overlapping self-intersection madness.
  const minRecordDist = player.radius * 2;

  if (dist >= minRecordDist) {
    playerPath.push({ x: player.pos.x, y: player.pos.y });
    console.log(`[Sim] Path points: ${playerPath.length}`);

    // Goal 2: Dynamic Visualization
    // Update State so Canvas draws the dotted line immediately
    State.set("generatedPath", [...playerPath]);
  }
  // Update the visual representation (the "simulationPreview" ball)
  State.set("simulationPreview", {
    x: player.pos.x,
    y: player.pos.y,
    radius: player.radius,
  });

  animFrameId = requestAnimationFrame(gameLoop);
}

/**
 * Handles key down events for game controls.
 */
function handleKeyDown(e) {
  // Prevent default browser behavior for game keys
  switch (e.key.toLowerCase()) {
    case "w":
      keysDown.w = true;
      e.preventDefault();
      break;
    case "a":
      keysDown.a = true;
      e.preventDefault();
      break;
    case "s":
      keysDown.s = true;
      e.preventDefault();
      break;
    case "d":
      keysDown.d = true;
      e.preventDefault();
      break;
    case "escape":
      stopGame(); // Use Escape to exit the game mode
      e.preventDefault();
      break;
  }
}

/**
 * Handles key up events for game controls.
 */
function handleKeyUp(e) {
  switch (e.key.toLowerCase()) {
    case "w":
      keysDown.w = false;
      e.preventDefault();
      break;
    case "a":
      keysDown.a = false;
      e.preventDefault();
      break;
    case "s":
      keysDown.s = false;
      e.preventDefault();
      break;
    case "d":
      keysDown.d = false;
      e.preventDefault();
      break;
  }
}

/**
 * Stops the game simulation and cleans up.
 */
function stopGame(options = {}) {
  if (!isActive) return;

  // --- NEW: Process the recorded path ---
  // Check if the game was active and path is long enough to be interesting
  const MIN_PATH_POINTS = 5; // ~1.6 seconds at 30fps
  if (playerPath.length > MIN_PATH_POINTS) {
    console.log(
      `[Path Recorder] Path recorded with ${playerPath.length} points. Generating polygons...`,
    );
    // Send the path to the tunnel generator
    // We pass the global State and a simplification value
    generateTunnelFromPath(playerPath, State, {
      epsilon: 10,
      tunnelPadding: currentSimOptions.tunnelPadding,
    });
  } else {
    console.log(
      `[Path Recorder] Path too short (${playerPath.length} points). Not generating polygons.`,
    );
  }
  playerPath = []; // Always clear the path
  // --- END NEW BLOCK ---

  console.log("Stopping game simulation...");
  isActive = false;
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // Remove event listeners
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
  // Goal 2: Clear the path visuals when sim stops
  State.set("generatedPath", null);
  // Clear the rendered ball from the canvas
  State.set("simulationPreview", null);

  // Clean up game objects
  player = null;
  map = null;
  keysDown = { w: false, a: false, s: false, d: false };
}

/**
 * Starts the interactive game simulation.
 * This is exported and called by the "Paste Map" button.
 */
export function startGame(options = {}) {
  // 8. Exclusive Check: If preview is active but we aren't running, auto-sim is likely active
  if (State.get("simulationPreview") && !isActive) {
    showToast("Cannot start: A simulation is already running!", true);
    return;
  }

  currentSimOptions = options; // Store for use in stopGame
  if (isActive) {
    stopGame(); // Allow the button to also stop the game
    playerPath = []; // --- NEW: Clear path on re-entry ---
    return;
  }

  console.log("Starting game simulation...");
  console.log("Controls: WASD to move. Escape to exit.");

  const spawnCircle = State.get("spawnCircle");
  if (!spawnCircle) {
    console.error("Spawn circle not found in State. Aborting game.");
    return;
  }

  const spawnPos = { x: spawnCircle.x, y: spawnCircle.y };
  const spawnRadius = spawnCircle.diameter / 2;

  if (spawnRadius <= 0) {
    console.error("Spawn radius is zero or negative. Aborting game.");
    return;
  }

  // Initialize the player and map
  player = new PhysicsPlayer(spawnPos.x, spawnPos.y, spawnRadius);
  map = new PhysicsMap([], spawnPos); // Map objects will be populated in gameLoop

  // --- NEW: Initialize the path ---
  playerPath = [];
  playerPath.push({ x: player.pos.x, y: player.pos.y }); // Add spawn point

  isActive = true;
  accumulator = 0;
  lastTime = performance.now();

  // Add game-specific event listeners
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  // Start the game loop
  animFrameId = requestAnimationFrame(gameLoop);
}

// Goal 6: New Console Function
// Re-uses auto-generator-path's mouse logic (startPathDrawing)
// then runs sim-auto-generator's tunnel logic (generateTunnelFromPath).
window.startMousePathGen = async function () {
  if (State.get("simulationPreview") && !isActive) {
    showToast("Cannot start: A simulation is already running!", true);
    return;
  }

  console.log("Draw a path using your mouse...");

  try {
    // 1. Reuse centralized drawing logic
    let pathPoints = await startPathDrawing();

    // --- NEW: Path Constraint Implementation ---
    // A. Define the minimum distance. Use a fallback for player radius if player isn't active.
    // The constraint in gameLoop is player.radius * 2.
    const spawnCircle = State.get("spawnCircle");
    if (!spawnCircle) {
      console.error(
        "Spawn circle not found in State. Cannot apply path constraint.",
      );
      State.set("generatedPath", null);
      return;
    }
    const playerRadius = spawnCircle.diameter / 2;
    const minRecordDist = playerRadius * 2;

    // B. Filter the path points to respect the minimum distance
    const filteredPath = [];
    if (pathPoints.length > 0) {
      filteredPath.push(pathPoints[0]); // Always keep the starting point

      for (let i = 1; i < pathPoints.length; i++) {
        const lastPoint = filteredPath[filteredPath.length - 1];
        const currentPoint = pathPoints[i];

        // Calculate distance between current and last recorded point
        const dist = Math.hypot(
          currentPoint.x - lastPoint.x,
          currentPoint.y - lastPoint.y,
        );

        if (dist >= minRecordDist) {
          filteredPath.push(currentPoint);
        }
      }
    }

    pathPoints = filteredPath; // Use the filtered path for generation
    // --- END NEW BLOCK ---

    // 2. Generate Tunnel (Death Polygons)
    // Check if path is long enough after filtering
    const MIN_PATH_POINTS = 5;
    if (pathPoints.length < MIN_PATH_POINTS) {
      console.log(
        `[Mouse Path Gen] Path too short (${pathPoints.length} points) after filtering. Not generating polygons.`,
      );
      State.set("generatedPath", null);
      return;
    }

    console.log(
      `Generating tunnel from filtered path (${pathPoints.length} points)...`,
    );
    await generateTunnelFromPath(pathPoints, State, {
      epsilon: 10,
      tunnelPadding: currentSimOptions.tunnelPadding || 15,
    });

    // 3. Cleanup visuals (startPathDrawing leaves them up for processing)
    State.set("generatedPath", null);
    console.log("Done.");
  } catch (err) {
    console.log("Mouse Gen Cancelled:", err.message);
    State.set("generatedPath", null);
  }
};
