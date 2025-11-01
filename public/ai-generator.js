// public/ai-generator.js
// Orchestrates the physics simulation and runs the calibration tests.
// FIX:
// 1. Modified `runSimulation` to take a `forceFrameCount` parameter.
// 2. `runAutoTuner` calls `runSimulation` with `forceFrameCount = TRUTH_DATA_LEFT.length`.
// 3. `runPhysicsTest` calls `runSimulation` with `forceFrameCount = 0`, allowing
//    it to run for the full 5-second `maxDuration` and hit the death wall.

import UI from "./ui.js";
import { PhysicsPlayer, PhysicsMap, parseReferenceMap, PHYSICS_SETTINGS } from "./ai-generator-utils.js";

let lastTestResults = {};
let cachedTunerResults = null; // Caches the winning constants

// This is the cleaned sample data from 
const TRUTH_DATA_LEFT = [
  { "t": 0, "x": 0, "y": 0, "xv": 0, "yv": 0 },
  { "t": 0.032799999952316285, "x": -0.11995999999993501, "y": 0, "xv": -3.5988, "yv": 0 },
  { "t": 0.0665, "x": -0.3598400133333257, "y": 0, "xv": -7.196400400000001, "yv": 0 },
  { "t": 0.09939999997615814, "x": -0.719600066662224, "y": 0, "xv": -10.792801599866667, "yv": 0 },
  { "t": 0.13269999992847442, "x": -1.1992001999733475, "y": 0, "xv": -14.38800399933338, "yv": 0 },
  { "t": 0.166, "x": -1.7986004665733049, "y": 0, "xv": -17.98200799800027, "yv": 0 },
  { "t": 0.19939999997615815, "x": -2.517760933084446, "y": 0, "xv": -21.574813995334274, "yv": 0 },
  { "t": 0.23269999992847443, "x": -3.356641679440031, "y": 0, "xv": -25.16642239066916, "yv": 0 },
  { "t": 0.26589999997615815, "x": -4.31520279888025, "y": 0, "xv": -28.7568335832056, "yv": 0 },
  { "t": 0.29929999995231626, "x": -5.393404397947279, "y": 0, "xv": -32.3460479720112, "yv": 0 },
  { "t": 0.3325, "x": -6.591206596481243, "y": 0, "xv": -35.93406595602053, "yv": 0 },
  { "t": 0.36589999997615813, "x": -7.908569527615782, "y": 0, "xv": -39.520887934035194, "yv": 0 },
  { "t": 0.3991000000238419, "x": -9.345453337773279, "y": 0, "xv": -43.10651430472385, "yv": 0 },
  { "t": 0.43239999997615813, "x": -10.901818186660648, "y": 0, "xv": -46.69094546662228, "yv": 0 },
  { "t": 0.466, "x": -12.577624247265078, "y": 0, "xv": -50.274181818133414, "yv": 0 }
];

// This is the NEW map JSON you provided.
const REFERENCE_MAP_JSON = `{
  "version": 1,
  "spawn": { "spawnX": 0, "spawnY": 0 },
  "mapSize": 9,
  "objects": [
    { "id": 3, "color": 5209260, "x": 910, "y": 317, "angle": 90, "isDeath": true, "type": "line", "width": 82, "height": 5 },
    { "id": 2, "color": 5209260, "x": 960, "y": 317, "angle": 90, "isDeath": true, "type": "line", "width": 82, "height": 5 },
    { "id": 1, "color": 5209260, "x": 935, "y": 284.5, "angle": 0, "isDeath": true, "type": "line", "width": 132, "height": 5 },
    { "id": 0, "color": 5209260, "x": 935, "y": 362, "angle": 0, "isDeath": false, "type": "line", "width": 40, "height": 6 }
  ],
  "colors": { "background": "rgb(0, 0, 0)", "none": "rgb(79, 124, 172)", "bouncy": "rgb(167, 196, 190)", "death": "rgb(79, 124, 172)" }
}`;

/**
 * Runs the physics simulation.
 * @param {PhysicsMap} map - The map to simulate on.
 * @param {object} inputs - The inputs to hold.
 * @param {number} maxDuration - Max time in seconds.
 * @param {boolean} debug - Log to console.
 * @param {number} [forceFrameCount=0] - If > 0, run for *exactly* this many frames.
 * @returns {object} - { status, data }
 */
