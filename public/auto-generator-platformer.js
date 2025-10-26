// public/auto-generator-platformer.js
// Refactored generator with non-self-intersecting random-walk polygon generation.

import { calculatePolygonCenter, polygonArea, splitConcaveIntoConvex } from "./utils-client.js";
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
  },

  // Object Category 2 (was "platforms")
  objectCat2: {
    countRange: [5, 10],
    minVertices: 3,
    maxVertices: 6,
    minArea: 5000,
    maxArea: 20000,
    typeWeights: { none: 1, bouncy: 1, death: 1 },
  },

  // Object Category 3 (was "floaters")
  objectCat3: {
    countRange: [8, 15],
    minVertices: 3,
    maxVertices: 6,
    minArea: 1000,
    maxArea: 7500,
    typeWeights: { none: 1, bouncy: 1, death: 1 },
  },

  // General
  maxPlacementAttempts: 30,
  canvasPadding: 0,
};
// --- End CONFIG ---

// ---------------- Random helpers ----------------
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function getRandomType(weights) {
  const safe = weights && typeof weights === "object" ? weights : { none: 1 };
  const entries = Object.entries(safe).filter(([k, v]) => typeof v === "number" && v >= 0 && k !== "__proto__");
  if (entries.length === 0) return "none";
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return entries[0][0] || "none";
  let r = randomFloat(0, total);
  for (const [k, w] of entries) {
    if (r < w) return k;
    r -= w;
  }
  return entries[entries.length - 1][0];
}

// ---------------- Geometry utilities ----------------
function calculateBoundingBox(vertices) {
  if (!vertices || vertices.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  return { minX, minY, maxX, maxY };
}

function doBoundsOverlap(box1, box2, padding = 0) {
  return (
    box1.minX < box2.maxX + padding &&
    box1.maxX > box2.minX - padding &&
    box1.minY < box2.maxY + padding &&
    box1.maxY > box2.minY - padding
  );
}

function isPolygonInCanvas(vertices, canvasWidth, canvasHeight) {
  if (!vertices || vertices.length === 0) return false;
  for (const v of vertices) {
    if (v.x >= 0 && v.x <= canvasWidth && v.y >= 0 && v.y <= canvasHeight) return true;
  }
  return false;
}

// Robust segment intersection (excluding touching at shared vertex indices)
function orientation(a, b, c) {
  const val = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : 2; // 1 -> clockwise, 2 -> counterclockwise
}
function onSegment(a, b, c) {
  return (
    Math.min(a.x, b.x) - 1e-9 <= c.x && c.x <= Math.max(a.x, b.x) + 1e-9 &&
    Math.min(a.y, b.y) - 1e-9 <= c.y && c.y <= Math.max(a.y, b.y) + 1e-9
  );
}
function segmentsIntersect(p1, p2, q1, q2) {
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, p2, q2)) return true;
  if (o3 === 0 && onSegment(q1, q2, p1)) return true;
  if (o4 === 0 && onSegment(q1, q2, p2)) return true;
  return false;
}

// ---------------- Polygon generation (non-self-intersecting) ----------------
/*****
 * Create a non-self-intersecting polygon by building vertices sequentially.
 * Strategy:
 *  - Build a local vertex chain with random-walk steps.
 *  - For each new candidate vertex, ensure the new edge doesn't intersect any existing non-adjacent edges.
 *  - Limit attempts per vertex; on failure restart polygon generation (to avoid brute forcing).
 *  - After full chain built, ensure closing edge doesn't intersect others.
 *  - Recentre, scale to area target, and translate to fit canvas.
 *****/
