// public/auto-generator-path.js

import UI from "./ui.js";
import State from "./state.js";
import { splitConcaveIntoConvex } from "./splitConvex.js";
import {
  calculatePolygonCenter,
  polygonArea,
  pointFromEventOnCanvas // <-- Make sure pointFromEventOnCanvas is imported
} from "./utils-client.js";


// --- Internal Tuning Parameters ---
const POLYGON_THICKNESS = 30;
const PATH_LENGTH_STEPS = 100; // Only used if createRandomPath is called
const SKIP_CHANCE = 0;
const BASE_MIN_DISTANCE_INCREASE = 15;
const MIN_PATH_DISTANCE_SQ = 25; // For user drawing

// --- State for drawing ---
let currentPath = [];
let resolvePathPromise = null;
let rejectPathPromise = null;

// --- Vector Math Helpers ---
const v = (x, y) => ({ x, y });
const add = (v1, v2) => v(v1.x + v2.x, v1.y + v2.y);
const sub = (v1, v2) => v(v1.x - v2.x, v1.y - v2.y);
const scale = (v1, s) => v(v1.x * s, v1.y * s);
const mag = (v1) => Math.hypot(v1.x, v1.y);
const normalize = (v1) => {
  const m = mag(v1);
  return m === 0 ? v(0, 0) : scale(v1, 1 / m);
};
const perp = (v1) => v(-v1.y, v1.x);
const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max) => Math.random() * (max - min) + min;
// --- End Vector Math Helpers ---

/**
 * Initiates the path drawing process by the user.
 */
export function startPathDrawing(options) {
  console.log("startPathDrawing called"); // LOG A
  return new Promise((resolve, reject) => {
    if (State.get("isDrawingPath")) {
      console.log("startPathDrawing rejected: Already drawing path."); // LOG B
      return reject(new Error("Already drawing path."));
    }
    currentPath = [];
    State.set("generatedPath", []);
    State.set("isDrawingPath", true);
    UI.setStatus("Click and drag on the canvas to draw the generation path. Press Esc to cancel.");
    resolvePathPromise = resolve;
    rejectPathPromise = reject;
    const canvas = UI.elems.canvas;
    console.log("Attaching path drawing listeners"); // LOG C
    canvas.addEventListener("mousedown", handlePathMouseDown);
    window.addEventListener("mousemove", handlePathMouseMove);
    window.addEventListener("mouseup", handlePathMouseUp);
    window.addEventListener("keydown", handlePathKeyDown);
  });
}

// --- Path Drawing Event Handlers ---

function handlePathMouseDown(e) {
    // Basic guards
    if (e.button !== 0 || !State.get("isDrawingPath")) return;
    console.log("handlePathMouseDown"); // LOG D
    const point = pointFromEventOnCanvas(e);
    currentPath = [point];
    State.set("generatedPath", currentPath);
}

function handlePathMouseMove(e) {
    // Only draw if mouse is down (currentPath has points) AND in drawing state
    if (currentPath.length === 0 || !State.get("isDrawingPath")) return;
    // console.log("handlePathMouseMove"); // LOG E (can be very noisy)

    const point = pointFromEventOnCanvas(e);
    const lastPoint = currentPath[currentPath.length - 1];
    const distSq =
        Math.pow(point.x - lastPoint.x, 2) + Math.pow(point.y - lastPoint.y, 2);
    if (distSq > MIN_PATH_DISTANCE_SQ) {
        currentPath.push(point);
        State.set("generatedPath", [...currentPath]);
    }
}

function handlePathMouseUp(e) {
    console.log("handlePathMouseUp triggered. isDrawingPath:", State.get("isDrawingPath"), "Path length:", currentPath.length); // LOG F
    if (!State.get("isDrawingPath")) {
        // cleanupEventListeners(); // Cleanup might happen prematurely here
        return;
    }
    if (e.button !== 0 || currentPath.length < 2) {
        console.log("Cancelling in handlePathMouseUp due to button or path length."); // LOG G
        cancelPathDrawing("Path too short or drawing interrupted.");
        return;
    }
    console.log("Calling finishPathDrawing..."); // LOG H
    finishPathDrawing();
}

function handlePathKeyDown(e) {
    if (e.key === "Escape" && State.get("isDrawingPath")) {
        console.log("handlePathKeyDown: Escape pressed"); // LOG I
        cancelPathDrawing("Path drawing cancelled by user.");
    }
}

// --- Path Drawing Finalization/Cancellation ---

