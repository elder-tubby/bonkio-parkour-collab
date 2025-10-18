// auto-generator.js (Replaces the entire file)

import { splitConcaveIntoConvex } from "./splitConvex.js";
import { calculatePolygonCenter, polygonArea } from "./utils-client.js";
import UI from "./ui.js";

// --- Default Configuration ---
// These are fallbacks if options aren't provided
const DEFAULT_OPTIONS = {
  maxPolygons: 50,
  generationAttemptsPerPolygon: 50,
  consecutiveFailLimit: 10,
  minDistance: 10,
  minVertices: 4,
  maxVertices: 12,
  minArea: 8000,
  maxArea: 30000,
  radiusRange: { min: 50, max: 200 }, // Internal tuning value
  typeWeights: { none: 1, bouncy: 1, death: 1 },
};

// --- Helper Functions ---

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Selects a random polygon type based on the defined weights.
 */
function getRandomType(weights) {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return "none"; // Safety fallback

  let rand = randomFloat(0, totalWeight);

  for (const type in weights) {
    if (rand < weights[type]) {
      return type;
    }
    rand -= weights[type];
  }
  return "none"; // Fallback
}

/**
 * Calculates the Axis-Aligned Bounding Box (AABB) for a set of vertices.
 * @returns {object} { minX, minY, maxX, maxY }
 */
function calculateBoundingBox(vertices) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Checks if two bounding boxes overlap, with an optional padding.
 * Note: Even with 0 padding, this ensures non-overlap.
 */
function doBoundsOverlap(box1, box2, padding = 0) {
  return (
    box1.minX < box2.maxX + padding &&
    box1.maxX > box2.minX - padding &&
    box1.minY < box2.maxY + padding &&
    box1.maxY > box2.minY - padding
  );
}

/**
 * Generates a set of random, scaled vertices around a given center point.
 */
function generateRandomVertices(center, opts) {
  const numVertices = randomInt(opts.minVertices, opts.maxVertices);

  // 1. Generate random vertices in a "star" shape
  const angles = [];
  for (let i = 0; i < numVertices; i++) {
    angles.push(randomFloat(0, 2 * Math.PI));
  }
  angles.sort(); // Sort angles to create a simple (non-self-intersecting) polygon

  const vertices = angles.map((angle) => {
    const randomRadius = randomFloat(
      opts.radiusRange.min,
      opts.radiusRange.max,
    );
    return {
      x: center.x + Math.cos(angle) * randomRadius,
      y: center.y + Math.sin(angle) * randomRadius,
    };
  });

  // 2. Rescale vertices to match target area
  const currentArea = polygonArea(vertices);
  if (currentArea === 0) return null; // Degenerate polygon

  const targetArea = randomFloat(opts.minArea, opts.maxArea);
  const scaleFactor = Math.sqrt(targetArea / currentArea);

  const centroid = calculatePolygonCenter(vertices);
  const scaledVertices = vertices.map((v) => ({
    x: centroid.x + (v.x - centroid.x) * scaleFactor,
    y: centroid.y + (v.y - centroid.y) * scaleFactor,
  }));

  return scaledVertices;
}

/**
 * Takes absolute vertices, splits them into convex polys, and formats for the server.
 */
function splitAndFormat(vertices, polyType) {
  // 1. Split into convex polygons
  const shapeToSplit = { v: vertices.map((p) => [p.x, p.y]) };
  const convexPolygons = splitConcaveIntoConvex(shapeToSplit);

  if (!convexPolygons || convexPolygons.length === 0) {
    return [];
  }

  // 2. Format for server (relative vertices + center)
  return convexPolygons.map((convexPoly) => {
    const absoluteVertices = convexPoly.v.map((p) => ({ x: p[0], y: p[1] }));
    const c = calculatePolygonCenter(absoluteVertices);
    const v = absoluteVertices.map((p) => ({
      x: p.x - c.x,
      y: p.y - c.y,
    }));
    return {
      type: "poly",
      c: c,
      v: v,
      a: 0,
      scale: 1,
      polyType: polyType,
    };
  });
}

/**
 * Main generation function.
 * Exports as `generate` which is imported as `generateMap` in handlers.js
 */
export function generate(options = {}) {
  // Merge user options with defaults
  const opts = { ...DEFAULT_OPTIONS, ...options };
  // Make sure radius range is nested
  opts.radiusRange = DEFAULT_OPTIONS.radiusRange;

  const canvas = UI.elems.canvas;
  if (!canvas) {
    console.error("Canvas not found");
    return [];
  }

  // Define a margin so polygons don't generate right on the edge
  const margin = opts.radiusRange.max * 0.5;
  const allGeneratedPolygons = [];
  const allGeneratedBounds = [];

  let consecutiveFails = 0;

  while (
    allGeneratedPolygons.length < opts.maxPolygons &&
    consecutiveFails < opts.consecutiveFailLimit
  ) {
    let placedPolygon = false;

    for (
      let attempt = 0;
      attempt < opts.generationAttemptsPerPolygon;
      attempt++
    ) {
      // 1. Get random center
      const randomCenter = {
        x: randomFloat(margin, canvas.width - margin),
        y: randomFloat(margin, canvas.height - margin),
      };

      // 2. Generate vertices
      const vertices = generateRandomVertices(randomCenter, opts);
      if (!vertices) continue; // Failed (e.g., degenerate polygon)

      // 3. Get bounding box
      const newBounds = calculateBoundingBox(vertices);

      // 4. Check for overlap with existing polygons
      let overlaps = false;
      for (const existingBounds of allGeneratedBounds) {
        if (doBoundsOverlap(newBounds, existingBounds, opts.minDistance)) {
          overlaps = true;
          break;
        }
      }

      // 5. If no overlap, accept it
      if (!overlaps) {
        const polyType = getRandomType(opts.typeWeights);
        const convexPolygons = splitAndFormat(vertices, polyType);

        allGeneratedPolygons.push(...convexPolygons);
        allGeneratedBounds.push(newBounds); // Store the *original* bounding box
        placedPolygon = true;
        consecutiveFails = 0; // Reset fail counter
        break; // Exit attempt loop, move to next polygon
      }
    } // end attempt loop

    if (!placedPolygon) {
      consecutiveFails++;
    }
  } // end while loop

  if (consecutiveFails >= opts.consecutiveFailLimit) {
    console.warn(
      `Stopping generation: Failed to place ${opts.consecutiveFailLimit} polygons in a row. Canvas is likely full.`,
    );
  }

  console.log(`Successfully generated ${allGeneratedPolygons.length} polygons.`);
  return allGeneratedPolygons;
}