function runSimulation(map, inputs, maxDuration = 5, debug = false, forceFrameCount = 0) {
  const { TIME_STEP } = PHYSICS_SETTINGS;
  const maxSteps = maxDuration / TIME_STEP;
  const canvas = UI.elems.canvas;

  const player = new PhysicsPlayer(map.spawn.x, map.spawn.y, map.spawn.radius);
  const simulationData = [];

  // FIX: Determine number of steps to run.
  // If `forceFrameCount` is set (by the tuner), use it.
  // Otherwise, use the full `maxDuration` (for the main test).
  const stepsToRun = (forceFrameCount > 0) ? forceFrameCount : maxSteps;

  for (let i = 0; i < stepsToRun; i++) {
    const logData = {
      t: (i * TIME_STEP * 1000), // Log time in MS
      x: (player.pos.x - map.spawn.x),
      y: (player.pos.y - map.spawn.y),
      xv: player.vel.x,
      yv: player.vel.y,
    };
    simulationData.push(logData);

    // Stop if we're at the last frame of a force-counted run
    if (forceFrameCount > 0 && i >= stepsToRun - 1) {
        break; 
    }

    const result = player.update(inputs, map);

    if (debug && (i + 1) % 15 === 0) {
      console.log(`Step ${i + 1}:`, {
        pos: { x: logData.x.toFixed(2), y: logData.y.toFixed(2) },
        vel: { x: logData.xv.toFixed(2), y: logData.yv.toFixed(2) },
        grounded: player.isGrounded
      });
    }

    if (result === "DIED") {
      if (debug) console.log(`DIED at step ${i + 1} (Time: ${((i + 1) * TIME_STEP).toFixed(2)}s)`);
      const finalLogData = {
        t: ((i + 1) * TIME_STEP * 1000),
        x: (player.pos.x - map.spawn.x),
        y: (player.pos.y - map.spawn.y),
        xv: player.vel.x,
        yv: player.vel.y,
      };
      simulationData.push(finalLogData);
      return { status: "DIED", data: simulationData };
    }
  }

  // If we're here, the simulation finished its steps without dying
  const simStatus = (forceFrameCount > 0) ? "SAFE" : "SAFE (Timeout)";
  if (debug && simStatus === "SAFE (Timeout)") console.log(simStatus);
  return { status: simStatus, data: simulationData };
}

/**
 * NEW AUTO-TUNER FUNCTION
 * Iterates to find the best constants that match TRUTH_DATA_LEFT
 * within a 1.0 unit error margin for all parameters.
 */
export function runAutoTuner() {
  // Use cached results if available
  if (cachedTunerResults) {
    console.log("%cUsing cached tuner results.", "color: #0af");
    return cachedTunerResults;
  }

  console.log("--- Starting Auto-Tuner for FORCE_SCALE and DRAG_FACTOR ---");
  console.log(`Tuning against ${TRUTH_DATA_LEFT.length} frames of sample data...`);

  const canvas = UI.elems.canvas;
  if (!canvas) {
    console.error("Canvas element not found. Aborting test.");
    return null;
  }
  let map;
  try {
    map = parseReferenceMap(REFERENCE_MAP_JSON, canvas.width, canvas.height);
  } catch (e) {
    console.error("Failed to parse map:", e);
    return null;
  }

  const originalForce = PHYSICS_SETTINGS.FORCE_SCALE;
  const originalJump = PHYSICS_SETTINGS.JUMP_SCALE;
  const originalDrag = PHYSICS_SETTINGS.DRAG_FACTOR;

  const inputs = { up: false, down: false, left: true, right: false };
  const ERROR_MARGIN = 1.0;

  // Define search space
  const FS_MIN = 8.99;
  const FS_MAX = 9.01;
  const FS_STEP = 0.001;

  const DRAG_MIN = -0.015;
  const DRAG_MAX = -0.005;
  const DRAG_STEP = 0.0001;

  console.log(`Searching FS=[${FS_MIN}, ${FS_MAX}] and DRAG=[${DRAG_MIN}, ${DRAG_MAX}]...`);

  for (let fs = FS_MIN; fs <= FS_MAX; fs += FS_STEP) {
    for (let drag = DRAG_MIN; drag <= DRAG_MAX; drag += DRAG_STEP) {
      // Set the physics for this one simulation
      PHYSICS_SETTINGS.FORCE_SCALE = fs;
      PHYSICS_SETTINGS.DRAG_FACTOR = drag;

      // Run simulation for the *exact* frame count of the sample data
      const simResult = runSimulation(map, inputs, 0, false, TRUTH_DATA_LEFT.length);
      const simData = simResult.data;

      if (simData.length !== TRUTH_DATA_LEFT.length) {
        continue;
      }

      let allFramesMatch = true;
      // Compare every frame
      for (let i = 0; i < simData.length; i++) {
        const simFrame = simData[i];
        const truthFrame = TRUTH_DATA_LEFT[i];

        if (
          Math.abs(simFrame.x - truthFrame.x) > ERROR_MARGIN ||
          Math.abs(simFrame.y - truthFrame.y) > ERROR_MARGIN ||
          Math.abs(simFrame.xv - truthFrame.xv) > ERROR_MARGIN ||
          Math.abs(simFrame.yv - truthFrame.yv) > ERROR_MARGIN
        ) {
          allFramesMatch = false;
          break; // This constant pair failed, try next
        }
      }

      // We found a winner!
      if (allFramesMatch) {
        // Restore original physics
        PHYSICS_SETTINGS.FORCE_SCALE = originalForce;
        PHYSICS_SETTINGS.JUMP_SCALE = originalJump;
        PHYSICS_SETTINGS.DRAG_FACTOR = originalDrag;

        const results = {
          force: fs,
          drag: drag
        };

        console.log("%c--- Auto-Tuner SUCCESS! ---", "color: #0f0;");
        console.log(`Found matching constants within ${ERROR_MARGIN} unit error:`);
        console.log(`  FORCE_SCALE: ${fs.toFixed(3)}`);
        console.log(`  DRAG_FACTOR: ${drag.toFixed(4)}`);

        cachedTunerResults = results; // Cache it
        return results;
      }
    }
  }

  // Restore original physics
  PHYSICS_SETTINGS.FORCE_SCALE = originalForce;
  PHYSICS_SETTINGS.JUMP_SCALE = originalJump;
  PHYSICS_SETTINGS.DRAG_FACTOR = originalDrag;

  console.error("--- Auto-Tuner FAILURE ---");
  console.error("Could not find any constants that match the sample data within the 1.0 error margin.");
  return null;
}

