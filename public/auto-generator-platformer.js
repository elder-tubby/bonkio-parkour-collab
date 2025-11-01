// public/auto-generator-platformer.js
// Generates random polygons in categorized "zones".
// Relies on shared utilities from utils-client.js.

import {
    calculateBoundingBox,
    calculatePolygonCenter,
    doBoundsOverlap,
    generateRandomVertices,
    getRandomType,
    isPolygonInCanvas,
    makeConfigEditable,
    randomFloat,
    randomInt,
    safeDeepMerge,
    splitAndFormatPolygons,
    translateVertices,
} from "./utils-client.js";
import UI from "./ui.js";

// --- Configuration ---
const CONFIG = {
  // Object Category 1 (was "floors")
  objectCat1: {
    countRange: [2, 4],
    minVertices: 3,
    maxVertices: 6,
    minArea: 30000,
    maxArea: 80000,
    typeWeights: { none: 1, bouncy: 1, death: 1 },
    // New: Placement zone [minY, maxY] as fractions of canvas height
    placementZone: [0.7, 1.0], 
  },
  // Object Category 2 (was "platforms")
  objectCat2: {
    countRange: [5, 10],
    minVertices: 3,
    maxVertices: 6,
    minArea: 5000,
    maxArea: 20000,
    typeWeights: { none: 1, bouncy: 1, death: 1 },
    placementZone: [0.4, 0.7],
  },
  // Object Category 3 (was "floaters")
  objectCat3: {
    countRange: [8, 15],
    minVertices: 3,
    maxVertices: 6,
    minArea: 1000,
    maxArea: 7500,
    typeWeights: { none: 1, bouncy: 1, death: 1 },
    placementZone: [0.1, 0.4],
  },
  // General
  maxPlacementAttempts: 30,
  canvasPadding: 10,
};
// --- End CONFIG ---

// --- Expose CONFIG for console editing ---
// Use a unique name to avoid conflicts
makeConfigEditable("PLATFORMER_CONFIG", CONFIG, (patch) => {
  safeDeepMerge(CONFIG, patch);
});
// --- End Expose ---


// --- Main generator ---
export function generatePlatformerMap(options = {}) {
  const canvas = UI.elems && UI.elems.canvas;
  if (!canvas) return [];
  const { width: canvasWidth, height: canvasHeight } = canvas;

  const allPlaced = []; // { bounds, convexPolygons, polyType }

  const uiOpts = {
    minDistance: typeof options.minDistance === "number" ? options.minDistance : 20,
    overrides: options.overrides || {}, // Not currently used, but good pattern
  };
  const padding = CONFIG.canvasPadding;

  function placeForCategory(passKey) {
    const cfg = CONFIG[passKey];
    if (!cfg) return 0;
    const count = randomInt(cfg.countRange[0], cfg.countRange[1]);
    let placed = 0;

    // Determine placement bounds
    const minY = (cfg.placementZone ? cfg.placementZone[0] : 0) * canvasHeight;
    const maxY = (cfg.placementZone ? cfg.placementZone[1] : 1) * canvasHeight;
    const minX = padding;
    const maxX = canvasWidth - padding;

    for (let i = 0; i < count; i++) {
      let success = false;
      for (let attempt = 0; attempt < CONFIG.maxPlacementAttempts; attempt++) {

        // 1. Generate local vertices
        const localVertices = generateRandomVertices(cfg);
        if (!localVertices) continue;

        // 2. Find a random center point *within the allowed zone*
        const center = {
          x: randomFloat(minX, maxX),
          y: randomFloat(minY, maxY),
        };

        // 3. Translate to absolute position
        const vertices = translateVertices(localVertices, center);

        if (!isPolygonInCanvas(vertices, canvasWidth, canvasHeight)) continue;
        const bounds = calculateBoundingBox(vertices);

        // 4. Check for overlaps if required
        let overlaps = false;
        for (const ex of allPlaced) {
          if (doBoundsOverlap(bounds, ex.bounds, uiOpts.minDistance)) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) continue;

        const chosenType = getRandomType(cfg.typeWeights);

        // 5. Store data
        allPlaced.push({ 
          bounds, 
          absoluteVertices: vertices, // Store absolute vertices for formatting
          polyType: chosenType 
        });
        placed++;
        success = true;
        break;
      }
    }
    console.log(`Placed ${placed} / ${count} items for ${passKey}`);
    return placed;
  }

  // Run placement for all categories
  placeForCategory("objectCat1");
  placeForCategory("objectCat2");
  placeForCategory("objectCat3");

  // --- Final Formatting ---
  const finalPolys = [];
  for (const data of allPlaced) {
    // Split and format using the absolute vertices
    const formatted = splitAndFormatPolygons(data.absoluteVertices, data.polyType);
    finalPolys.push(...formatted);
  }

  console.log(`Successfully generated ${finalPolys.length} final convex polygons.`);
  return finalPolys;
}