function generateRandomVertices(opts, canvasWidth, canvasHeight) {
  const padding = CONFIG.canvasPadding || 0;
  const maxPolygonAttempts = Math.max(6, CONFIG.maxPlacementAttempts || 30);
  const perVertexAttempts = 12;

  function generateLocalWalk(numVertices, targetArea) {
    // turn limit keeps shapes generally non-windy but we still guard via intersection tests
    const maxTurn = Math.PI * 0.9;

    // step size estimated from area and vertex count (heuristic)
    const baseline = Math.sqrt(Math.max(1, targetArea) / Math.max(3, numVertices));
    const minStep = Math.max(1, baseline * 0.35);
    const maxStep = Math.max(minStep + 0.1, baseline * 1.8);

    for (let globalTry = 0; globalTry < 3; globalTry++) {
      const verts = [];
      let angle = randomFloat(0, Math.PI * 2);
      let x = 0, y = 0;
      verts.push({ x, y });

      let failed = false;
      for (let i = 1; i < numVertices; i++) {
        let placed = false;
        for (let tryV = 0; tryV < perVertexAttempts; tryV++) {
          const delta = randomFloat(-maxTurn, maxTurn);
          const newAngle = angle + delta;
          const step = randomFloat(minStep, maxStep);
          const nx = x + Math.cos(newAngle) * step;
          const ny = y + Math.sin(newAngle) * step;
          const candidate = { x: nx, y: ny };

          // reject near-duplicate point
          const dx = nx - x, dy = ny - y;
          if (Math.hypot(dx, dy) < 1e-3) continue;

          // check intersection of new edge (last->candidate) with all existing edges except adjacent ones
          const lastIdx = verts.length - 1;
          let intersects = false;
          for (let e = 0; e < verts.length - 2; e++) {
            const a = verts[e];
            const b = verts[e + 1];
            if (segmentsIntersect(verts[lastIdx], candidate, a, b)) {
              intersects = true;
              break;
            }
          }

          if (intersects) continue;

          // tentative accept
          verts.push(candidate);
          x = nx; y = ny; angle = newAngle; placed = true; break;
        }
        if (!placed) { failed = true; break; }
      }

      if (failed) continue; // retry globalTry

      // closing edge check (last -> first) should not intersect any non-adjacent edges
      const n = verts.length;
      if (n >= 3) {
        let closesOK = true;
        for (let e = 1; e < n - 2; e++) {
          if (segmentsIntersect(verts[n - 1], verts[0], verts[e], verts[e + 1])) {
            closesOK = false; break;
          }
        }
        if (!closesOK) continue; // retry
      }

      return verts;
    }
    return null;
  }

  for (let attempt = 0; attempt < maxPolygonAttempts; attempt++) {
    const numVertices = randomInt(opts.minVertices || 3, opts.maxVertices || 6);
    const targetArea = Math.max(1, randomFloat(opts.minArea || 1, opts.maxArea || opts.minArea || 1));
    const local = generateLocalWalk(numVertices, targetArea);
    if (!local) continue;

    // recenter to centroid
    const centroid = calculatePolygonCenter(local);
    if (!centroid) continue;
    const recentered = local.map((p) => ({ x: p.x - centroid.x, y: p.y - centroid.y }));

    const currentArea = polygonArea(recentered);
    if (!isFinite(currentArea) || Math.abs(currentArea) < 1e-6) continue;

    const scale = Math.sqrt(Math.abs(targetArea / currentArea));
    const scaled = recentered.map((p) => ({ x: p.x * scale, y: p.y * scale }));

    // compute bounding box for the scaled polygon
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of scaled) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const allowedMinCenterX = padding - minX;
    const allowedMaxCenterX = canvasWidth - padding - maxX;
    const allowedMinCenterY = padding - minY;
    const allowedMaxCenterY = canvasHeight - padding - maxY;

    if (allowedMinCenterX > allowedMaxCenterX || allowedMinCenterY > allowedMaxCenterY) continue; // can't fit

    const centerX = randomFloat(allowedMinCenterX, allowedMaxCenterX);
    const centerY = randomFloat(allowedMinCenterY, allowedMaxCenterY);

    const abs = scaled.map((p) => ({ x: p.x + centerX, y: p.y + centerY }));

    // final safety check - should be redundant but be strict
    let outside = false;
    for (const v of abs) {
      if (v.x < padding || v.x > canvasWidth - padding || v.y < padding || v.y > canvasHeight - padding) { outside = true; break; }
    }
    if (outside) continue;

    return abs;
  }

  return null;
}

// ---------------- Split & format ----------------
function splitAndFormat(vertices, polyType) {
  if (!vertices || vertices.length < 3) return [];
  const shape = { v: vertices.map((p) => [p.x, p.y]) };
  const convex = splitConcaveIntoConvex(shape);
  if (!convex || convex.length === 0) return [];
  const formatted = convex
    .map((cp) => {
      const abs = cp.v.map((p) => ({ x: p[0], y: p[1] }));
      if (abs.length < 3) return null;
      const c = calculatePolygonCenter(abs);
      if (!c) return null;
      const v = abs.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
      return { type: "poly", c, v, a: 0, scale: 1, polyType };
    })
    .filter(Boolean);
  return formatted;
}