/**
 * Main test entry point.
 * @param {boolean} debug - Log verbose details to console.
 * @returns {string} - The JSON string of the results.
 */
export function runPhysicsTest(debug = false) {
  console.clear();
  console.log("--- Starting Physics Calibration Test ---");

  // --- 1. RUN AUTO-TUNER ---
  const tunerResults = runAutoTuner();

  // --- 2. CHECK TUNER RESULTS (Gatekeeper) ---
  if (!tunerResults) {
    console.error("Aborting runPhysicsTest: Auto-Tuner failed to find valid constants.");
    return; // Do not run the test
  }

  // --- 3. RUN THE TEST (LEFT ONLY) ---
  console.log("Auto-Tuner passed. Running final test with tuned constants...");

  const originalForce = PHYSICS_SETTINGS.FORCE_SCALE;
  const originalJump = PHYSICS_SETTINGS.JUMP_SCALE;
  const originalDrag = PHYSICS_SETTINGS.DRAG_FACTOR;

  // Apply the winning constants
  PHYSICS_SETTINGS.FORCE_SCALE = tunerResults.force;
  PHYSICS_SETTINGS.DRAG_FACTOR = tunerResults.drag;

  console.log(`Using: TIME_STEP=${PHYSICS_SETTINGS.TIME_STEP}, FORCE_SCALE=${PHYSICS_SETTINGS.FORCE_SCALE.toFixed(3)}, DRAG_FACTOR=${PHYSICS_SETTINGS.DRAG_FACTOR.toFixed(4)}`);

  lastTestResults = {};

  const canvas = UI.elems.canvas;
  if (!canvas) {
    console.error("Canvas element not found. Aborting test.");
    return;
  }

  let map;
  try {
    map = parseReferenceMap(REFERENCE_MAP_JSON, canvas.width, canvas.height);
  } catch (e) {
    console.error("Failed to parse reference map:", e);
    // Restore original values on failure
    PHYSICS_SETTINGS.FORCE_SCALE = originalForce;
    PHYSICS_SETTINGS.JUMP_SCALE = originalJump;
    PHYSICS_SETTINGS.DRAG_FACTOR = originalDrag;
    return;
  }

  // --- SKIPPED TESTS ---
  console.log("Running Test 1: Hold UP... (SKIPPED)");
  lastTestResults.up = { status: "SKIPPED", data: [] };
  console.log("Running Test 2: Hold RIGHT... (SKIPPED)");
  lastTestResults.right = { status: "SKIPPED", data: [] };

  // --- Run Test Case 3: Hold LEFT ---
  console.log("Running Test 3: Hold LEFT...");
  // Run the simulation for the full 5 seconds.
  const resultLeft = runSimulation(map, { up: false, down: false, left: true, right: false }, 5, debug, 0);
  console.log(`  > Test 3 (Left) Result: ${resultLeft.status}`);
  lastTestResults.left = resultLeft;
  if (debug) console.table(resultLeft.data);

  console.log("--- Physics Test Complete ---");

  // The success state is now that the tuner passed AND the test "DIED"
  if (resultLeft.status === "DIED") {
    console.log("%cSUCCESS: Auto-tuner found matching constants and test resulted in 'DIED'.", "color: #0f0; font-weight: bold;");
  } else {
    console.error(`FAILURE: Test status was '${resultLeft.status}', expected 'DIED'.`);
  }


  // Restore original values
  PHYSICS_SETTINGS.FORCE_SCALE = originalForce;
  PHYSICS_SETTINGS.JUMP_SCALE = originalJump;
  PHYSICS_SETTINGS.DRAG_FACTOR = originalDrag;

  console.log("%cTo copy results, run: `copy(runPhysicsTest(true))`", "color: #0af; font-weight: bold;");

  // Return the JSON string so `copy()` can be used.
  return JSON.stringify(lastTestResults, null, 2);
}


// --- Expose functions to the console ---
window.runPhysicsTest = runPhysicsTest;
window.runAutoTuner = runAutoTuner;