function cleanupEventListeners() {
    console.log("Cleaning up path drawing listeners"); // LOG J
    const canvas = UI.elems.canvas;
    canvas.removeEventListener("mousedown", handlePathMouseDown);
    window.removeEventListener("mousemove", handlePathMouseMove);
    window.removeEventListener("mouseup", handlePathMouseUp);
    window.removeEventListener("keydown", handlePathKeyDown);
    // Clear promise handlers AFTER they are used or cancelled
    resolvePathPromise = null;
    rejectPathPromise = null;
}

function finishPathDrawing() {
    console.log("finishPathDrawing entered."); // LOG K
    if (!resolvePathPromise) {
        console.warn("finishPathDrawing called but promise handler is missing.");
        // Attempt cleanup just in case, though it might have already run
        if (State.get("isDrawingPath")) { // Only cleanup if state wasn't reset
             State.set("isDrawingPath", false);
             cleanupEventListeners();
        }
        return;
    }
    if (currentPath.length < 2) {
        console.log("finishPathDrawing: Path too short, cancelling."); // LOG L
        // cancelPathDrawing will handle cleanup
        return cancelPathDrawing("Path too short.");
    }

    State.set("isDrawingPath", false); // Set state BEFORE generation
    UI.setStatus("Generating polygons...");
    console.log("Generating polygons..."); // LOG M

    const options = window._tempGenOptions || {};
    const finalPath = [...currentPath];

    // --- Potential Hang Point ---
    try {
        const polygons = generatePolygonsFromPath(finalPath, options);
        console.log("Polygon generation complete. Count:", polygons.length); // LOG N

        // Resolve the promise *before* cleaning up
        resolvePathPromise(polygons);

        // Cleanup after resolving
        State.set("generatedPath", finalPath); // Keep path visible
        delete window._tempGenOptions;
        cleanupEventListeners(); // Call cleanup last
        console.log("finishPathDrawing completed successfully."); // LOG O
    } catch (error) {
         console.error("Error during polygon generation:", error); // LOG P
         // Reject the promise if generation fails
         cancelPathDrawing("Error during polygon generation.");
    }
}

function cancelPathDrawing(reason = "Path drawing cancelled.") {
    console.log("cancelPathDrawing called with reason:", reason); // LOG Q
    if (!rejectPathPromise && !resolvePathPromise) { // Check both in case finish started but failed
        console.warn("cancelPathDrawing called but promise handlers missing/already cleared.");
         if (State.get("isDrawingPath")) { // Only cleanup if state wasn't reset
             State.set("isDrawingPath", false);
             cleanupEventListeners();
        }
        return;
    }

    const localReject = rejectPathPromise; // Store locally before cleanup

    // Perform cleanup *before* rejecting
    State.set("isDrawingPath", false);
    State.set("generatedPath", null);
    currentPath = [];
    UI.setStatus(reason);
    delete window._tempGenOptions;
    cleanupEventListeners(); // Call cleanup last

    // Reject the promise if it exists
    if (localReject) {
       localReject(new Error(reason));
       console.log("cancelPathDrawing completed via rejection."); // LOG R
    } else {
        console.warn("cancelPathDrawing: rejectPathPromise was null, couldn't reject."); // LOG S
    }
}


// --- Polygon Generation Logic ---
// (Includes chaotic shapes, skipping, safety checks from previous version)

function generatePolygonsFromPath(path, options) {
    console.log("generatePolygonsFromPath entered. Path length:", path.length); // LOG T
    const allPolygons = [];
    const canvas = UI.elems.canvas;
    if (!canvas) return [];
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const effectiveMinDistance = (options.minDistance || 10) + BASE_MIN_DISTANCE_INCREASE;

    let segmentCounter = 0; // For logging

    for (const offsetSign of [1.0, -1.0]) {
        const polyType = getRandomType(options.typeWeights);
        for (let i = 0; i < path.length - 1; i++) {
            segmentCounter++;
            // console.log(`Processing segment ${i}, offsetSign ${offsetSign}`); // LOG U (can be noisy)

            if (Math.random() < SKIP_CHANCE) {
                // console.log(` -> Segment ${i} skipped.`); // LOG V
                continue;
            }

            const p1 = path[i];
            const p2 = path[i + 1];

            const absVerts = generateRandomPolygonNearSegment(p1, p2, offsetSign, {...options, minDistance: effectiveMinDistance});
            if (!absVerts) {
                 // console.log(` -> Segment ${i} failed vertex gen.`); // LOG W
                 continue;
            }

            if (!isPolygonInCanvas(absVerts, canvasWidth, canvasHeight)) {
                // console.log(` -> Segment ${i} failed canvas check.`); // LOG X
                continue;
            }

            if (!isPolygonSafe(absVerts, path, effectiveMinDistance)) {
                // console.log(` -> Segment ${i} failed safety check.`); // LOG Y
                continue;
            }

            const formattedPolygons = splitAndFormat(absVerts, polyType);
            allPolygons.push(...formattedPolygons);
            // console.log(` -> Segment ${i} processed successfully.`); // LOG Z
        }
    }
    console.log(`generatePolygonsFromPath finished. Processed ${segmentCounter} segments potentialy. Generated ${allPolygons.length} polygons.`); // LOG AA
    return allPolygons;
}