// ---------------- Safe config updater ----------------
function safeDeepMerge(target, patch) {
  if (!patch || typeof patch !== "object") return target;
  const stack = [[target, patch]];
  while (stack.length) {
    const [t, p] = stack.pop();
    for (const key of Object.keys(p)) {
      if (key === "__proto__" || key === "constructor") continue;
      const pv = p[key];
      if (pv && typeof pv === "object" && !Array.isArray(pv)) {
        if (!t[key] || typeof t[key] !== "object" || Array.isArray(t[key])) t[key] = {};
        stack.push([t[key], pv]);
      } else {
        t[key] = pv;
      }
    }
  }
  return target;
}

function updatePlatformerConfig(patch) {
  if (typeof patch === "function") {
    try {
      const result = patch(JSON.parse(JSON.stringify(CONFIG)));
      if (result && typeof result === "object") {
        safeDeepMerge(CONFIG, result);
        console.info("CONFIG updated via function patch.");
      } else {
        console.warn("Function did not return an object. CONFIG not modified.");
      }
    } catch (err) {
      console.error("Error applying function patch:", err);
    }
  } else if (patch && typeof patch === "object") {
    safeDeepMerge(CONFIG, patch);
    // console.info("CONFIG patched.");
  } else {
    console.warn("updatePlatformerConfig expects an object patch or a function returning a patch.");
  }
  // console.log("Current CONFIG:", JSON.parse(JSON.stringify(CONFIG)));
}

if (typeof window !== "undefined") {
  window.PLATFORMER_CONFIG = CONFIG;
  window.UPDATE_PLATFORMER_CONFIG = updatePlatformerConfig;
}

// ---------------- Main generator ----------------
export function generatePlatformerMap(options = {}) {
  const canvas = UI.elems && UI.elems.canvas;
  if (!canvas) return [];
  const { width: canvasWidth, height: canvasHeight } = canvas;

  const allPlaced = []; // { bounds, passKey, convexPolygons, polyType }

  const uiOpts = {
    minDistance: typeof options.minDistance === "number" ? options.minDistance : 20,
    overrides: options.overrides || {},
  };

  function placeForCategory(passKey) {
    const cfg = CONFIG[passKey];
    if (!cfg) return 0;
    const count = randomInt(cfg.countRange[0], cfg.countRange[1]);
    let placed = 0;

    for (let i = 0; i < count; i++) {
      let success = false;
      for (let attempt = 0; attempt < CONFIG.maxPlacementAttempts; attempt++) {
        const vertices = generateRandomVertices({ ...cfg, ...uiOpts.overrides[passKey] }, canvasWidth, canvasHeight);
        if (!vertices) continue;
        if (!isPolygonInCanvas(vertices, canvasWidth, canvasHeight)) continue;
        const bounds = calculateBoundingBox(vertices);

        // Check overlaps
        let overlaps = false;
        for (const ex of allPlaced) {
          if (doBoundsOverlap(bounds, ex.bounds, uiOpts.minDistance)) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) continue;

        const chosenType = getRandomType(cfg.typeWeights);

        const convexResult = splitConcaveIntoConvex({ v: vertices.map((p) => [p.x, p.y]) });
        if (!convexResult || convexResult.length === 0) continue;

        const convexForStorage = convexResult.map((cp) => ({ v: cp.v }));

        allPlaced.push({ bounds, passKey, convexPolygons: convexForStorage, polyType: chosenType });
        placed++;
        success = true;
        break;
      }
      if (!success) {
        // failed to place this item after attempts; continue to next
      }
    }

    console.log(`Placed ${placed} / ${count} items for ${passKey}`);
    return placed;
  }

  placeForCategory("objectCat1");
  placeForCategory("objectCat2");
  placeForCategory("objectCat3");

  const finalPolys = [];
  for (const data of allPlaced) {
    for (const cp of data.convexPolygons) {
      const abs = cp.v.map((p) => ({ x: p[0], y: p[1] }));
      if (abs.length < 3) continue;
      const formatted = splitAndFormat(abs, data.polyType);
      for (const f of formatted) finalPolys.push(f);
    }
  }

  if (typeof window !== "undefined") {
    window.PLATFORMER_CONFIG = CONFIG;
  }

  console.log(`Successfully generated ${finalPolys.length} final convex polygons.`);
  return finalPolys;
}