// --- Helper functions ---
// (generateRandomPolygonNearSegment, isPolygonSafe, isPolygonInCanvas, splitAndFormat, getRandomType - these remain the same as the previous version)

/**
 * --- NEW: Generates a random polygon shape near a path segment ---
 * Uses logic inspired by the original auto-generator.
 */
function generateRandomPolygonNearSegment(p1, p2, offsetSign, options) {
  const { minDistance, minVertices = 3, maxVertices = 8, minArea = 1000, maxArea = 10000 } = options; // Added defaults

  // 1. Find midpoint and perpendicular direction
  const midPoint = scale(add(p1, p2), 0.5);
  const segmentVec = sub(p2, p1);
  const len = mag(segmentVec);
  if (len === 0) return null; // Avoid division by zero
  const perpVec = perp(normalize(segmentVec));

  // 2. Calculate offset base center
  const baseCenter = add(midPoint, scale(perpVec, minDistance * offsetSign));

  // 3. Generate random vertices around the base center
  const numVertices = randomInt(minVertices, maxVertices);
  const radiusRange = { min: 30, max: 80 };

  const angles = [];
  for (let i = 0; i < numVertices; i++) {
    angles.push(randomFloat(0, 2 * Math.PI));
  }
  angles.sort();

  const initialVertices = angles.map((angle) => {
    const randomRadius = randomFloat(radiusRange.min, radiusRange.max);
    return {
      x: baseCenter.x + Math.cos(angle) * randomRadius,
      y: baseCenter.y + Math.sin(angle) * randomRadius,
    };
  });

   // Ensure minimum 3 vertices before area calculation
   if (initialVertices.length < 3) return null;

  // 4. Rescale vertices to match target area
  const currentArea = polygonArea(initialVertices);
  if (currentArea < 1) return null;

  const targetArea = randomFloat(minArea, maxArea);
  const scaleFactor = Math.sqrt(targetArea / currentArea);

  const centroid = calculatePolygonCenter(initialVertices); // Use centroid for scaling
  const scaledVertices = initialVertices.map((vtx) => ({
    x: centroid.x + (vtx.x - centroid.x) * scaleFactor,
    y: centroid.y + (vtx.y - centroid.y) * scaleFactor,
  }));

  if (scaledVertices.length < 3) return null; // Final check

  return scaledVertices;
}

function isPolygonSafe(polyVerts, path, minDistance) {
  const minDistSq = (minDistance - 5) * (minDistance - 5);
  for (const polyVert of polyVerts) {
    for (const pathPoint of path) {
      const distSq =
        Math.pow(polyVert.x - pathPoint.x, 2) +
        Math.pow(polyVert.y - pathPoint.y, 2);
      if (distSq < minDistSq) {
        return false;
      }
    }
  }
  return true;
}

function isPolygonInCanvas(vertices, canvasWidth, canvasHeight) {
  if (!vertices || vertices.length === 0) return false;
  for (const v of vertices) {
    if (v.x >= 0 && v.x <= canvasWidth && v.y >= 0 && v.y <= canvasHeight) {
      return true;
    }
  }
  return false;
}

function splitAndFormat(vertices, polyType) {
  if (!vertices || vertices.length < 3) return [];
  const shapeToSplit = { v: vertices.map((p) => [p.x, p.y]) };
  const convexPolygons = splitConcaveIntoConvex(shapeToSplit);
  if (!convexPolygons || convexPolygons.length === 0) return [];
  return convexPolygons.map((convexPoly) => {
    const absoluteVertices = convexPoly.v.map((p) => ({ x: p[0], y: p[1] }));
    const c = calculatePolygonCenter(absoluteVertices);
    const v = absoluteVertices.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    return { type: "poly", c, v, a: 0, scale: 1, polyType };
  });
}

function getRandomType(weights) {
  const totalWeight = Object.values(weights || {none: 1}).reduce((a, b) => a + b, 0); // Added default
  if (totalWeight === 0) return "none";
  let rand = Math.random() * totalWeight;
  const safeWeights = weights || {none: 1}; // Use default if needed
  for (const type in safeWeights) {
    if (rand < safeWeights[type]) return type;
    rand -= safeWeights[type];
  }
  return "none";
}